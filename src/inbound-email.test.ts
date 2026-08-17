/**
 * Tests for the Resend inbound webhook receiver (legal@gradedate.app):
 * secret gate (Svix signature + legacy header), payload parsing, and
 * forwarding to the owner's Gmail with a mocked send path.
 */
import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import {
  handleInboundEmail,
  verifyInboundRequest,
  verifySvixSignature,
  INBOUND_FORWARD_TO,
} from "./inbound-email";

/** Produce a valid Svix v1 signature header for a payload (same algorithm as
 *  the `standardwebhooks` package Resend's SDK uses). */
function svixSign(rawBody: string, id: string, timestampSec: number, secret: string): string {
  const key = secret.startsWith("whsec_") ? Buffer.from(secret.slice(6), "base64") : Buffer.from(secret, "utf8");
  const sig = createHmac("sha256", key).update(`${id}.${timestampSec}.${rawBody}`).digest("base64");
  return `v1,${sig}`;
}

const SECRET = "whsec_dGVzdC1zZWNyZXQtdmFsdWUtMTIz"; // whsec_ + base64("test-secret-value-123")
// Real "now" — the verifier compares against Date.now() unless injected.
const TS = Math.floor(Date.now() / 1000);

describe("inbound email secret gate", () => {
  test("accepts a valid Svix-signed request (documented Resend contract)", () => {
    const body = JSON.stringify({ type: "email.received", data: { email_id: "e1" } });
    const headers = new Headers({
      "svix-id": "msg_1",
      "svix-timestamp": String(TS),
      "svix-signature": svixSign(body, "msg_1", TS, SECRET),
    });
    expect(verifyInboundRequest(body, headers, { INBOUND_EMAIL_SECRET: SECRET })).toBe(true);
  });

  test("rejects a tampered body, wrong secret, and missing headers", () => {
    const body = JSON.stringify({ type: "email.received", data: { email_id: "e1" } });
    const goodSig = svixSign(body, "msg_1", TS, SECRET);
    // tampered body
    const tampered = body.replace("e1", "e2");
    expect(verifyInboundRequest(tampered, new Headers({ "svix-id": "msg_1", "svix-timestamp": String(TS), "svix-signature": goodSig }), { INBOUND_EMAIL_SECRET: SECRET })).toBe(false);
    // wrong secret
    const otherSig = svixSign(body, "msg_1", TS, "whsec_other");
    expect(verifyInboundRequest(body, new Headers({ "svix-id": "msg_1", "svix-timestamp": String(TS), "svix-signature": otherSig }), { INBOUND_EMAIL_SECRET: SECRET })).toBe(false);
    // no svix headers, no secret header
    expect(verifyInboundRequest(body, new Headers(), { INBOUND_EMAIL_SECRET: SECRET })).toBe(false);
    // env secret not configured
    expect(verifyInboundRequest(body, new Headers({ "svix-id": "msg_1", "svix-timestamp": String(TS), "svix-signature": goodSig }), {})).toBe(false);
  });

  test("rejects stale timestamps beyond the 5-minute tolerance", () => {
    const body = JSON.stringify({ data: {} });
    const stale = TS - 301;
    const sig = svixSign(body, "msg_1", stale, SECRET);
    expect(verifySvixSignature(body, "msg_1", String(stale), sig, SECRET)).toBe(false);
    // fresh timestamp passes at the same boundary
    const fresh = TS - 299;
    const sig2 = svixSign(body, "msg_1", fresh, SECRET);
    expect(verifySvixSignature(body, "msg_1", String(fresh), sig2, SECRET)).toBe(true);
  });

  test("accepts the legacy inbound-route secret header when Svix headers are absent", () => {
    const body = "from=a&subject=hi";
    const headers = new Headers({ "x-resend-secret": SECRET });
    expect(verifyInboundRequest(body, headers, { INBOUND_EMAIL_SECRET: SECRET })).toBe(true);
    const bad = new Headers({ "x-resend-secret": "wrong" });
    expect(verifyInboundRequest(body, bad, { INBOUND_EMAIL_SECRET: SECRET })).toBe(false);
  });

  test("a bad Svix signature is rejected even if a secret header is also present", () => {
    const body = JSON.stringify({ type: "email.received" });
    const headers = new Headers({
      "svix-id": "msg_1",
      "svix-timestamp": String(TS),
      "svix-signature": "v1,AAAA",
      "x-resend-secret": SECRET,
    });
    expect(verifyInboundRequest(body, headers, { INBOUND_EMAIL_SECRET: SECRET })).toBe(false);
  });
});

