/** Safe, idempotent retention cleanup contract. The scheduler must call this server-side. */
import {
  AUDIT_RETENTION_MONTHS,
  QUARANTINED_PHOTO_RETENTION_DAYS,
  RESOLVED_REPORT_RETENTION_MONTHS,
  STALE_UNRESOLVED_CASE_RETENTION_MONTHS,
} from "./admin-audit";
import type { PrivateReviewProvider } from "./private-review-storage";
import type { RetentionCounts } from "./retention-cron-state";

export type RetentionDb = {
  query: (sql: string, values: unknown[]) => Promise<{ rowCount?: number; [key: string]: unknown }>;
};
export type RetentionResult = RetentionCounts;
const cutoff = (now: Date, amount: number, unit: "months" | "days") => { const d = new Date(now); if (unit === "months") d.setUTCMonth(d.getUTCMonth() - amount); else d.setUTCDate(d.getUTCDate() - amount); return d.toISOString(); };

/**
 * Retention contract (real tables only — the legacy table names this module
 * once referenced never existed in the schema, so the old SQL was a silent
 * no-op that would have thrown at runtime):
 *
 * 1. Resolved safety reports (`reports`): deleted 12 months after resolution
 *    unless a legal hold is set or an active/pending appeal exists on a
 *    suspension raised from the report (appeals -> user_suspensions -> reports).
 * 2. Admin audit events: IMMUTABLE. A database trigger rejects UPDATE/DELETE
 *    on admin_audit_events, so the scheduled job never attempts to delete
 *    them; AUDIT_RETENTION_MONTHS (24) is a retention FLOOR, not an expiry.
 * 3. Quarantined photo blobs (`photo_moderation_cases.private_object_key`):
 *    purged only after the private object is deleted via the injected
 *    provider, and only for cases that are BOTH resolved
 *    (status approved/removed/restored) AND past their retention window
 *    (`retention_until`, set at creation to NOW() + QUARANTINED_PHOTO_RETENTION_DAYS
 *    days). Unresolved cases for users who deleted their account
 *    (user_id IS NULL — the case row survives account deletion via the
 *    ON DELETE SET NULL FK, so the blob is findable) are swept after
 *    STALE_UNRESOLVED_CASE_RETENTION_MONTHS (12, matching evidence retention):
 *    they can never be reviewed, so keeping them would orphan the blob beyond
 *    policy. Legal-hold cases are NEVER purged early, and unresolved cases
 *    with a live user stay in the queue for the reviewer.
 *
 * The optional provider is injected by the cron runtime; when it is omitted
 * the photo sweep is skipped (fail-closed: without the private store there is
 * nothing safe to purge).
 */
export async function runRetentionCleanup(db: RetentionDb, now = new Date(), provider?: PrivateReviewProvider): Promise<RetentionResult> {
  const reportCutoff = cutoff(now, RESOLVED_REPORT_RETENTION_MONTHS, "months");
  // retention_until is created_at + QUARANTINED_PHOTO_RETENTION_DAYS (db.ts),
  // so `retention_until <= now` means the 30-day quarantine window has elapsed.
  const photoCutoff = now.toISOString();
  const staleUnresolvedCutoff = cutoff(now, STALE_UNRESOLVED_CASE_RETENTION_MONTHS, "months");
  // Resolved safety reports are deleted 12 months after resolution unless a legal
  // hold is set or an active/pending appeal exists on a suspension raised from the
  // report (appeals -> user_suspensions.source_report_id -> reports.id).
  const reports = await db.query("DELETE FROM reports WHERE status IN ('closed','dismissed') AND resolved_at < $1 AND (legal_hold IS NULL OR legal_hold = false) AND NOT EXISTS (SELECT 1 FROM appeals a JOIN user_suspensions s ON a.suspension_id = s.id WHERE s.source_report_id = reports.id AND a.status IN ('pending','active'))", [reportCutoff]);
  // Admin audit events are append-only (DB trigger rejects UPDATE/DELETE), so they
  // are never deleted by the scheduled job; AUDIT_RETENTION_MONTHS is a retention
  // floor, not an expiry.
  void AUDIT_RETENTION_MONTHS;
  let photoCount = 0;
  if (provider) {
    const cases = await db.query(
      `SELECT id, private_object_key FROM photo_moderation_cases
       WHERE private_object_key IS NOT NULL AND private_deleted_at IS NULL AND legal_hold = false
         AND (
           (status IN ('approved','removed','restored') AND retention_until <= $1)
           OR (status IN ('pending','quarantined') AND user_id IS NULL AND created_at <= $2)
         )`,
      [photoCutoff, staleUnresolvedCutoff],
    );
    const rows = Array.isArray(cases)
      ? cases as unknown as Array<{ id: string; private_object_key: string }>
      : ((cases as unknown as { rows?: Array<{ id: string; private_object_key: string }> }).rows ?? []);
    for (const row of rows) {
      try {
        await provider.delete(row.private_object_key);
        await db.query("UPDATE photo_moderation_cases SET private_deleted_at=NOW() WHERE id=$1 AND private_deleted_at IS NULL", [row.id]);
        photoCount++;
      } catch (error) {
        // Keep the row eligible for the next run; logging is intentionally key-free.
        console.error("private_photo_retention_delete_failed", { caseId: row.id, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  return { resolvedReports: reports.rowCount ?? 0, auditEvents: 0, quarantinedPhotoCases: photoCount };
}
