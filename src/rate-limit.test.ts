import { describe, expect, test } from "bun:test";
import { getClientKey, rateLimit } from "./rate-limit";

describe("rate limiting", () => {
  test("uses forwarded client IP and does not collapse distinct users", () => {
    const a = new Request("https://example.test", { headers: { "x-forwarded-for": "1.1.1.1, proxy" } });
    const b = new Request("https://example.test", { headers: { "x-forwarded-for": "2.2.2.2, proxy" } });
    expect(getClientKey(a)).toBe("ip:1.1.1.1");
    expect(getClientKey(b)).toBe("ip:2.2.2.2");
  });
  test("falls back to CSRF cookie instead of loopback global key", () => {
    const req = new Request("https://example.test", { headers: { cookie: "gradedate_csrf=browser-a" } });
    expect(getClientKey(req)).toBe("csrf:browser-a");
  });
  test("returns retry timing after the configured budget", () => {
    const first = rateLimit("test-isolated", "grade", { maxRequests: 1, windowMs: 60_000 });
    const second = rateLimit("test-isolated", "grade", { maxRequests: 1, windowMs: 60_000 });
    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(false);
    expect(second.retryAfterSec).toBeGreaterThan(0);
  });
});
