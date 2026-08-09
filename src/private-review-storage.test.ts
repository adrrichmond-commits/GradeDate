import { describe, expect, test } from "bun:test";
import {
  PrivateReviewUnavailableError,
  ReviewAccessDeniedError,
  issueReviewAccess,
  privateReviewReady,
  quarantinePhoto,
  readReviewPhoto,
  verifyReviewAccess,
  type PrivateReviewProvider,
} from "./private-review-storage";

const env = { GRADEDATE_PRIVATE_REVIEW_STORAGE: "true", GRADEDATE_REVIEW_SIGNING_KEY: "a".repeat(32), PRIVATE_BLOB_READ_WRITE_TOKEN: "test-private-token" };
const principal = { userId: 7, role: "moderator" as const, reauthenticatedAt: 1_000_000 };
const reviewCase = { caseId: "case-1", objectKey: "quarantine/case-1/photo", status: "quarantined" as const };
const provider: PrivateReviewProvider = {
  put: async () => {}, get: async () => new Uint8Array([1, 2, 3]), delete: async () => {},
};

describe("private review storage", () => {
  test("requires both production settings and a sufficiently strong signing key", () => {
    expect(privateReviewReady({})).toBe(false);
    expect(privateReviewReady({ GRADEDATE_PRIVATE_REVIEW_STORAGE: "true", GRADEDATE_REVIEW_SIGNING_KEY: "short" })).toBe(false);
    expect(privateReviewReady(env)).toBe(true);
  });
  test("fails closed when storage is not ready and does not call provider", async () => {
    let called = false;
    const p = { ...provider, put: async () => { called = true; } };
    await expect(quarantinePhoto(p, "case/photo", new Uint8Array([1]), "image/jpeg", {})).rejects.toBeInstanceOf(PrivateReviewUnavailableError);
    expect(called).toBe(false);
  });
  test("issues short-lived access and reads only after authorization", async () => {
    const access = issueReviewAccess(reviewCase, principal, 1_000_000, env);
    expect(access.expiresAt).toBe(1_000 + 300);
    expect(verifyReviewAccess(access.token, { ...reviewCase, principal }, 1_000_000, env)).toBe(true);
    await expect(readReviewPhoto(provider, access.token, { ...reviewCase, principal }, 1_000_000, env)).resolves.toEqual(new Uint8Array([1, 2, 3]));
    expect(verifyReviewAccess(access.token, { ...reviewCase, principal: { ...principal, role: "user" } }, 1_000_000, env)).toBe(false);
  });
  test("rejects expiry and tampering", () => {
    const access = issueReviewAccess(reviewCase, principal, 1_000_000, env);
    expect(verifyReviewAccess(access.token, { ...reviewCase, principal }, 1_301_000, env)).toBe(false);
    expect(verifyReviewAccess(`${access.token}x`, { ...reviewCase, principal }, 1_000_000, env)).toBe(false);
  });
  test("requires recent reauthentication", () => {
    expect(() => issueReviewAccess(reviewCase, { ...principal, reauthenticatedAt: 0 }, 1_000_000, env)).toThrow(ReviewAccessDeniedError);
  });
});
