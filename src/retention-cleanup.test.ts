import { describe, expect, test } from "bun:test";
import { runRetentionCleanup } from "./retention-cleanup";
import type { PrivateReviewProvider } from "./private-review-storage";

type Call = { sql: string; values: unknown[] };
const NOW = new Date("2026-08-01T00:00:00.000Z");

function recordingDb(rowsByContains: Array<{ contains: string; rows: unknown[]; rowCount?: number }>) {
  const calls: Call[] = [];
  const db = {
    query: async (sql: string, values: unknown[]) => {
      calls.push({ sql, values });
      for (const entry of rowsByContains) {
        if (sql.includes(entry.contains)) {
          return Array.isArray(entry.rows) && entry.rows.length > 0
            ? entry.rows
            : { rowCount: entry.rowCount ?? 0, rows: entry.rows };
        }
      }
      return { rowCount: 0 };
    },
  };
  return { db, calls };
}

const noopProvider: PrivateReviewProvider = {
  put: async () => {},
  get: async () => new Uint8Array(),
  delete: async () => {},
};

describe("retention cleanup (real schema contract)", () => {
  test("deletes resolved reports from the real `reports` table with holds/appeals exemptions and NEVER touches admin_audit_events", async () => {
    const { db, calls } = recordingDb([]);
    const result = await runRetentionCleanup(db, NOW);
    // Without a provider the photo sweep must be skipped entirely (fail-closed).
    expect(result).toEqual({ resolvedReports: 0, auditEvents: 0, quarantinedPhotoCases: 0 });
    expect(calls).toHaveLength(1);
    const sql = calls[0].sql;
    expect(sql).toContain("DELETE FROM reports");
    expect(sql).toContain("status IN ('closed','dismissed')");
    expect(sql).toContain("resolved_at < $1");
    expect(sql).toContain("legal_hold IS NULL OR legal_hold = false");
    expect(sql).toContain("appeals a JOIN user_suspensions s");
    expect(sql).toContain("a.suspension_id = s.id");
    expect(sql).toContain("s.source_report_id = reports.id");
    expect(sql).toContain("a.status IN ('pending','active')");
    expect(calls[0].values[0]).toBe("2025-08-01T00:00:00.000Z"); // 12 months before NOW
    // Legacy no-op tables must never be referenced; audit events are immutable.
    expect(sql).not.toContain("safety_reports");
    expect(sql).not.toContain("photo_quarantine_cases");
    expect(sql).not.toContain("photo_review_objects");
    expect(sql).not.toContain("admin_audit_events");
  });

  test("returns the deleted-report count and reports zero audit events deleted", async () => {
    const { db } = recordingDb([]);
    const dbWithRows = {
      query: async (sql: string, values: unknown[]) => {
        if (sql.includes("DELETE FROM reports")) return { rowCount: 3 };
        return { rowCount: 0 };
      },
    };
    const result = await runRetentionCleanup(dbWithRows, NOW);
    expect(result.resolvedReports).toBe(3);
    expect(result.auditEvents).toBe(0);
    void db;
  });

  test("with a provider, sweeps resolved past-window blobs AND stale unresolved cases of deleted users", async () => {
    const deletedKeys: string[] = [];
    const provider: PrivateReviewProvider = {
      put: async () => {},
      get: async () => new Uint8Array(),
      delete: async (key) => { deletedKeys.push(key); },
    };
    const { db, calls } = recordingDb([
      { contains: "SELECT id, private_object_key", rows: [{ id: "c-resolved", private_object_key: "blob-resolved" }, { id: "c-stale", private_object_key: "blob-stale" }] },
      { contains: "UPDATE photo_moderation_cases", rows: [], rowCount: 1 },
    ]);
    const result = await runRetentionCleanup(db, NOW, provider);
    expect(result.quarantinedPhotoCases).toBe(2);
    expect(deletedKeys).toEqual(["blob-resolved", "blob-stale"]);
    const select = calls.find((c) => c.sql.includes("SELECT id, private_object_key"));
    expect(select).toBeDefined();
    expect(select!.sql).toContain("legal_hold = false");
    expect(select!.sql).toContain("status IN ('approved','removed','restored') AND retention_until <= $1");
    expect(select!.sql).toContain("status IN ('pending','quarantined') AND user_id IS NULL AND created_at <= $2");
    expect(select!.values[0]).toBe("2026-08-01T00:00:00.000Z"); // retention window elapsed
    expect(select!.values[1]).toBe("2025-08-01T00:00:00.000Z"); // 12-month stale cutoff
    // Every purge marks the case deleted so it is never selected again.
    const updates = calls.filter((c) => c.sql.includes("UPDATE photo_moderation_cases"));
    expect(updates).toHaveLength(2);
    for (const u of updates) expect(u.sql).toContain("private_deleted_at=NOW()");
  });

  test("a failed blob delete keeps the row eligible and does not count it as purged", async () => {
    const provider: PrivateReviewProvider = {
      put: async () => {},
      get: async () => new Uint8Array(),
      delete: async (key) => { if (key === "blob-fail") throw new Error("storage down"); },
    };
    const { db, calls } = recordingDb([
      { contains: "SELECT id, private_object_key", rows: [{ id: "c1", private_object_key: "blob-ok" }, { id: "c2", private_object_key: "blob-fail" }] },
      { contains: "UPDATE photo_moderation_cases", rows: [], rowCount: 1 },
    ]);
    const result = await runRetentionCleanup(db, NOW, provider);
    expect(result.quarantinedPhotoCases).toBe(1);
    // Only the successful purge was marked deleted.
    const updates = calls.filter((c) => c.sql.includes("UPDATE photo_moderation_cases"));
    expect(updates).toHaveLength(1);
    expect(updates[0].values[0]).toBe("c1");
  });

  test("deletes stuck pending-without-key automated-scan cases past the retention window (no blob to purge)", async () => {
    const deletedKeys: string[] = [];
    const provider: PrivateReviewProvider = {
      put: async () => {},
      get: async () => new Uint8Array(),
      delete: async (key) => { deletedKeys.push(key); },
    };
    const { db, calls } = recordingDb([
      { contains: "SELECT id, private_object_key", rows: [{ id: "c-stuck", private_object_key: null }, { id: "c-resolved", private_object_key: "blob-ok" }] },
      { contains: "UPDATE photo_moderation_cases", rows: [], rowCount: 1 },
    ]);
    const result = await runRetentionCleanup(db, NOW, provider);
    expect(result.quarantinedPhotoCases).toBe(2);
    // The no-key stuck row has no blob: it is deleted outright (removing it from
    // the review queue), while the keyed row is deleted via the provider and
    // marked private_deleted_at (evidence row survives).
    expect(deletedKeys).toEqual(["blob-ok"]);
    const deletes = calls.filter((c) => c.sql.includes("DELETE FROM photo_moderation_cases"));
    expect(deletes).toHaveLength(1);
    expect(deletes[0].sql).toContain("legal_hold=false");
    expect(deletes[0].values[0]).toBe("c-stuck");
    const updates = calls.filter((c) => c.sql.includes("UPDATE photo_moderation_cases"));
    expect(updates).toHaveLength(1);
    expect(updates[0].values[0]).toBe("c-resolved");
  });

  test("the sweep only selects no-key automated-scan cases, never legal-hold or manual-review rows", async () => {
    const provider: PrivateReviewProvider = {
      put: async () => {},
      get: async () => new Uint8Array(),
      delete: async () => {},
    };
    const { db, calls } = recordingDb([{ contains: "SELECT id, private_object_key", rows: [] }]);
    await runRetentionCleanup(db, NOW, provider);
    const select = calls.find((c) => c.sql.includes("SELECT id, private_object_key"));
    expect(select).toBeDefined();
    // Stuck automated-scan jobs: pending/quarantined, no key ever attached, past
    // the 30-day retention window, legal holds excluded.
    expect(select!.sql).toContain("private_object_key IS NULL");
    expect(select!.sql).toContain("source = 'automated_photo_scan'");
    expect(select!.sql).toContain("status IN ('pending','quarantined') AND source = 'automated_photo_scan' AND retention_until <= $1");
    expect(select!.sql).toContain("legal_hold = false");
    // Manual-review rows (user_report / underage_report) have no key by design
    // and must stay in the queue — the arm is scoped to automated scans only.
    expect(select!.sql).not.toContain("source = 'user_report'");
    expect(select!.sql).not.toContain("source = 'underage_report'");
  });

  test("never selects legal-hold cases or unresolved cases with a live user", async () => {
    const provider: PrivateReviewProvider = {
      put: async () => {},
      get: async () => new Uint8Array(),
      delete: async () => {},
    };
    const { db } = recordingDb([{ contains: "SELECT id, private_object_key", rows: [] }]);
    const result = await runRetentionCleanup(db, NOW, provider);
    expect(result.quarantinedPhotoCases).toBe(0);
  });
});
