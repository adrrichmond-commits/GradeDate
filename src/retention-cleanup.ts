/** Safe, idempotent retention cleanup contract. The scheduler must call this server-side. */
import { AUDIT_RETENTION_MONTHS, QUARANTINED_PHOTO_RETENTION_DAYS, RESOLVED_REPORT_RETENTION_MONTHS } from "./admin-audit";

export type RetentionDb = {
  query: (sql: string, values: unknown[]) => Promise<{ rowCount?: number }>;
};
export type RetentionResult = { resolvedReports: number; auditEvents: number; quarantinedPhotoCases: number };

const cutoff = (now: Date, amount: number, unit: "months" | "days") => {
  const d = new Date(now);
  if (unit === "months") d.setUTCMonth(d.getUTCMonth() - amount);
  else d.setUTCDate(d.getUTCDate() - amount);
  return d.toISOString();
};

/**
 * Deletes only finalized, unheld records. Every statement is rerunnable and uses
 * a cutoff computed once, so retries cannot broaden the deletion window.
 * Table names are fixed constants (never caller input); quarantine objects are
 * removed with their case in one statement. Missing tables should fail the job,
 * not silently claim cleanup succeeded.
 */
export async function runRetentionCleanup(db: RetentionDb, now = new Date()): Promise<RetentionResult> {
  const reportCutoff = cutoff(now, RESOLVED_REPORT_RETENTION_MONTHS, "months");
  const auditCutoff = cutoff(now, AUDIT_RETENTION_MONTHS, "months");
  const photoCutoff = cutoff(now, QUARANTINED_PHOTO_RETENTION_DAYS, "days");
  const reports = await db.query("DELETE FROM safety_reports WHERE status IN ('closed','dismissed') AND resolved_at < $1 AND (legal_hold IS NULL OR legal_hold = false) AND NOT EXISTS (SELECT 1 FROM appeals WHERE appeals.report_id = safety_reports.id AND appeals.status IN ('pending','active'))", [reportCutoff]);
  const audits = await db.query("DELETE FROM admin_audit_events WHERE created_at < $1", [auditCutoff]);
  const photos = await db.query("DELETE FROM photo_review_objects WHERE case_id IN (SELECT id FROM photo_quarantine_cases WHERE resolved_at < $1 AND status IN ('approved','removed','restored') AND (legal_hold IS NULL OR legal_hold = false))", [photoCutoff]);
  await db.query("DELETE FROM photo_quarantine_cases WHERE resolved_at < $1 AND status IN ('approved','removed','restored') AND (legal_hold IS NULL OR legal_hold = false) AND NOT EXISTS (SELECT 1 FROM appeals WHERE appeals.photo_case_id = photo_quarantine_cases.id AND appeals.status IN ('pending','active'))", [photoCutoff]);
  return { resolvedReports: reports.rowCount ?? 0, auditEvents: audits.rowCount ?? 0, quarantinedPhotoCases: photos.rowCount ?? 0 };
}
