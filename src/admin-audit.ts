/** Server-only policy and redaction for privileged audit records. */
export const AUDIT_RETENTION_MONTHS = 24;
export const RESOLVED_REPORT_RETENTION_MONTHS = 12;
export const QUARANTINED_PHOTO_RETENTION_DAYS = 30;
/**
 * How long a quarantined photo case that can never be reviewed (its owner
 * deleted their account, so user_id was set NULL by the ON DELETE SET NULL
 * FK) is kept before its private blob is purged. Matches the 12-month safety
 * evidence-retention period: a deleted user's unresolved case is not evidence
 * under a legal hold, so keeping it indefinitely would orphan the blob beyond
 * policy. Zero-tolerance / legal-hold cases are never swept early.
 */
export const STALE_UNRESOLVED_CASE_RETENTION_MONTHS = 12;

// Audit metadata is deliberately narrow: never accept arbitrary request payloads.
export const AUDIT_METADATA_KEYS = [
  "status", "reason", "duration", "report_id", "suspension_id", "case_id", "assigned",
  // Error context for failure-path audits (e.g. mfa.enrollment.failed): the
  // exact verify error (expectedOrigin / expectedRPID / UV / challenge) must
  // survive redaction so support can see why a privileged enrollment failed.
  "name", "message",
] as const;
export type AuditMetadata = Partial<Record<(typeof AUDIT_METADATA_KEYS)[number], string | boolean | null>>;

export function redactAuditMetadata(input: Record<string, unknown> | undefined): AuditMetadata {
  const out: AuditMetadata = {};
  if (!input) return out;
  for (const key of AUDIT_METADATA_KEYS) {
    const value = input[key];
    if (typeof value === "string" && value.length <= 128) out[key] = value;
    else if (typeof value === "boolean" || value === null) out[key] = value;
  }
  return out;
}

export function isPrivilegedAuditAction(action: string): boolean {
  return /^(admin|appeal|suspension|report|photo_moderation|underage)\./.test(action);
}

/** Fields that may be persisted; paths, URLs, bytes, tokens, messages and reporter identity are excluded. */
export function auditRecordShape(input: { actorUserId: number | null; actorRole?: string | null; action: string; targetType?: string; targetId?: string; requestId?: string; metadata?: Record<string, unknown> }) {
  return {
    actorUserId: input.actorUserId,
    actorRole: input.actorRole ?? null,
    action: input.action,
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
    requestId: input.requestId ?? null,
    metadata: redactAuditMetadata(input.metadata),
  };
}
