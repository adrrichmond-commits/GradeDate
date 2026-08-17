/**
 * Resend inbound → owner-forward for legal@gradedate.app.
 *
 * gradedate.app's MX points at Resend inbound; this module is the webhook
 * receiver Resend POSTs to when mail arrives for legal@gradedate.app. It
 * verifies the request (Svix-signed webhook — Resend's documented contract —
 * or the legacy inbound-route secret header), pulls the email content, and
 * forwards it to the owner's Gmail via the app's existing Resend send path.
 *
 * Security notes:
 * - INBOUND_EMAIL_SECRET gates every request; anything that fails the check
 *   gets a 401 and is never forwarded.
 * - Full message bodies are never logged — only coarse metadata (sender,
 *   subject length, forwarded flag).
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { sendInboundForwardEmail } from "./email";
import { logInfo, logWarn } from "./observability";

/** Fixed forwarding destination (owner Gmail, decided 2026-08-17). */
export const INBOUND_FORWARD_TO = "adrrichmond15@gmail.com";
/** Max accepted body size for a forwarded email (chars) — beyond that the
 *  plain-text fallback is used so huge HTML payloads cannot bloat the send. */
const FORWARD_HTML_MAX = 200_000;
/** Svix/standardwebhooks timestamp tolerance (±5 minutes). */
const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

