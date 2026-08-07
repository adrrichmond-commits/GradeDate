/**
 * Privacy-safe signed attribution claims.
 *
 * A claim is a tiny, self-contained, signed token that proves "this visitor was
 * exposed to experiment X and assigned variant Y" at issue time — with no
 * identity attached. It is issued server-side (HMAC-SHA256 over a canonical
 * JSON payload) and can later be presented at a downstream conversion boundary
 * (e.g. signup or subscribe) where the server verifies it and attributes the
 * conversion back to the experiment that produced it.
 *
 * Privacy contract (what a claim never contains):
 *  - Exactly five fields are serialized: experiment, variant, issuedAt,
 *    expiresAt, nonce. The serializer builds the payload from those five
 *    fields alone, and the parser rejects any payload with extra or missing
 *    keys — so no gd_exp_id, email, user id, photo path, session id, Stripe
 *    id, or arbitrary caller field can ever ride inside a claim.
 *  - The HMAC secret is always passed in by the caller (env / secret store at
 *    the call site). This module never reads the environment and never
 *    hardcodes a secret.
 *  - TTL is bounded to [7, 14] days at issue time and re-checked at verify
 *    time, so a claim cannot be minted with an unbounded lifetime.
 *  - Verification is replay-safe when the caller supplies a ReplayGuard (a
 *    storage-agnostic nonce journal); a nonce is single-use. Without a guard,
 *    the caller is responsible for replay persistence.
 *
 * The claim token format is `<base64url(payload)>.` + `<hex(hmac-sha256)>`.
 * Verification checks the signature before parsing the payload (constant-time
 * compare) and returns a structured reason for every rejection so callers can
 * log coarse, stable outcomes without leaking anything about the claim.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getExperiment } from "./experiment";

// ── Types ─────────────────────────────────────────────────────

export interface AttributionClaim {
  /** Stable machine name of the experiment (must be in the EXPERIMENTS registry). */
  experiment: string;
  /** Variant assigned to the visitor (must be declared for that experiment). */
  variant: string;
  /** Epoch milliseconds when the claim was issued. */
  issuedAt: number;
  /** Epoch milliseconds when the claim stops being valid. */
  expiresAt: number;
  /** Random single-use id that makes each claim unique (replay guard key). */
  nonce: string;
}

// ── Bounds & formats ──────────────────────────────────────────

/** Minimum allowed claim lifetime: 7 days. */
export const ATTRIBUTION_TTL_MIN_MS = 7 * 24 * 60 * 60 * 1000;
/** Maximum allowed claim lifetime: 14 days. */
export const ATTRIBUTION_TTL_MAX_MS = 14 * 24 * 60 * 60 * 1000;
/** Default lifetime when the caller does not specify one. */
export const ATTRIBUTION_DEFAULT_TTL_MS = ATTRIBUTION_TTL_MAX_MS;

/** The only fields a claim payload may contain, in canonical order. */
const CLAIM_FIELDS = ["experiment", "variant", "issuedAt", "expiresAt", "nonce"] as const;

/** Nonces are 32 lowercase hex chars (16 random bytes). */
const NONCE_RE = /^[0-9a-f]{32}$/;
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;
const HEX_RE = /^[0-9a-f]+$/;

// ── Issuance ──────────────────────────────────────────────────

export interface IssueAttributionClaimOptions {
  /** Stable machine name of the experiment. */
  experiment: string;
  /** Variant to record (must be declared for the experiment). */
  variant: string;
  /** HMAC server secret. Must be supplied by the caller; never hardcoded here. */
  secret: string;
  /** Claim lifetime in ms; must be within [7, 14] days. Defaults to 14 days. */
  ttlMs?: number;
  /** Injectable clock for tests; defaults to Date.now(). */
  now?: number;
  /** Injectable nonce for tests; defaults to 16 random bytes as hex. */
  nonce?: string;
}

/**
 * Mint a claim for a known experiment/variant. Validates the allowlist, the
 * secret, the TTL bounds, the clock, and the nonce format; throws on any
 * violation so a misconfigured caller fails fast at the boundary, never at
 * verify time downstream.
 */
