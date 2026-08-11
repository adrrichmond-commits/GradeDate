/**
 * Heartbeat state for the retention cron (observability, not policy).
 *
 * The cron records one singleton row (id = 1) per run so a live firing is
 * observable through /api/ready without exposing runtime logs. Only coarse
 * operational facts are stored: last run time, outcome, the result counts
 * from the cleanup, and the consecutive-failure streak. No user data, blob
 * keys, or secrets are ever written here.
 */
export type CronRunOutcome = "success" | "failure";
export type RetentionCounts = {
  resolvedReports: number;
  auditEvents: number;
  quarantinedPhotoCases: number;
};
export type CronRunState = RetentionCounts & {
  lastRunAt: string;
  lastOutcome: CronRunOutcome;
  consecutiveFailures: number;
};

export type CronStateDb = {
  query: (sql: string, values: unknown[]) => Promise<{ rowCount?: number; [key: string]: unknown }>;
};

/** Single-row upsert SQL for a successful run. Success resets the failure streak. */
export function buildSuccessUpsert(counts: RetentionCounts): { sql: string; values: unknown[] } {
  return {
    sql: `INSERT INTO retention_cron_state (id, last_run_at, last_outcome, last_resolved_reports, last_audit_events_deleted, last_quarantined_photo_cases_purged, consecutive_failures)
VALUES (1, NOW(), 'success', $1, $2, $3, 0)
ON CONFLICT (id) DO UPDATE SET
  last_run_at = EXCLUDED.last_run_at,
  last_outcome = EXCLUDED.last_outcome,
  last_resolved_reports = EXCLUDED.last_resolved_reports,
  last_audit_events_deleted = EXCLUDED.last_audit_events_deleted,
  last_quarantined_photo_cases_purged = EXCLUDED.last_quarantined_photo_cases_purged,
  consecutive_failures = 0,
  updated_at = NOW()`,
    values: [counts.resolvedReports, counts.auditEvents, counts.quarantinedPhotoCases],
  };
}

/** Single-row upsert SQL for a failed run. Failures increment the streak. */
export function buildFailureUpsert(): { sql: string; values: unknown[] } {
  return {
    sql: `INSERT INTO retention_cron_state (id, last_run_at, last_outcome, consecutive_failures)
VALUES (1, NOW(), 'failure', 1)
ON CONFLICT (id) DO UPDATE SET
  last_run_at = EXCLUDED.last_run_at,
  last_outcome = 'failure',
  consecutive_failures = retention_cron_state.consecutive_failures + 1,
  updated_at = NOW()`,
    values: [],
  };
}

/** Persist a run outcome. Never throws: heartbeat failures must not change the cron response. */
export async function recordCronRunState(db: CronStateDb, outcome: CronRunOutcome, counts: RetentionCounts = { resolvedReports: 0, auditEvents: 0, quarantinedPhotoCases: 0 }): Promise<void> {
  const { sql, values } = outcome === "success" ? buildSuccessUpsert(counts) : buildFailureUpsert();
  try {
    await db.query(sql, values);
  } catch (error) {
    // Key-free and user-free: the heartbeat is best-effort observability.
    console.error("retention_cron_heartbeat_failed", { error: error instanceof Error ? error.message : String(error) });
  }
}

/** Read the latest run state (null when no run has been recorded or the table is unavailable). */
export async function readCronRunState(db: CronStateDb): Promise<CronRunState | null> {
  try {
    const rows = await db.query(
      "SELECT last_run_at, last_outcome, last_resolved_reports, last_audit_events_deleted, last_quarantined_photo_cases_purged, consecutive_failures FROM retention_cron_state WHERE id = 1",
      [],
    );
    const row = Array.isArray(rows)
      ? (rows as unknown as Array<Record<string, unknown>>)[0]
      : ((rows as unknown as { rows?: Array<Record<string, unknown>> }).rows ?? [])[0];
    if (!row) return null;
    return {
      lastRunAt: String(row.last_run_at),
      lastOutcome: String(row.last_outcome) as CronRunOutcome,
      resolvedReports: Number(row.last_resolved_reports ?? 0),
      auditEvents: Number(row.last_audit_events_deleted ?? 0),
      quarantinedPhotoCases: Number(row.last_quarantined_photo_cases_purged ?? 0),
      consecutiveFailures: Number(row.consecutive_failures ?? 0),
    };
  } catch {
    return null;
  }
}