export interface InboundEmailContent {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string | null;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function hmacSha256Base64(key: string, data: string): string {
  return createHmac("sha256", key).update(data).digest("base64");
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Verify a Svix/standardwebhooks signature (Resend's documented webhook
 * contract: `svix-id`, `svix-timestamp`, `svix-signature` headers).
 * Mirrors the `standardwebhooks` npm package used by Resend's own SDK:
 * signed content = `${svixId}.${timestampSeconds}.${rawPayload}`,
 * HMAC-SHA256 keyed with the base64-decoded signing secret (whsec_ prefix
 * stripped), signature header = `v1,<base64>` (space-separated list).
 */
export function verifySvixSignature(
  rawBody: string,
  svixId: string | null,
  svixTimestamp: string | null,
  svixSignature: string | null,
  secret: string,
  nowMs: number = Date.now(),
): boolean {
  if (!svixId || !svixTimestamp || !svixSignature) return false;
  const ts = Number(svixTimestamp);
  if (!Number.isInteger(ts) || ts <= 0) return false;
  const nowSec = Math.floor(nowMs / 1000);
  if (Math.abs(nowSec - ts) > WEBHOOK_TOLERANCE_SECONDS) return false;
  const key = secret.startsWith("whsec_") ? Buffer.from(secret.slice("whsec_".length), "base64").toString("utf8") : secret;
  const toSign = `${svixId}.${ts}.${rawBody}`;
  const expected = hmacSha256Base64(key, toSign);
  return svixSignature.split(" ").some((part) => {
    const [version, signature] = part.split(",");
    return version === "v1" && !!signature && timingSafeEqualStr(signature, expected);
  });
}

/**
 * Gate the inbound webhook. Accepts either:
 *  1. Resend's documented Svix-signed webhook (svix-* headers), or
 *  2. the legacy inbound-route webhook secret header (x-resend-secret).
 * When Svix headers are present they are authoritative — a bad signature is
 * rejected outright rather than falling through to the legacy check.
 */
export function verifyInboundRequest(
  rawBody: string,
  headers: Headers,
  env: Record<string, string | undefined> = process.env,
): boolean {
  const secret = env.INBOUND_EMAIL_SECRET;
  if (!secret) return false;
  const hasSvix = !!(headers.get("svix-id") || headers.get("svix-timestamp") || headers.get("svix-signature"));
  if (hasSvix) {
    return verifySvixSignature(
      rawBody,
      headers.get("svix-id"),
      headers.get("svix-timestamp"),
      headers.get("svix-signature"),
      secret,
    );
  }
  const routeSecret = headers.get("x-resend-secret");
  if (routeSecret) return timingSafeEqualStr(routeSecret, secret);
  return false;
}

/**
 * Parse the webhook payload into the email fields to forward.
 *
 * JSON (`email.received` event): the webhook carries only metadata; the body
 * is fetched from Resend's Received-emails API using RESEND_API_KEY.
 * multipart/form-data: the legacy inbound-route webhook delivers the email
 * fields (from/to/subject/text/html) directly in the form.
 */
export async function parseInboundEvent(
  rawBody: string,
  contentType: string | null,
  fetchJson: (url: string, init?: RequestInit) => Promise<unknown>,
  env: Record<string, string | undefined> = process.env,
): Promise<InboundEmailContent | null> {
  if (contentType && contentType.includes("application/json")) {
    let event: { type?: unknown; data?: { email_id?: unknown; from?: unknown; to?: unknown; subject?: unknown } } | null = null;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return null;
    }
    if (!event || event.type !== "email.received" || typeof event.data?.email_id !== "string") return null;
    const apiKey = env.RESEND_API_KEY;
    if (!apiKey) return null;
    const fetched = await fetchJson(`https://api.resend.com/emails/receiving/${encodeURIComponent(event.data.email_id)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    }).catch(() => null);
    if (!fetched || typeof fetched !== "object") return null;
    const record = fetched as { from?: unknown; to?: unknown; subject?: unknown; text?: unknown; html?: unknown };
    return {
      from: String(record.from ?? ""),
      to: Array.isArray(record.to) ? record.to.map(String).join(", ") : String(record.to ?? ""),
      subject: String(record.subject ?? ""),
      text: record.text == null ? "" : String(record.text),
      html: record.html == null ? null : String(record.html),
    };
  }
  if (contentType && contentType.includes("multipart/form-data")) {
    try {
      const form = await new Response(rawBody, { headers: { "content-type": contentType } }).formData();
      const get = (name: string): string => {
        const v = form.get(name);
        return v == null ? "" : String(v);
      };
      return {
        from: get("from"),
        to: get("to"),
        subject: get("subject"),
        text: get("text"),
        html: get("html") || null,
      };
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * POST /api/inbound-email handler. Returns:
 *   401 — missing/invalid secret (never forwarded)
 *   400 — unparseable payload
 *   200 — forwarded to the owner (forward send acknowledged by Resend)
 *   502 — valid request but the forward send failed
 */
export async function handleInboundEmail(
  req: Request,
  env: Record<string, string | undefined> = process.env,
  deps: {
    sendForward?: typeof sendInboundForwardEmail;
    fetchJson?: (url: string, init?: RequestInit) => Promise<unknown>;
    now?: () => number;
  } = {},
): Promise<Response> {
  const rawBody = await req.text();
  if (!verifyInboundRequest(rawBody, req.headers, env)) {
    logWarn("inbound_email.unauthorized", { length: rawBody.length });
    return json({ error: "Unauthorized" }, 401);
  }
  const content = await parseInboundEvent(
    rawBody,
    req.headers.get("content-type"),
    deps.fetchJson ?? ((url, init) => fetch(url, init)),
    env,
  );
  if (!content) {
    logWarn("inbound_email.unparseable", { length: rawBody.length });
    return json({ error: "Unsupported payload" }, 400);
  }
  const sendForward = deps.sendForward ?? sendInboundForwardEmail;
  const sent = await sendForward({
    to: INBOUND_FORWARD_TO,
    subject: content.subject,
    text: content.text,
    html: content.html && content.html.length <= FORWARD_HTML_MAX ? content.html : null,
    replyTo: content.from,
  });
  logInfo("inbound_email.forwarded", {
    to: INBOUND_FORWARD_TO,
    from: content.from.slice(0, 120),
    subjectLength: content.subject.length,
    sent,
  });
  return json({ ok: true, forwarded: sent }, sent ? 200 : 502);
}
