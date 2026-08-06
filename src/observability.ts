/**
 * Structured JSON observability layer.
 *
 * Everything the app logs goes through here as a single-line JSON record with
 * a stable `event` name, an ISO `time`, a `level`, and coarse redacted fields.
 * No dashboards, no SDKs, no external sinks: this module only formats and
 * prints. An external log/alert sink can be added later by pointing the sink
 * at stdout/stderr (the default), or by wiring `setLogSink` to a transport.
 *
 * Guarantees:
 *  - Stable event names (see EVENTS) — parseable, not free-form text.
 *  - Redaction: sensitive keys, emails, tokens, URLs, paths, and long strings
 *    are redacted/truncated before anything reaches the sink. Message content
 *    never appears because content-like keys are redacted outright and callers
 *    are instructed to log only coarse fields.
 *  - Error normalization is bounded: only `name`, `message`, optional `code`
 *    and a truncated `stack` survive; arbitrary error fields are dropped.
 *  - Serialization is circular-safe and depth-bounded.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/** Stable, versioned event names. Add new names here; never reuse an existing one. */
export const EVENTS = {
  // Requests
  REQUEST_COMPLETE: "request.complete",
  REQUEST_FAILED: "request.failed",
  // Runtime startup
  SERVER_STARTED: "server.started",
  SERVER_DB_INIT_OK: "server.db.init_ok",
  SERVER_DB_INIT_FAILED: "server.db.init_failed",
  SERVER_DB_UNCONFIGURED: "server.db.unconfigured",
  SERVER_ANON_SWEEP_FAILED: "server.anon_sweep_failed",
  VERCEL_DB_INIT_OK: "vercel.db.init_ok",
  VERCEL_DB_INIT_FAILED: "vercel.db.init_failed",
  // Grading
  GRADE_COMPLETED: "grade.completed",
  GRADE_PHOTOS_COMPLETED: "grade.photos_completed",
  GRADE_NSFW_BLOCKED: "grade.nsfw_blocked",
  MODERATION_UNAVAILABLE: "moderation.unavailable",
  MODERATION_REJECTED_CLEANUP: "moderation.rejected_cleanup",
  MODERATION_NSFW_HTTP_ERROR: "moderation.nsfw.http_error",
  MODERATION_NSFW_FAILED: "moderation.nsfw.failed",
  MODERATION_REPORT_RECEIVED: "moderation.report_received",
  GRADE_CARD_PNG_FAILED: "grade_card.png_conversion_failed",
  // Account lifecycle
  ACCOUNT_DELETED: "account.deleted",
  ACCOUNT_PHOTO_CLEANUP: "account.photo_cleanup",
  // Uploads & retention
  UPLOAD_COMPLETED: "upload.completed",
  UPLOAD_REJECTED: "upload.rejected",
  ANON_RETENTION_DELETE_FAILED: "anon_retention.delete_failed",
  ANON_RETENTION_LIST_FAILED: "anon_retention.list_failed",
  ANON_RETENTION_SWEEP_COMPLETE: "anon_retention.sweep_complete",
  ANON_RETENTION_SWEEP_FAILED: "anon_retention.sweep_failed",
  BLOB_STORE_PROVIDER_MISSING: "blob_store.provider_missing",
  BLOB_STORE_TOKEN_MISSING: "blob_store.token_missing",
  BLOB_STORE_CLIENT_UNAVAILABLE: "blob_store.client_unavailable",
  BLOB_STORE_DELETE_FAILED: "blob_store.delete_failed",
  BLOB_STORE_UNSAFE_PATH: "blob_store.unsafe_path",
  // Email & geo providers
  EMAIL_PROVIDER_UNCONFIGURED: "email.provider_unconfigured",
  EMAIL_SEND_FAILED: "email.send_failed",
  GEO_PROVIDER_HTTP_ERROR: "geo.provider.http_error",
  GEO_PROVIDER_FAILED: "geo.provider.failed",
  // Stripe
  STRIPE_UNCONFIGURED: "stripe.unconfigured",
  STRIPE_WEBHOOK_SECRET_MISSING: "stripe.webhook_secret_missing",
  STRIPE_WEBHOOK_SIGNATURE_FAILED: "stripe.webhook.signature_failed",
  STRIPE_WEBHOOK_RECEIVED: "stripe.webhook.received",
  STRIPE_WEBHOOK_UNHANDLED: "stripe.webhook.unhandled",
  STRIPE_WEBHOOK_PROCESSING_FAILED: "stripe.webhook.processing_failed",
  STRIPE_WEBHOOK_NO_USER: "stripe.webhook.no_user",
  STRIPE_WEBHOOK_INCOMPLETE: "stripe.webhook.incomplete",
  STRIPE_UPSELL_GRANTED: "stripe.upsell_granted",
  STRIPE_SUBSCRIPTION_ACTIVATED: "stripe.subscription_activated",
  STRIPE_SUBSCRIPTION_CANCELLED: "stripe.subscription_cancelled",
  STRIPE_FOUNDERS_ASSIGNED: "stripe.founders.assigned",
  STRIPE_FOUNDERS_FULL: "stripe.founders.full",
  STRIPE_REFERRAL_REWARD_APPLIED: "stripe.referral_reward_applied",
  // Matching & chat
  MATCH_LIKE: "match.like",
  MATCH_CREATED: "match.created",
  CHAT_MESSAGE_SENT: "chat.message_sent",
  CHAT_PUSH_FAILED: "chat.push_failed",
  // Auth
  AUTH_REFERRAL_FAILED: "auth.referral.failed",
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

export const EVENT_NAME_RE = /^[a-z][a-z0-9_.-]*$/;

/** Keys whose values are dropped entirely (recursively) before logging. */
const SENSITIVE_KEY_RE =
  /(password|passwd|pwd|secret|token|api[_-]?key|authorization|bearer|cookie|session|signature|email|phone|ssn|cvv|card|referral_code|reset_url|reset_token|webhook_secret|stripe_(secret|customer|subscription|session|id)|blob_(read_write_)?token|message|content|body|bio|feedback|analysis|text|photo|image|url|path|location|city|state|address|latitude|longitude|lat|lng|\bip\b)/i;

// ── Bounds ────────────────────────────────────────────────────
const MAX_STRING = 512;
const MAX_STACK = 1200;
const MAX_DEPTH = 6;
const MAX_KEYS = 40;
const REDACTED = "[REDACTED]";

// ── Value scanners ────────────────────────────────────────────

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const HEX16_RE = /\b[0-9a-fA-F]{16,}\b/g;
const LONG_ALNUM_RE = /\b[A-Za-z0-9_-]{28,}\b/g;
const URL_RE = /https?:\/\/[^\s"'<>)\]}]+/g;
const QUERY_OR_HASH_RE = /[?#].*$/;
const CREDENTIALS_RE = /\/\/([^/@]+)@/;

function truncate(value: string, max = MAX_STRING): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…[+${value.length - max} chars]`;
}

/** Redact credential + query/hash from a URL string, keeping scheme+host+path. */
export function redactUrl(url: string): string {
  let out = url.replace(CREDENTIALS_RE, "//");
  out = out.replace(QUERY_OR_HASH_RE, "");
  // Redact token-like path segments (blob filenames, uuids, long hashes) in
  // place, preserving the surrounding path shape for debugging.
  const segments = out.split("/").map((seg) => redactSegment(seg));
  return segments.join("/");
}

/** Redact token-like segments inside a path-like string, in place. */
export function redactPath(pathname: string): string {
  const withoutQuery = pathname.replace(QUERY_OR_HASH_RE, "");
  const segments = withoutQuery.split("/").map((seg) => redactSegment(seg));
  return segments.join("/");
}

function redactSegment(segment: string): string {
  let seg = segment;
  try {
    seg = decodeURIComponent(seg);
  } catch {
    // Not valid percent-encoding — leave as-is.
  }
  // Replace in place (global regexes are stateless here because we never
  // call .test() on them — only .replace(), which ignores lastIndex).
  seg = seg.replace(UUID_RE, REDACTED);
  seg = seg.replace(HEX16_RE, REDACTED);
  // Long opaque tokens (28+ chars before any dot/hyphen), e.g. blob keys.
  const head = seg.split(/[.-]/)[0] ?? seg;
  if (/^[A-Za-z0-9_-]{28,}$/.test(head)) seg = seg.replace(head, REDACTED);
  return seg;
}

/** Scan a string for emails, tokens, URLs and paths; redact each match in place. */
export function scanString(input: string): string {
  let out = input;
  out = out.replace(EMAIL_RE, REDACTED);
  // Redact full URLs first (so query strings and credentials never leak).
  out = out.replace(URL_RE, (url) => redactUrl(url));
  out = out.replace(UUID_RE, REDACTED);
  out = out.replace(HEX16_RE, REDACTED);
  // Long opaque tokens (jwt-style or base64-ish). Requires 2+ segments or 28+ chars.
  out = out.replace(
    /[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g,
    REDACTED,
  );
  out = out.replace(LONG_ALNUM_RE, REDACTED);
  return truncate(out);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Redact a caller-supplied data payload. Sensitive keys are dropped outright;
 * every remaining string is scanned (emails/tokens/URLs/paths) and truncated.
 * Circular-safe and depth-bounded. Returns a plain, JSON-safe value.
 */
export function redactValue(
  value: unknown,
  seen: WeakSet<object> = new WeakSet(),
  depth = 0,
): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return scanString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return String(value);
  if (typeof value === "function" || typeof value === "symbol") return undefined;

  if (seen.has(value as object)) return REDACTED;
  seen.add(value as object);
  if (depth >= MAX_DEPTH) return REDACTED;

  if (Array.isArray(value)) {
    const out: unknown[] = [];
    for (const item of value) {
      if (out.length >= MAX_KEYS) {
        out.push(REDACTED);
        break;
      }
      out.push(redactValue(item, seen, depth + 1));
    }
    return out;
  }

  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    let keys = 0;
    for (const [key, val] of Object.entries(value)) {
      if (keys >= MAX_KEYS) {
        out[REDACTED] = REDACTED;
        break;
      }
      if (SENSITIVE_KEY_RE.test(key)) {
        out[key] = REDACTED;
      } else {
        out[key] = redactValue(val, seen, depth + 1);
      }
      keys++;
    }
    return out;
  }

  // Date, RegExp, Buffer, etc. — coerce to a scanned string.
  try {
    return scanString(String(value));
  } catch {
    return REDACTED;
  }
}

// ── Error normalization ───────────────────────────────────────

export interface NormalizedError {
  name: string;
  message: string;
  code?: string;
  stack?: string;
}

/**
 * Bounded, sanitized error shape. Only `name`, `message`, `code` and a
 * truncated `stack` are kept; the message and stack are scanned for
 * emails/tokens/paths so error text can never leak sensitive values.
 */
export function normalizeError(error: unknown): NormalizedError {
  if (error instanceof Error) {
    const message = scanString(error.message || String(error));
    const out: NormalizedError = { name: error.name || "Error", message };
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code && code.length <= 64) out.code = code;
    if (error.stack) out.stack = truncate(scanString(error.stack), MAX_STACK);
    return out;
  }
  const raw = typeof error === "string" ? error : JSON.stringify(error) ?? String(error);
  return { name: "UnknownError", message: scanString(raw) };
}

// ── Logger ────────────────────────────────────────────────────

export type LogSink = (line: string) => void;

const defaultSink: LogSink = (line) => {
  // eslint-disable-next-line no-console
  console.log(line);
};

let sink: LogSink = defaultSink;
let configuredLevel: LogLevel = "info";

/** Override the level filter (defaults to env LOG_LEVEL, else "info"). */
export function setLogLevel(level: LogLevel): void {
  configuredLevel = level;
}

/** Replace the output sink (used by tests and future external transports). */
export function setLogSink(next: LogSink | null): void {
  sink = next ?? defaultSink;
}

export function currentLevel(): LogLevel {
  return configuredLevel;
}

function shouldEmit(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[configuredLevel];
}

export interface LogFields {
  [key: string]: unknown;
}

/** Read the request ID previously attached at the server boundary. */
export function requestIdFrom(req: { headers: { get(name: string): string | null } }): string | null {
  return req.headers.get("x-request-id");
}

/** Attach (or preserve) the X-Request-Id response header. */
export function withRequestId(response: Response, requestId: string): Response {
  const headers = new Headers(response.headers);
  if (!headers.has("x-request-id")) headers.set("x-request-id", requestId);
  return new Response(response.body, { status: response.status, headers });
}

/** Envelope keys owned by the logger — caller data may not overwrite them. */
const RESERVED_KEYS = new Set(["v", "time", "level", "event", "msg", "err"]);

function emit(
  level: LogLevel,
  event: string,
  fields: LogFields,
  msg?: string,
): void {
  if (!shouldEmit(level)) return;
  const envelope: LogFields = {
    v: 1,
    time: new Date().toISOString(),
    level,
    event,
  };
  // `err` is normalized separately (bounded shape) — keep it out of the
  // generic redaction pass, which would stringify the whole Error object.
  const rawErr = "err" in fields ? fields.err : undefined;
  const rest: LogFields = { ...fields };
  if ("err" in rest) delete rest.err;
  const data = redactValue(rest) as LogFields;
  for (const [key, value] of Object.entries(data)) {
    if (!RESERVED_KEYS.has(key)) envelope[key] = value;
  }
  if (rawErr !== undefined) envelope.err = normalizeError(rawErr);
  if (msg !== undefined) envelope.msg = scanString(msg);
  sink(JSON.stringify(envelope));
}

/** Structured logger entry points. `event` must be a stable EVENTS name. */
export function log(level: LogLevel, event: string, fields: LogFields = {}, msg?: string): void {
  if (!EVENT_NAME_RE.test(event)) {
    // Never crash the request path over a logging mistake; flag it instead.
    emit(level, "logging.invalid_event", { event }, "Invalid event name passed to logger");
    return;
  }
  emit(level, event, fields, msg);
}

export function logDebug(event: string, fields: LogFields = {}, msg?: string): void {
  log("debug", event, fields, msg);
}
export function logInfo(event: string, fields: LogFields = {}, msg?: string): void {
  log("info", event, fields, msg);
}
export function logWarn(event: string, fields: LogFields = {}, msg?: string): void {
  log("warn", event, fields, msg);
}
export function logError(event: string, fields: LogFields = {}, msg?: string): void {
  log("error", event, fields, msg);
}

// ── Level configuration ───────────────────────────────────────

function applyEnvLevel(): void {
  const fromEnv = (process.env.LOG_LEVEL ?? "").toLowerCase();
  if (fromEnv === "debug" || fromEnv === "info" || fromEnv === "warn" || fromEnv === "error") {
    configuredLevel = fromEnv;
  } else {
    configuredLevel = "info";
  }
}

applyEnvLevel();
