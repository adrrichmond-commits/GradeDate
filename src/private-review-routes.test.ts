import { describe, expect, test } from "bun:test";
import { issueReviewAccess, verifyReviewAccess, quarantinePhoto, readReviewPhoto, ReviewAccessDeniedError, type PrivateReviewProvider } from "./private-review-storage";
import { quarantineHidesPhoto } from "./photo-quarantine";

describe("private review route authorization contracts", () => {
  const env = { GRADEDATE_PRIVATE_REVIEW_STORAGE: "true", PRIVATE_BLOB_READ_WRITE_TOKEN: "test", GRADEDATE_REVIEW_SIGNING_KEY: "s".repeat(32) };
  const principal = { userId: 1, role: "admin" as const, reauthenticatedAt: 1_000_000 };
  const provider: PrivateReviewProvider = { put: async () => {}, get: async () => new Uint8Array([7]), delete: async () => {} };
  const a = { caseId: "a", objectKey: "quarantine/a/photo", status: "quarantined" as const };
  const b = { caseId: "b", objectKey: "quarantine/b/photo", status: "quarantined" as const };
  test("unauthorized, suspended, stale reauthentication and case-isolated access are denied", async () => {
    expect(() => issueReviewAccess(a, { ...principal, role: "user" }, 1_000_000, env)).toThrow(ReviewAccessDeniedError);
    expect(() => issueReviewAccess(a, { ...principal, suspended: true }, 1_000_000, env)).toThrow(ReviewAccessDeniedError);
    expect(() => issueReviewAccess(a, { ...principal, reauthenticatedAt: 1 }, 1_000_000, env)).toThrow(ReviewAccessDeniedError);
    const token = issueReviewAccess(a, principal, 1_000_000, env).token;
    expect(verifyReviewAccess(token, { ...b, principal }, 1_000_000, env)).toBe(false);
    await expect(readReviewPhoto(provider, token, { ...b, principal }, 1_000_000, env)).rejects.toBeInstanceOf(ReviewAccessDeniedError);
  });
  test("tampered and expired tokens are denied; resolved states hide no photo", () => {
    const token = issueReviewAccess(a, principal, 1_000_000, env).token;
    expect(verifyReviewAccess(`${token}x`, { ...a, principal }, 1_000_000, env)).toBe(false);
    expect(verifyReviewAccess(token, { ...a, principal }, 1_301_000, env)).toBe(false);
    expect(quarantineHidesPhoto("approved")).toBe(false);
    expect(quarantineHidesPhoto("restored")).toBe(false);
  });
  test("legacy moderator role is denied review access entirely", () => {
    expect(() => issueReviewAccess(a, { ...principal, role: "moderator" }, 1_000_000, env)).toThrow(ReviewAccessDeniedError);
    const token = issueReviewAccess(a, principal, 1_000_000, env).token;
    expect(verifyReviewAccess(token, { ...a, principal: { ...principal, role: "moderator" } }, 1_000_000, env)).toBe(false);
  });
  test("quarantine write remains provider-only", async () => { let wrote = false; await quarantinePhoto({ ...provider, put: async () => { wrote = true; } }, a.objectKey, new Uint8Array([1]), "image/jpeg", env); expect(wrote).toBe(true); });
});
