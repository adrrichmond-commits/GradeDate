import { describe, expect, test } from "bun:test";
import { buildSuccessUpsert, buildFailureUpsert, recordCronRunState, readCronRunState, type CronStateDb } from "./retention-cron-state";

const throwingDb: CronStateDb = { query: async () => { throw new Error("db down"); } };

describe("retention cron heartbeat state", () => {
  test("success upsert resets the failure streak and stores the result counts", () => {
    const { sql, values } = buildSuccessUpsert({ resolvedReports: 3, auditEvents: 0, quarantinedPhotoCases: 2 });
    expect(values).toEqual([3, 0, 2]);
    expect(sql).toContain("INSERT INTO retention_cron_state");
    expect(sql).toContain("ON CONFLICT (id) DO UPDATE");
    expect(sql).toContain("'success'");
    expect(sql).toContain("consecutive_failures = 0");
    expect(sql).toContain("last_quarantined_photo_cases_purged = EXCLUDED.last_quarantined_photo_cases_purged");
  });

  test("failure upsert increments the streak and carries no counts", () => {
    const { sql, values } = buildFailureUpsert();
    expect(values).toEqual([]);
    expect(sql).toContain("'failure'");
    expect(sql).toContain("consecutive_failures = retention_cron_state.consecutive_failures + 1");
  });

  test("recordCronRunState never throws even when the db write fails (best-effort heartbeat)", async () => {
    await expect(recordCronRunState(throwingDb, "success", { resolvedReports: 1, auditEvents: 0, quarantinedPhotoCases: 0 })).resolves.toBeUndefined();
    await expect(recordCronRunState(throwingDb, "failure")).resolves.toBeUndefined();
  });

  test("recordCronRunState issues the success upsert with the given counts", async () => {
    let captured: { sql: string; values: unknown[] } | null = null;
    const db: CronStateDb = { query: async (sql, values) => { captured = { sql, values }; return { rowCount: 1 }; } };
    await recordCronRunState(db, "success", { resolvedReports: 4, auditEvents: 0, quarantinedPhotoCases: 1 });
    expect(captured?.values).toEqual([4, 0, 1]);
    expect(captured?.sql).toContain("last_outcome");
  });

  test("recordCronRunState issues the failure upsert with no counts", async () => {
    let captured: { sql: string; values: unknown[] } | null = null;
    const db: CronStateDb = { query: async (sql, values) => { captured = { sql, values }; return { rowCount: 1 }; } };
    await recordCronRunState(db, "failure");
    expect(captured?.values).toEqual([]);
    expect(captured?.sql).toContain("'failure'");
  });

  test("readCronRunState maps a row to the coarse operational state", async () => {
    const db: CronStateDb = {
      query: async () => [{
        last_run_at: "2026-08-12T03:00:00.000Z",
        last_outcome: "success",
        last_resolved_reports: 2,
        last_audit_events_deleted: 0,
        last_quarantined_photo_cases_purged: 1,
        consecutive_failures: 0,
      }],
    };
    const state = await readCronRunState(db);
    expect(state).toEqual({
      lastRunAt: "2026-08-12T03:00:00.000Z",
      lastOutcome: "success",
      resolvedReports: 2,
      auditEvents: 0,
      quarantinedPhotoCases: 1,
      consecutiveFailures: 0,
    });
  });

  test("readCronRunState returns null when no run has been recorded or the read fails", async () => {
    expect(await readCronRunState({ query: async () => [] })).toBeNull();
    expect(await readCronRunState(throwingDb)).toBeNull();
  });
});