export function issueAttributionClaim(
  options: IssueAttributionClaimOptions,
): AttributionClaim {
  const { experiment, variant, secret } = options;

  const def = getExperiment(experiment);
  if (!def) {
    throw new Error(`issueAttributionClaim: unknown experiment "${experiment}"`);
  }
  if (!def.variants.includes(variant)) {
    throw new Error(
      `issueAttributionClaim: variant "${variant}" is not declared for experiment "${experiment}"`,
    );
  }
  if (typeof secret !== "string" || secret.length === 0) {
    throw new Error("issueAttributionClaim: a non-empty server secret is required");
  }

  const ttlMs = options.ttlMs ?? ATTRIBUTION_DEFAULT_TTL_MS;
  if (!Number.isSafeInteger(ttlMs) || ttlMs < ATTRIBUTION_TTL_MIN_MS || ttlMs > ATTRIBUTION_TTL_MAX_MS) {
    throw new Error(
      `issueAttributionClaim: ttlMs must be within [7, 14] days, got ${String(ttlMs)}`,
    );
  }

  const now = options.now ?? Date.now();
  if (!Number.isSafeInteger(now)) {
    throw new Error("issueAttributionClaim: now must be epoch milliseconds");
  }

  const nonce = options.nonce ?? randomBytes(16).toString("hex");
  if (!NONCE_RE.test(nonce)) {
    throw new Error("issueAttributionClaim: nonce must be 32 lowercase hex chars");
  }

  return { experiment, variant, issuedAt: now, expiresAt: now + ttlMs, nonce };
}

// ── Serialization & signing ───────────────────────────────────

/**
 * Serialize a claim to its canonical JSON payload. The payload is built from
 * exactly the five allowed fields, so any extra properties a caller might
 * attach to the claim object are deliberately dropped.
 */
export function serializeClaimPayload(claim: AttributionClaim): string {
  return JSON.stringify({
    experiment: claim.experiment,
    variant: claim.variant,
    issuedAt: claim.issuedAt,
    expiresAt: claim.expiresAt,
    nonce: claim.nonce,
  });
}

/** HMAC-SHA256 of the payload under the caller-supplied secret, as hex. */
export function signClaimPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

/**
 * Produce the wire format `<base64url(payload)>.<hex(signature)>`. Signing is
 * over the exact serialized payload bytes, so any byte-level change to the
 * payload invalidates the signature (no canonicalization ambiguity).
 */
export function formatAttributionClaim(claim: AttributionClaim, secret: string): string {
  const payload = serializeClaimPayload(claim);
  const signature = signClaimPayload(payload, secret);
  return `${Buffer.from(payload, "utf8").toString("base64url")}.${signature}`;
}

// ── Verification ──────────────────────────────────────────────

/** Stable, coarse, loggable rejection reasons. */
export type ClaimRejectReason =
  | "malformed" // not a token, wrong shape, or payload with wrong fields/types
  | "tampered" // signature does not match the payload under our secret
  | "expired" // now is past expiresAt
  | "not_yet_valid" // now is before issuedAt (clock skew / future-dated)
  | "unknown_experiment" // experiment not in the current registry allowlist
  | "unknown_variant" // variant not declared for that experiment
  | "invalid_ttl" // expiresAt - issuedAt outside the [7, 14] day bounds
  | "replay"; // nonce already seen (single-use claim)

export type ClaimVerification =
  | { ok: true; claim: AttributionClaim }
  | { ok: false; reason: ClaimRejectReason };

/** Storage-agnostic single-use nonce journal (DB-backed in production). */
export interface ReplayGuard {
  has(nonce: string): boolean;
  add(nonce: string): void;
}

export interface VerifyAttributionClaimOptions {
  /** HMAC server secret. Must match the one used at issue time. */
  secret: string;
  /** Injectable clock for tests; defaults to Date.now(). */
  now?: number;
  /**
   * Optional replay guard. When provided, an otherwise-valid claim's nonce is
   * checked and then consumed, so a token can only be redeemed once. When
   * omitted, replay protection is delegated to the caller.
   */
  replayGuard?: ReplayGuard;
}

