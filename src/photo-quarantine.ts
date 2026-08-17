/** Pure policy for private flagged-photo quarantine. */
export const QUARANTINE_STATUSES = ["pending", "quarantined", "approved", "removed", "restored"] as const;
export type QuarantineStatus = (typeof QUARANTINE_STATUSES)[number];
export const MODERATION_SOURCES = ["automated", "user_report", "admin"] as const;
export type ModerationSource = (typeof MODERATION_SOURCES)[number];
export const MODERATION_RESULTS = ["safe", "unsafe", "unknown"] as const;
export type ModerationResult = (typeof MODERATION_RESULTS)[number];
const transitions: Record<QuarantineStatus, readonly QuarantineStatus[]> = {
  pending: ["quarantined", "approved"], quarantined: ["approved", "removed", "restored"],
  approved: ["quarantined"], removed: ["restored"], restored: ["quarantined"],
};
export function isQuarantineStatus(v: unknown): v is QuarantineStatus { return typeof v === "string" && (QUARANTINE_STATUSES as readonly string[]).includes(v); }
export function isModerationSource(v: unknown): v is ModerationSource { return typeof v === "string" && (MODERATION_SOURCES as readonly string[]).includes(v); }
export function isModerationResult(v: unknown): v is ModerationResult { return typeof v === "string" && (MODERATION_RESULTS as readonly string[]).includes(v); }
export function canTransitionQuarantine(from: QuarantineStatus, to: QuarantineStatus): boolean { return transitions[from]?.includes(to) ?? false; }
export function quarantineHidesPhoto(status: QuarantineStatus): boolean { return status === "pending" || status === "quarantined" || status === "removed"; }
export function canReviewPhoto(role: unknown): boolean { return role === "owner" || role === "admin"; }
/** Public reviewer bytes are forbidden unless a private/signed provider is explicitly configured. */
export function privateReviewStorageReady(env: Record<string, string | undefined> = process.env): boolean {
  return env.GRADEDATE_PRIVATE_REVIEW_STORAGE === "true" && !!env.GRADEDATE_REVIEW_SIGNING_KEY && !!env.PRIVATE_BLOB_READ_WRITE_TOKEN;
}
export function redactPhotoCase(input: Record<string, unknown>) {
  const out = { ...input }; delete out.photo_path; delete out.photo_url; delete out.bytes; delete out.token; delete out.signed_url; return out;
}
