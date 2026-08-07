import { describe, expect, test } from "bun:test";
import { canPerformPrivilegedAction, canUsePrivilegedSession } from "./privileged-session";
const session = { userId: 1, role: "admin" as const, issuedAt: 1_000, expiresAt: 901_000, mfaVerifiedAt: 2_000 };
const env = { NODE_ENV: "production", MFA_PROVIDER: "configured", MFA_REQUIRED: "true" };
describe("privileged session contract", () => {
  test("requires MFA assertion and short expiry", () => {
    expect(canUsePrivilegedSession({ session, now: 3_000, env })).toBe(true);
    expect(canUsePrivilegedSession({ session: { ...session, mfaVerifiedAt: null }, now: 3_000, env })).toBe(false);
    expect(canUsePrivilegedSession({ session: { ...session, expiresAt: 2_000_000 }, now: 3_000, env })).toBe(false);
    expect(canUsePrivilegedSession({ session, now: 3_000, env: { NODE_ENV: "production" } })).toBe(false);
  });
  test("revocation, expiry and destructive reauthentication fail closed", () => {
    expect(canUsePrivilegedSession({ session: { ...session, revokedAt: 2_500 }, now: 3_000, env })).toBe(false);
    expect(canPerformPrivilegedAction({ session, destructive: true, now: 3_000, env })).toBe(false);
    expect(canPerformPrivilegedAction({ session, destructive: true, reauthenticatedAt: 2_000, now: 3_000, env })).toBe(true);
    expect(canPerformPrivilegedAction({ session, destructive: true, reauthenticatedAt: 2_000, now: 302_001, env })).toBe(false);
  });
});