describe("inbound email forwarding", () => {
  test("forwards a JSON email.received event (fetches body via the receiving API)", async () => {
    const event = JSON.stringify({ type: "email.received", data: { email_id: "recv-123" } });
    const headers = new Headers({
      "content-type": "application/json",
      "svix-id": "msg_2",
      "svix-timestamp": String(TS),
      "svix-signature": svixSign(event, "msg_2", TS, SECRET),
    });
    const req = new Request("https://gradedate.app/api/inbound-email", { method: "POST", headers, body: event });
    let forwarded: Record<string, unknown> | null = null;
    const res = await handleInboundEmail(req, { INBOUND_EMAIL_SECRET: SECRET, RESEND_API_KEY: "re_test" }, {
      sendForward: async (payload) => { forwarded = payload as unknown as Record<string, unknown>; return true; },
      fetchJson: async (url, init) => {
        expect(url).toBe("https://api.resend.com/emails/receiving/recv-123");
        expect((init?.headers as Record<string, string>)?.Authorization).toBe("Bearer re_test");
        return { from: "sheriff@example.gov", to: ["legal@gradedate.app"], subject: "PRESERVATION REQUEST", text: "preserve user 42", html: null };
      },
          });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, forwarded: true });
    expect(forwarded?.to).toBe(INBOUND_FORWARD_TO);
    expect(forwarded?.subject).toBe("PRESERVATION REQUEST");
    expect(forwarded?.text).toBe("preserve user 42");
    expect(forwarded?.replyTo).toBe("sheriff@example.gov");
  });

  test("forwards a legacy multipart/form-data webhook without extra fetches", async () => {
    const form = new FormData();
    form.set("from", "officer@example.gov");
    form.set("to", "legal@gradedate.app");
    form.set("subject", "EMERGENCY — immediate danger");
    form.set("text", "need account data now");
    const req = new Request("https://gradedate.app/api/inbound-email", {
      method: "POST",
      headers: { "x-resend-secret": SECRET },
      body: form,
    });
    let forwarded: Record<string, unknown> | null = null;
    const res = await handleInboundEmail(req, { INBOUND_EMAIL_SECRET: SECRET }, {
      sendForward: async (payload) => { forwarded = payload as unknown as Record<string, unknown>; return true; },
      fetchJson: async () => { throw new Error("must not fetch"); },
    });
    expect(res.status).toBe(200);
    expect(forwarded?.subject).toBe("EMERGENCY — immediate danger");
    expect(forwarded?.replyTo).toBe("officer@example.gov");
  });

  test("returns 401 and never forwards when the secret is missing or wrong", async () => {
    let calls = 0;
    const res = await handleInboundEmail(
      new Request("https://gradedate.app/api/inbound-email", { method: "POST", body: "{}" }),
      { INBOUND_EMAIL_SECRET: SECRET },
      { sendForward: async () => { calls++; return true; } },
    );
    expect(res.status).toBe(401);
    expect(calls).toBe(0);
  });

  test("returns 502 when the forward send fails but still acknowledges receipt shape", async () => {
    const event = JSON.stringify({ type: "email.received", data: { email_id: "recv-9" } });
    const headers = new Headers({
      "content-type": "application/json",
      "svix-id": "msg_3",
      "svix-timestamp": String(TS),
      "svix-signature": svixSign(event, "msg_3", TS, SECRET),
    });
    const req = new Request("https://gradedate.app/api/inbound-email", { method: "POST", headers, body: event });
    const res = await handleInboundEmail(req, { INBOUND_EMAIL_SECRET: SECRET, RESEND_API_KEY: "re_test" }, {
      sendForward: async () => false,
      fetchJson: async () => ({ from: "a@b.c", to: [], subject: "s", text: "t", html: null }),
    });
    expect(res.status).toBe(502);
  });
});
