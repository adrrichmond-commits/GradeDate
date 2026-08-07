import { describe, expect, test } from "bun:test";
import { apiFetch, parseRetryAfter } from "./client-api";

describe("client API errors", () => {
  test("parses seconds and HTTP dates, bounded", () => {
    expect(parseRetryAfter("12")).toBe(12);
    expect(parseRetryAfter("-1")).toBe(0);
    expect(parseRetryAfter("999999")).toBe(3600);
    expect(parseRetryAfter("not-a-delay")).toBeNull();
    expect(parseRetryAfter(new Date(11000).toUTCString(), 10000)).toBe(1);
  });
  test("classifies status and never exposes server text", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () => new Response("<html>bad secret</html>", { status: 503, headers: { "Retry-After": "30" } });
    try {
      try { await apiFetch("/x"); throw new Error("expected rejection"); } catch (error) { expect(error).toBeInstanceOf(Error); expect((error as any).kind).toBe("service_unavailable"); expect((error as any).retryAfterSeconds).toBe(30); expect((error as Error).message).toBe("GradeDate is having trouble right now. Please try again."); }
    } finally { globalThis.fetch = original; }
  });
  test("handles malformed JSON and ordinary API errors safely", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async (input) => new Response(input === "/bad" ? "oops" : JSON.stringify({ error: "internal secret" }), { status: input === "/bad" ? 200 : 400, headers: { "content-type": "application/json" } });
    try {
      await expect(apiFetch("/bad")).rejects.toMatchObject({ kind: "malformed" });
      await expect(apiFetch("/api")).rejects.toMatchObject({ kind: "api", message: "We couldn't complete that request." });
    } finally { globalThis.fetch = original; }
  });
  test("classifies network failure and auth/rate limits", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error("secret network detail"); };
    try { await expect(apiFetch("/x")).rejects.toMatchObject({ kind: "network" }); } finally { globalThis.fetch = original; }
    for (const [status, kind] of [[401, "unauthorized"], [403, "forbidden"], [429, "rate_limited"]] as const) {
      globalThis.fetch = async () => new Response(JSON.stringify({ error: "secret" }), { status, headers: { "content-type": "application/json" } });
      try { await expect(apiFetch("/x")).rejects.toMatchObject({ kind }); } finally { globalThis.fetch = original; }
    }
  });
});
