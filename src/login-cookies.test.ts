import { describe, expect, test } from "bun:test";
import { setCsrfCookie, CSRF_COOKIE } from "./csrf";
import { setSessionCookie } from "./api-handler";

const SESSION_COOKIE = "session_id";

/**
 * Regression: login (and signup) compose setCsrfCookie() then setSessionCookie().
 * setSessionCookie used headers.set("Set-Cookie", ...) which REPLACED the CSRF
 * cookie, so the login response only carried session_id — any client relying on
 * the login response's CSRF cookie (e.g. a session-reuse harness, or a client
 * that skips /api/auth/me) then 403'd on every subsequent request.
 */
describe("login response cookie composition", () => {
  test("login response emits BOTH csrf_token and session_id cookies", () => {
    const loginResponse = setSessionCookie(
      setCsrfCookie(new Response(JSON.stringify({ user: { id: 1 } }), { status: 200 }), "csrf-token-abc"),
      "session-123",
    );
    const cookies = loginResponse.headers.getSetCookie();
    expect(cookies.some((c) => c.startsWith(`${CSRF_COOKIE}=csrf-token-abc`))).toBe(true);
    expect(cookies.some((c) => c.startsWith(`${SESSION_COOKIE}=session-123`))).toBe(true);
    expect(cookies.length).toBe(2);
  });

  test("setSessionCookie alone does not drop a pre-existing csrf cookie", () => {
    const base = setCsrfCookie(new Response("{}", { status: 200 }), "tok-1");
    const final = setSessionCookie(base, "sid-1");
    const cookies = final.headers.getSetCookie();
    expect(cookies.some((c) => c.startsWith(`${CSRF_COOKIE}=tok-1`))).toBe(true);
    expect(cookies.some((c) => c.startsWith(`${SESSION_COOKIE}=sid-1`))).toBe(true);
  });

  test("setCsrfCookie does not drop a pre-existing session cookie (composition order independent)", () => {
    const base = setSessionCookie(new Response("{}", { status: 200 }), "sid-2");
    const final = setCsrfCookie(base, "tok-2");
    const cookies = final.headers.getSetCookie();
    expect(cookies.some((c) => c.startsWith(`${CSRF_COOKIE}=tok-2`))).toBe(true);
    expect(cookies.some((c) => c.startsWith(`${SESSION_COOKIE}=sid-2`))).toBe(true);
  });

  test("setCsrfCookie alone sets exactly one cookie (no stray duplicates)", () => {
    const final = setCsrfCookie(new Response("{}", { status: 200 }), "tok-3");
    expect(final.headers.getSetCookie().length).toBe(1);
    expect(final.headers.getSetCookie()[0].startsWith(`${CSRF_COOKIE}=tok-3`)).toBe(true);
  });
});
