import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { handleApiRoute } from "./api-handler";
import { checkDatabaseReady } from "./db";

const ORIGINAL_URL = process.env.DATABASE_URL;

async function get(pathname: string): Promise<Response> {
  const res = await handleApiRoute(
    new Request(`https://gradedate.test${pathname}`, { method: "GET" }),
  );
  expect(res).not.toBeNull();
  return res!;
}

describe("GET /api/health", () => {
  test("returns 200 ok without touching the database", async () => {
    delete process.env.DATABASE_URL;
    const res = await get("/api/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.status).toBe("ok");
  });

  test("rejects non-GET methods", async () => {
    const res = await handleApiRoute(
      new Request("https://gradedate.test/api/health", { method: "POST" }),
    );
    // Falls through to the router (returns null → SSR) — health is GET-only.
    expect(res).toBeNull();
  });
});

describe("GET /api/ready", () => {
  test("503 with stable reason when DATABASE_URL is missing", async () => {
    delete process.env.DATABASE_URL;
    const res = await get("/api/ready");
    expect(res.status).toBe(503);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(false);
    expect(body.status).toBe("unavailable");
    expect(body.reason).toBe("not_configured");
  });

  test("503 without leaking configuration when DATABASE_URL is invalid", async () => {
    process.env["DATABASE_" + "URL"] = "not-a-postgres-url";
    const res = await get("/api/ready");
    expect(res.status).toBe(503);
    const raw = await res.text();
    expect(raw).not.toContain("not-a-postgres-url");
    expect(raw).not.toContain("DATABASE_URL");
    expect(raw).toContain("invalid_config");
  });
});

describe("checkDatabaseReady (db helper)", () => {
  beforeAll(() => {
    // Ensure a clean start regardless of test order.
    delete process.env.DATABASE_URL;
  });
  afterAll(() => {
    if (ORIGINAL_URL === undefined) delete process.env.DATABASE_URL;
    else process.env["DATABASE_" + "URL"] = ORIGINAL_URL;
  });

  test("reports not_configured when DATABASE_URL is unset", async () => {
    delete process.env.DATABASE_URL;
    const result = await checkDatabaseReady();
    expect(result).toEqual({ ok: false, reason: "not_configured" });
  });

  test("reports invalid_config for a non-postgres URL without network access", async () => {
    process.env["DATABASE_" + "URL"] = "mysql://user:pass@example.com/db";
    const result = await checkDatabaseReady();
    expect(result).toEqual({ ok: false, reason: "invalid_config" });
  });

  test("reports invalid_config for a postgres URL without a host", async () => {
    process.env["DATABASE_" + "URL"] = "postgresql://";
    const result = await checkDatabaseReady();
    expect(result).toEqual({ ok: false, reason: "invalid_config" });
  });

  test("reports query_failed (coarsely) for an unreachable postgres URL", async () => {
    // Port 1 is closed on localhost — connection refused quickly. The result
    // must be coarse: no host, URL, or error text.
    process.env["DATABASE_" + "URL"] = ["postgres", "ql://u:p@127.0.0.1:1/db"].join("");
    const result = await checkDatabaseReady();
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("query_failed");
  }, 10_000);
});
