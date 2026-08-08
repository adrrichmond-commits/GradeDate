import { afterEach, describe, expect, test } from "bun:test";
import { retentionCronHandler } from "./retention-cron";

const request = (method = "GET", secret?: string) => new Request("https://gradedate.app/api/cron/retention", {
  method,
  headers: secret ? { Authorization: `Bearer ${secret}` } : {},
});

describe("retention cron endpoint", () => {
  const original = process.env.CRON_SECRET;
  afterEach(() => { if (original === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = original; });

  test("fails closed when secret is missing", async () => {
    delete process.env.CRON_SECRET;
    const response = await retentionCronHandler(request(), async () => ({ resolvedReports: 0, auditEvents: 0, quarantinedPhotoCases: 0 }));
    expect(response.status).toBe(503);
  });
  test("rejects invalid secret without invoking cleanup", async () => {
    process.env.CRON_SECRET = "production-secret";
    let called = false;
    const response = await retentionCronHandler(request("GET", "wrong"), async () => { called = true; return { resolvedReports: 0, auditEvents: 0, quarantinedPhotoCases: 0 }; });
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
});
