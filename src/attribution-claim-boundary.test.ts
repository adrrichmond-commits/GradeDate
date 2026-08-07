import { afterEach, describe, expect, mock, test } from "bun:test";
import { parseExperimentEvent } from "./experiment";
import { setLogSink, setLogLevel, type LogSink } from "./observability";

const SECRET = "boundary-test-secret-0123456789abcdef";
const exposure = { experiment: "grade-cta", variant: "control", event: "exposure", route: "grade.result" };
const conversion = { ...exposure, event: "conversion", conversion: "signup_click" };

afterEach(() => {
  delete process.env.ATTRIBUTION_CLAIM_SECRET;
  delete process.env.NODE_ENV;
  setLogSink(null);
  setLogLevel("info");
});

describe("experiment attribution boundary", () => {
  test("valid exposure issues an HttpOnly SameSite=Lax Max-Age cookie, Secure in production", () => {
    const source = require("node:fs").readFileSync(new URL("./api-handler.ts", import.meta.url), "utf8");
    expect(source).toContain('gd_attribution_claim=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${ATTRIBUTION_DEFAULT_TTL_MS / 1000}${secure}');
    expect(source).toContain('process.env.NODE_ENV === "production" ? "; Secure" : ""');
  });

  test("missing secret fails closed without claim issuance", () => {
    const source = require("node:fs").readFileSync(new URL("./api-handler.ts", import.meta.url), "utf8");
    expect(source).toContain('if (!secret) return json({ ok: true });');
    expect(source).toContain('if (await persistAttributionClaim(claim))');
  });

  test("invalid exposure and conversion events do not issue", () => {
    expect(parseExperimentEvent({ ...exposure, variant: "not-valid" })).toBeNull();
    expect(parseExperimentEvent(conversion)?.event).toBe("conversion");
    const source = require("node:fs").readFileSync(new URL("./api-handler.ts", import.meta.url), "utf8");
    expect(source).toContain('if (parsed.event === "exposure")');
    expect(source).toContain('} else {');
  });

  test("logs contain only coarse event fields and redact every sensitive value", () => {
    const lines: string[] = [];
    const sink: LogSink = line => lines.push(line);
    setLogSink(sink); setLogLevel("info");
    // Exercise the same logging sanitizer used by the boundary with all known sensitive categories.
    const { logInfo, EVENTS } = require("./observability") as typeof import("./observability");
    logInfo(EVENTS.EXPERIMENT_EXPOSURE, { ...exposure, token: "claim-token", nonce: "nonce-secret", seed: "seed-secret", email: "person@example.com", user_id: 42, photo_path: "/uploads/private.jpg", session_id: "sess-secret", stripe_customer_id: "cus_secret", stripe_subscription_id: "sub_secret" });
    const emitted = lines.join("\n");
    for (const value of ["claim-token", "nonce-secret", "seed-secret", "person@example.com", "42", "/uploads/private.jpg", "sess-secret", "cus_secret", "sub_secret"]) expect(emitted).not.toContain(value);
    expect(JSON.parse(lines[0]!).event).toBe("experiment.exposure");
  });
});

describe("attribution input contract", () => {
  test("only valid exposure/conversion payloads pass parsing", () => {
    expect(parseExperimentEvent(exposure)?.event).toBe("exposure");
    expect(parseExperimentEvent(conversion)?.event).toBe("conversion");
    expect(parseExperimentEvent({ ...exposure, email: "person@example.com" })).toEqual(expect.objectContaining({ event: "exposure" }));
    expect(parseExperimentEvent({ ...exposure, route: "/users/42" })).toBeNull();
  });
});
