import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { retentionCronHandler } from "./retention-cron";

const request = (method = "GET", secret?: string) => new Request("https://gradedate.app/api/cron/retention", {
  method,
  headers: secret ? { Authorization: `Bearer ${secret}` } : {},
});
const EMPTY = { resolvedReports: 0, auditEvents: 0, quarantinedPhotoCases: 0 };

describe("retention cron endpoint", () => {
  const original = process.env.CRON_SECRET;
  const originalUrl = process.env.DATABASE_URL;
  afterEach(() => { if (original === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = original; });
  afterAll(() => { if (originalUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = originalUrl; });

  test("fails closed when secret is missing", async () => {
    delete process.env.CRON_SECRET;
    const response = await retentionCronHandler(request(), async () => EMPTY);
    expect(response.status).toBe(503);
  });
  test("rejects invalid secret without invoking cleanup", async () => {
    process.env.CRON_SECRET = "production-secret";
    let called = false;
    const response = await retentionCronHandler(request("GET", "wrong"), async () => { called = true; return EMPTY; });
    expect(response.status).toBe(401);
    expect(called).toBe(false);
  });
  test("invokes cleanup with a valid secret", async () => {
    process.env.CRON_SECRET = "production-secret";
    const result = { resolvedReports: 2, auditEvents: 3, quarantinedPhotoCases: 1 };
    const response = await retentionCronHandler(request("GET", "production-secret"), async () => result);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, result });
  });
  test("returns safe error when cleanup fails", async () => {
    process.env.CRON_SECRET = "production-secret";
    const response = await retentionCronHandler(request("GET", "production-secret"), async () => { throw new Error("database secret must not leak"); });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Retention cleanup failed" });
  });
  test("records a success heartbeat after a successful cleanup", async () => {
    process.env.CRON_SECRET = "production-secret";
    const result = { resolvedReports: 2, auditEvents: 0, quarantinedPhotoCases: 1 };
    const recorded: Array<[string, unknown]> = [];
    const response = await retentionCronHandler(request("GET", "production-secret"), async () => result, async (outcome, counts) => { recorded.push([outcome, counts]); });
    expect(response.status).toBe(200);
    expect(recorded).toEqual([["success", result]]);
  });
  test("records a failure heartbeat when cleanup fails", async () => {
    process.env.CRON_SECRET = "production-secret";
    const recorded: Array<[string, unknown]> = [];
    const response = await retentionCronHandler(request("GET", "production-secret"), async () => { throw new Error("boom"); }, async (outcome, counts) => { recorded.push([outcome, counts]); });
    expect(response.status).toBe(500);
    expect(recorded).toEqual([["failure", EMPTY]]);
  });
  test("heartbeat recording failure never changes the cron response (best-effort)", async () => {
    process.env.CRON_SECRET = "production-secret";
    const response = await retentionCronHandler(request("GET", "production-secret"), async () => EMPTY, async () => { throw new Error("heartbeat db down"); });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, result: EMPTY });
  });
  test("never records a heartbeat for an unauthorized request", async () => {
    process.env.CRON_SECRET = "production-secret";
    let recorded = false;
    const response = await retentionCronHandler(request("GET", "wrong"), async () => EMPTY, async () => { recorded = true; });
    expect(response.status).toBe(401);
    expect(recorded).toBe(false);
  });
  test("a malformed DATABASE_URL never crashes the handler (default heartbeat is best-effort)", async () => {
    process.env.CRON_SECRET = "production-secret";
    const originalUrl = process.env.DATABASE_URL;
    try {
      process.env.DATABASE_URL = "not-a-postgres-url";
      const response = await retentionCronHandler(request("GET", "production-secret"), async () => EMPTY);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true, result: EMPTY });
    } finally {
      if (originalUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalUrl;
    }
  });
});
