/** Fail-closed contract for privileged production sessions.
 * This module does not implement an MFA provider; it only validates an assertion
 * produced by one and makes session/re-authentication boundaries explicit.
 */
import { PRIVILEGED_SESSION_MAX_AGE_MS, privilegedMfaReady, type PrivilegedRole } from "./safety";

export const PRIVILEGED_REAUTH_MAX_AGE_MS = 5 * 60 * 1000;
export type PrivilegedSession = {
  userId: number;
  role: PrivilegedRole;
  issuedAt: number;
  expiresAt: number;
  revokedAt?: number | null;
  mfaVerifiedAt?: number | null;
};
export type PrivilegedAccess = { session: PrivilegedSession | null; now?: number; destructive?: boolean; reauthenticatedAt?: number | null; env?: Record<string, string | undefined> };

export function canUsePrivilegedSession(input: PrivilegedAccess): boolean {
  const { session, now = Date.now(), env = process.env } = input;
  if (!session || !privilegedMfaReady(env)) return false;
  if (!Number.isFinite(session.issuedAt) || !Number.isFinite(session.expiresAt)) return false;
  if (session.expiresAt - session.issuedAt > PRIVILEGED_SESSION_MAX_AGE_MS) return false;
  if (now < session.issuedAt || now >= session.expiresAt || (session.revokedAt != null && now >= session.revokedAt)) return false;
  return session.mfaVerifiedAt != null && session.mfaVerifiedAt >= session.issuedAt && session.mfaVerifiedAt <= now;
}

export function canPerformPrivilegedAction(input: PrivilegedAccess): boolean {
  if (!canUsePrivilegedSession(input)) return false;
  if (!input.destructive) return true;
  const now = input.now ?? Date.now();
  return input.reauthenticatedAt != null && now >= input.reauthenticatedAt && now - input.reauthenticatedAt <= PRIVILEGED_REAUTH_MAX_AGE_MS;
}

export const PRIVILEGED_ACCESS_CONTRACT = {
  sessionMaxAgeMs: PRIVILEGED_SESSION_MAX_AGE_MS,
  destructiveReauthMaxAgeMs: PRIVILEGED_REAUTH_MAX_AGE_MS,
  productionMfa: "required-and-provider-assertion-validated",
  revocation: "checked-on-every-request",
} as const;
