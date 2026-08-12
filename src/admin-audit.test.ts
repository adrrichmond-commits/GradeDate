import { describe, expect, test } from "bun:test";
import { auditRecordShape, redactAuditMetadata, AUDIT_RETENTION_MONTHS, RESOLVED_REPORT_RETENTION_MONTHS, QUARANTINED_PHOTO_RETENTION_DAYS, STALE_UNRESOLVED_CASE_RETENTION_MONTHS } from "./admin-audit";

describe("privileged audit hardening", () => {
  test("retention contract is explicit", () => { expect(AUDIT_RETENTION_MONTHS).toBe(24); expect(RESOLVED_REPORT_RETENTION_MONTHS).toBe(12); expect(QUARANTINED_PHOTO_RETENTION_DAYS).toBe(30); expect(STALE_UNRESOLVED_CASE_RETENTION_MONTHS).toBe(12); });
  test("metadata is allowlisted and sensitive evidence is dropped", () => {
    const result = redactAuditMetadata({ status: "closed", reason: "underage", path: "/private/x", url: "https://x", bytes: 4, token: "x", body: "message", reporter_id: 8, report_id: "r1" });
    expect(result).toEqual({ status: "closed", reason: "underage", report_id: "r1" });
  });
  test("attribution is stable and does not accept arbitrary payload", () => {
    expect(auditRecordShape({ actorUserId: 3, actorRole: "admin", action: "report.read", targetType: "report", targetId: "r1", requestId: "req-1", metadata: { assigned: true, token: "secret", body: "message" } })).toEqual({ actorUserId: 3, actorRole: "admin", action: "report.read", targetType: "report", targetId: "r1", requestId: "req-1", metadata: { assigned: true } });
  });
  test("failure-path error context (name/message) survives redaction", () => {
    expect(redactAuditMetadata({ reason: "assertion_failed", name: "Error", message: "expectedOrigin mismatch", url: "https://x" })).toEqual({ reason: "assertion_failed", name: "Error", message: "expectedOrigin mismatch" });
    expect(auditRecordShape({ actorUserId: 1, actorRole: "owner", action: "mfa.enrollment.failed", targetType: "user", targetId: "1", requestId: "req-2", metadata: { reason: "assertion_failed", name: "Error", message: "expectedRPID mismatch, got https://gradedate.app" } }).metadata).toEqual({ reason: "assertion_failed", name: "Error", message: "expectedRPID mismatch, got https://gradedate.app" });
  });
});
