import { describe, expect, test } from "bun:test";
import { runRetentionCleanup } from "./retention-cleanup";
describe("retention cleanup", () => test("uses fixed cutoffs and protects active holds/appeals", async () => {
  const calls: { sql: string; values: unknown[] }[] = [];
  const db = { query: async (sql: string, values: unknown[]) => { calls.push({ sql, values }); return { rowCount: 2 }; } };
  const result = await runRetentionCleanup(db, new Date("2026-08-01T00:00:00.000Z"));
  expect(result).toEqual({ resolvedReports: 2, auditEvents: 2, quarantinedPhotoCases: 2 });
  expect(calls).toHaveLength(4);
  expect(calls[0].sql).toContain("legal_hold");
  expect(calls[0].sql).toContain("pending");
  expect(calls[1].values[0]).toBe("2024-08-01T00:00:00.000Z");
  expect(calls[2].values[0]).toBe("2026-07-02T00:00:00.000Z");
}));
