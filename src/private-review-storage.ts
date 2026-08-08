/**
 * Least-privilege storage and signed access contract for quarantined photos.
 *
 * This module intentionally has no relationship to the public profile-photo
 * store. Providers return bytes only; review URLs are never persisted or
 * returned. Production must inject a private provider (for example, a private
 * object-store adapter) and enable both required configuration flags.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { canReviewPhoto, privateReviewStorageReady, quarantineHidesPhoto, type QuarantineStatus } from "./photo-quarantine";

export const REVIEW_ACCESS_TTL_SECONDS = 5 * 60;
const TOKEN_VERSION = "v1";
const KEY_RE = /^[A-Za-z0-9][A-Za-z0-9/_-]{0,511}$/;

export type ReviewRole = "owner" | "admin" | "moderator";
export type PrivateReviewProvider = {
  put: (objectKey: string, bytes: Uint8Array, contentType: string) => Promise<void>;
  get: (objectKey: string) => Promise<Uint8Array>;
  delete: (objectKey: string) => Promise<void>;
};
export type ReviewCase = { caseId: string; objectKey: string; status: QuarantineStatus; legalHold?: boolean };
export type ReviewPrincipal = { userId: number; role: unknown; reauthenticatedAt?: number; suspended?: boolean };
export type ReviewAccess = { token: string; expiresAt: number };

export class PrivateReviewUnavailableError extends Error { constructor() { super("Private review storage is unavailable"); this.name = "PrivateReviewUnavailableError"; } }
export class ReviewAccessDeniedError extends Error { constructor() { super("Private review access denied"); this.name = "ReviewAccessDeniedError"; } }

export function privateReviewReady(env: Record<string, string | undefined> = process.env): boolean {
  return privateReviewStorageReady(env) && typeof env.GRADEDATE_REVIEW_SIGNING_KEY === "string" && env.GRADEDATE_REVIEW_SIGNING_KEY.trim().length >= 32;
}

function assertKey(key: string): void {
  if (!KEY_RE.test(key) || key.includes("..")) throw new Error("Invalid private review object key");
}
function b64(value: string | Uint8Array): string {
  return Buffer.from(value).toString("base64url");
}
function sign(value: string, secret: string): string { return createHmac("sha256", secret).update(value).digest("base64url"); }
function secretFrom(env: Record<string, string | undefined>): string {
  const secret = env.GRADEDATE_REVIEW_SIGNING_KEY;
  if (!privateReviewReady(env) || !secret) throw new PrivateReviewUnavailableError();
  return secret;
}

/** Store bytes without ever producing a public URL or accepting a public-store path. */
export async function quarantinePhoto(provider: PrivateReviewProvider, objectKey: string, bytes: Uint8Array, contentType: string, env: Record<string, string | undefined> = process.env): Promise<void> {
  secretFrom(env);
  assertKey(objectKey);
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) throw new Error("Private review bytes are required");
  await provider.put(objectKey, bytes, contentType);
}

export function issueReviewAccess(caseRecord: ReviewCase, principal: ReviewPrincipal, now = Date.now(), env: Record<string, string | undefined> = process.env): ReviewAccess {
  const secret = secretFrom(env);
  assertKey(caseRecord.objectKey);
  if (!canReviewPhoto(principal.role) || principal.suspended || !quarantineHidesPhoto(caseRecord.status)) throw new ReviewAccessDeniedError();
  if (!principal.reauthenticatedAt || now - principal.reauthenticatedAt > 5 * 60 * 1000) throw new ReviewAccessDeniedError();
  const expiresAt = Math.floor(now / 1000) + REVIEW_ACCESS_TTL_SECONDS;
  const payload = `${TOKEN_VERSION}.${caseRecord.caseId}.${caseRecord.objectKey}.${expiresAt}`;
  const encodedPayload = b64(payload);
  return { token: `${encodedPayload}.${sign(encodedPayload, secret)}`, expiresAt };
}

export function verifyReviewAccess(token: string, expected: { caseId: string; objectKey: string; principal: ReviewPrincipal }, now = Date.now(), env: Record<string, string | undefined> = process.env): boolean {
  let payload: string, signature: string;
  try { [payload, signature] = token.split(".", 2) as [string, string]; if (!payload || !signature) return false; } catch { return false; }
  const secret = (() => { try { return secretFrom(env); } catch { return null; } })();
  if (!secret || !canReviewPhoto(expected.principal.role) || expected.principal.suspended) return false;
  const expectedSignature = sign(payload, secret);
  if (signature.length !== expectedSignature.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) return false;
  try {
    const decoded = Buffer.from(payload, "base64url").toString("utf8");
    const [version, caseId, objectKey, expiry] = decoded.split(".");
    return version === TOKEN_VERSION && caseId === expected.caseId && objectKey === expected.objectKey && Number.isSafeInteger(Number(expiry)) && Number(expiry) >= Math.floor(now / 1000) && Number(expiry) <= Math.floor(now / 1000) + REVIEW_ACCESS_TTL_SECONDS && KEY_RE.test(objectKey);
  } catch { return false; }
}

/** Access is authorized before bytes are read; callers must not expose this response directly. */
export async function readReviewPhoto(provider: PrivateReviewProvider, token: string, expected: { caseId: string; objectKey: string; principal: ReviewPrincipal }, now = Date.now(), env: Record<string, string | undefined> = process.env): Promise<Uint8Array> {
  if (!verifyReviewAccess(token, expected, now, env)) throw new ReviewAccessDeniedError();
  return provider.get(expected.objectKey);
}

/** Safe audit/JSON representation: never include object keys, tokens, URLs, or bytes. */
export function redactReviewAccess(value: Record<string, unknown>): Record<string, unknown> {
  const out = { ...value };
  for (const key of ["objectKey", "photoPath", "photoUrl", "url", "token", "signedUrl", "bytes"]) delete out[key];
  return out;
}
