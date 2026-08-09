/** Safe, idempotent retention cleanup contract. The scheduler must call this server-side. */
import { AUDIT_RETENTION_MONTHS, QUARANTINED_PHOTO_RETENTION_DAYS, RESOLVED_REPORT_RETENTION_MONTHS } from "./admin-audit";
import type { PrivateReviewProvider } from "./private-review-storage";

export type RetentionDb = {
  query: (sql: string, values: unknown[]) => Promise<{ rowCount?: number; [key: string]: unknown }>;
};
export type RetentionResult = { resolvedReports: number; auditEvents: number; quarantinedPhotoCases: number };
const cutoff = (now: Date, amount: number, unit: "months" | "days") => { const d = new Date(now); if (unit === "months") d.setUTCMonth(d.getUTCMonth() - amount); else d.setUTCDate(d.getUTCDate() - amount); return d.toISOString(); };

/**
 * Deletes records only after private object deletion succeeds. The optional provider
 * is injected by the cron runtime; omitting it preserves the SQL-only contract used
 * by database migration tests and is not permitted for production photo cleanup.
 */
export async function runRetentionCleanup(db: RetentionDb, now = new Date(), provider?: PrivateReviewProvider): Promise<RetentionResult> {
  const reportCutoff = cutoff(now, RESOLVED_REPORT_RETENTION_MONTHS, "months");
  const auditCutoff = cutoff(now, AUDIT_RETENTION_MONTHS, "months");
  const photoCutoff = cutoff(now, QUARANTINED_PHOTO_RETENTION_DAYS, "days");
  const reports = await db.query("DELETE FROM safety_reports WHERE status IN ('closed','dismissed') AND resolved_at < $1 AND (legal_hold IS NULL OR legal_hold = false) AND NOT EXISTS (SELECT 1 FROM appeals WHERE appeals.report_id = safety_reports.id AND appeals.status IN ('pending','active'))", [reportCutoff]);
  const audits = await db.query("DELETE FROM admin_audit_events WHERE created_at < $1", [auditCutoff]);
  let photoCount = 0;
  if (provider) {
    const cases = await db.query("SELECT id, private_object_key FROM photo_moderation_cases WHERE private_object_key IS NOT NULL AND private_deleted_at IS NULL AND legal_hold=false AND retention_until <= $1 AND status IN ('approved','removed','restored')", [photoCutoff]);
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
  } else {
    const photos = await db.query("DELETE FROM photo_review_objects WHERE case_id IN (SELECT id FROM photo_quarantine_cases WHERE resolved_at < $1 AND status IN ('approved','removed','restored') AND (legal_hold IS NULL OR legal_hold = false))", [photoCutoff]);
    photoCount = photos.rowCount ?? 0;
    await db.query("DELETE FROM photo_quarantine_cases WHERE resolved_at < $1 AND status IN ('approved','removed','restored') AND (legal_hold IS NULL OR legal_hold = false) AND NOT EXISTS (SELECT 1 FROM appeals WHERE appeals.photo_case_id = photo_quarantine_cases.id AND appeals.status IN ('pending','active'))", [photoCutoff]);
  }
  return { resolvedReports: reports.rowCount ?? 0, auditEvents: audits.rowCount ?? 0, quarantinedPhotoCases: photoCount };
}