/**
 * Verify a claim token. Order of checks (each fails closed):
 *  1. structural shape → malformed
 *  2. signature (constant-time) → tampered
 *  3. strict payload parse (exactly the five allowed fields) → malformed
 *  4. experiment/variant allowlist → unknown_experiment / unknown_variant
 *  5. TTL bounds → invalid_ttl
 *  6. time window → expired / not_yet_valid
 *  7. replay guard → replay
 *
 * Rejects everything it cannot positively prove; the only way to get
 * `{ ok: true }` is a validly-signed, allowlisted, in-window, unreplayed claim.
 */
export function verifyAttributionClaim(
  token: unknown,
  options: VerifyAttributionClaimOptions,
): ClaimVerification {
  const now = options.now ?? Date.now();

  // 1. Structural shape: exactly `<base64url>.<hex>`.
  if (typeof token !== "string" || token.length === 0) return { ok: false, reason: "malformed" };
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return { ok: false, reason: "malformed" };
  const payloadB64 = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!BASE64URL_RE.test(payloadB64) || !HEX_RE.test(signature)) {
    return { ok: false, reason: "malformed" };
  }

  let payload: string;
  try {
    payload = Buffer.from(payloadB64, "base64url").toString("utf8");
  } catch {
    return { ok: false, reason: "malformed" };
  }

  // 2. Signature first, constant-time. Anything not signed by our secret is
  //    rejected before we spend any work parsing it.
  const expected = Buffer.from(signClaimPayload(payload, options.secret), "hex");
  const actual = Buffer.from(signature, "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { ok: false, reason: "tampered" };
  }

  // 3. Strict parse: only the five allowed fields, correct types, no extras.
  let raw: unknown;
  try {
    raw = JSON.parse(payload);
  } catch {
    return { ok: false, reason: "malformed" };
  }
  const claim = parseClaimPayload(raw);
  if (!claim) return { ok: false, reason: "malformed" };

  // 4. Allowlist: the experiment and variant must still be known.
  const def = getExperiment(claim.experiment);
  if (!def) return { ok: false, reason: "unknown_experiment" };
  if (!def.variants.includes(claim.variant)) return { ok: false, reason: "unknown_variant" };

  // 5. TTL bounds (re-checked at verify time, independent of the issuer).
  const ttl = claim.expiresAt - claim.issuedAt;
  if (!Number.isSafeInteger(ttl) || ttl < ATTRIBUTION_TTL_MIN_MS || ttl > ATTRIBUTION_TTL_MAX_MS) {
    return { ok: false, reason: "invalid_ttl" };
  }

  // 6. Time window.
  if (now > claim.expiresAt) return { ok: false, reason: "expired" };
  if (now < claim.issuedAt) return { ok: false, reason: "not_yet_valid" };

  // 7. Single-use nonce (only when the caller provides persistence).
  if (options.replayGuard) {
    if (options.replayGuard.has(claim.nonce)) return { ok: false, reason: "replay" };
    options.replayGuard.add(claim.nonce);
  }

  return { ok: true, claim };
}

/**
 * Strict payload parser: exactly the five allowed keys, no more, no fewer, and
 * each with the correct type. Unknown keys (emails, ids, paths, free-form
 * fields) are rejected outright.
 */
function parseClaimPayload(raw: unknown): AttributionClaim | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== CLAIM_FIELDS.length) return null;
  for (const key of keys) {
    if (!(CLAIM_FIELDS as readonly string[]).includes(key)) return null;
  }
  const { experiment, variant, issuedAt, expiresAt, nonce } = record;
  if (typeof experiment !== "string" || experiment.length === 0) return null;
  if (typeof variant !== "string" || variant.length === 0) return null;
  if (typeof issuedAt !== "number" || !Number.isSafeInteger(issuedAt)) return null;
  if (typeof expiresAt !== "number" || !Number.isSafeInteger(expiresAt)) return null;
  if (typeof nonce !== "string" || !NONCE_RE.test(nonce)) return null;
  return { experiment, variant, issuedAt, expiresAt, nonce };
}
