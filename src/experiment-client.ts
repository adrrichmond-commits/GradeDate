/**
 * Browser-side experiment client: anonymous stable variant assignment and
 * privacy-safe event recording (framework: see experiment.ts).
 *
 * Privacy:
 *  - The only thing stored is a random anonymous ID in a first-party cookie
 *    (`gd_exp_id`). It is used solely as the deterministic seed for variant
 *    assignment — it is never sent to the server, never logged, and contains
 *    no personal data.
 *  - Events sent to the server carry only {experiment, variant, event, route,
 *    conversion?} — all allowlisted by parseExperimentEvent before the server
 *    logs them.
 *  - Recording is best-effort: any failure (missing CSRF, network, unknown
 *    experiment) is swallowed so experiment telemetry can never affect the
 *    user flow.
 */

import {
  assignVariant,
  EXPERIMENTS,
  getExperiment,
  parseExperimentEvent,
  type ExperimentEventKind,
} from "./experiment";
import { csrfFetch, getCsrfToken } from "./csrf-client";

/** First-party cookie holding the anonymous experiment key. */
export const EXPERIMENT_ANON_ID_COOKIE = "gd_exp_id";
const ANON_ID_MAX_AGE = 60 * 60 * 24 * 365; // 1 year
const ANON_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Minimal storage abstraction (document.cookie in the browser; injectable for tests). */
export interface CookieStore {
  get(name: string): string | null;
  set(name: string, value: string, maxAgeSeconds: number): void;
}

function defaultCookieStore(): CookieStore | null {
  if (typeof document === "undefined" || typeof location === "undefined") return null;
  return {
    get(name) {
      const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
      return match ? decodeURIComponent(match[1]!) : null;
    },
    set(name, value, maxAgeSeconds) {
      const parts = [
        `${name}=${encodeURIComponent(value)}`,
        `Max-Age=${maxAgeSeconds}`,
        "SameSite=Lax",
        "Path=/",
      ];
      // Secure-only on https so local development over http still works.
      if (location.protocol === "https:") parts.push("Secure");
      document.cookie = parts.join("; ");
    },
  };
}

function createAnonymousId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback UUIDv4 (pure randomness — carries no identity).
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Read (and create on first visit) the anonymous experiment ID. Returns null
 * when no cookie storage is available (e.g. server-side rendering).
 */
export function getAnonymousExperimentId(store?: CookieStore): string | null {
  const s = store ?? defaultCookieStore();
  if (!s) return null;
  let id = s.get(EXPERIMENT_ANON_ID_COOKIE);
  if (!id || !ANON_ID_RE.test(id)) {
    id = createAnonymousId();
    s.set(EXPERIMENT_ANON_ID_COOKIE, id, ANON_ID_MAX_AGE);
  }
  return id;
}

/** Per-session memo: variant is a pure function of the anonymous ID. */
const variantCache = new Map<string, string>();

/**
 * Stable variant for the current visitor. Deterministic per anonymous ID, so
 * the assignment survives page loads as long as the cookie persists. Returns
 * null when no anonymous key is available.
 */
export function getExperimentVariant(
  experimentName: string,
  store?: CookieStore,
): string | null {
  if (!getExperiment(experimentName)) return null;
  const id = getAnonymousExperimentId(store);
  if (!id) return null;
  const cacheKey = `${experimentName}\u0000${id}`;
  const cached = variantCache.get(cacheKey);
  if (cached) return cached;
  const variant = assignVariant(experimentName, id);
  variantCache.set(cacheKey, variant);
  return variant;
}

/** Make sure a CSRF token exists so the event POST can be authenticated. */
async function ensureCsrfToken(): Promise<void> {
  if (getCsrfToken()) return;
  try {
    await fetch("/api/csrf");
  } catch {
    // Best-effort; the caller will drop the event rather than block the user.
  }
}

export interface ExperimentEventOptions {
  /** Coarse route where the event occurred (must be in the experiment allowlist). */
  route: string;
  /** Conversion name (required for conversion events; must be allowlisted). */
  conversion?: string;
}

/**
 * Record an exposure or conversion event. Fire-and-forget: the payload is
 * validated client-side against the same allowlist the server enforces, and
 * any failure is swallowed.
 */
export async function recordExperimentEvent(
  experimentName: string,
  kind: ExperimentEventKind,
  options: ExperimentEventOptions,
): Promise<void> {
  const variant = getExperimentVariant(experimentName);
  if (!variant) return;
  const payload = parseExperimentEvent({
    experiment: experimentName,
    variant,
    event: kind,
    route: options.route,
    ...(options.conversion !== undefined ? { conversion: options.conversion } : {}),
  });
  if (!payload) return;
  await ensureCsrfToken();
  try {
    await csrfFetch("/api/experiment-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // Best-effort telemetry — never surface to the user.
  }
}
