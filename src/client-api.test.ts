import { describe, expect, it, mock } from "bun:test";
import { apiFetch, safeApiError } from "./client-api";

describe("apiFetch actionable errors", () => {
  it("shows server validation/conflict messages", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = mock(async () => new Response(JSON.stringify({ error: "An account with this email already exists" }), { status: 409, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
    try {
      await expect(apiFetch("/api/auth/signup", { method: "POST" })).rejects.toMatchObject({ message: "An account with this email already exists", status: 409 });
    } finally { globalThis.fetch = original; }
  });

  it("does not expose server details for 503", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = mock(async () => new Response(JSON.stringify({ error: "database password leaked", code: "SIGNUP_UNAVAILABLE" }), { status: 503, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
    try {
      let error: unknown;
      try { await apiFetch("/api/auth/signup", { method: "POST" }); } catch (caught) { error = caught; }
      expect(safeApiError(error)).toBe("GradeDate is having trouble right now. Please try again.");
    } finally { globalThis.fetch = original; }
  });
});
