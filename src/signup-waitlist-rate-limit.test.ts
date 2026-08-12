import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";

/**
 * Signup vs waitlist rate-limit isolation (QA session 5b4848bb finding):
 * signup and waitlist-join previously shared ONE strict in-memory bucket
 * (ip:strict, 5 requests/15 min), so five waitlist joins exhausted the budget
 * and every subsequent signup from the same client returned 429 for ~15 min —
 * a real beta-launch blocker for shared-IP cohort onboarding (an office/ISP
 * NAT is one client key).
 *
 * Fixed: signup gets its own generous bucket (20/15 min) and waitlist-join its
 * own bucket (kept at 5/15 min). This file proves one funnel never starves the
 * other, both limits are still enforced per bucket, 429 responses stay
 * generic (no information leak), and CSRF enforcement is unchanged.
 *
 * Same pattern as src/change-password-hardening.test.ts: the db module is
 * mocked from api-handler's own import list and the real handleApiRoute is
 * driven directly. The rate-limit store is per-process, so every test uses a
 * distinct client IP.
 */
const apiSource = readFileSync(new URL("./api-handler.ts", import.meta.url), "utf8");
const dbImportMatch = apiSource.match(/import \{([^}]*)\} from "\.\.\/src\/db\.ts"/);
if (!dbImportMatch) throw new Error("could not locate db import block in api-handler.ts");
const DB_IMPORT_NAMES = dbImportMatch[1]
  .split(",")
  .map((s) => s.trim().replace(/^type\s+/, ""))
  .filter(Boolean);

function makeDbMock(): Record<string, unknown> {
  const mock: Record<string, unknown> = {};
  for (const name of DB_IMPORT_NAMES) mock[name] = async () => undefined;
  return mock;
}
mock.module("../src/db.ts", () => makeDbMock());

const ORIGINAL_STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
let handleApiRoute: (req: Request) => Promise<Response | null>;

beforeAll(async () => {
  process.env.STRIPE_SECRET_KEY = "sk_test_mock";
  ({ handleApiRoute } = await import("./api-handler"));
});
afterAll(() => {
  if (ORIGINAL_STRIPE_KEY === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = ORIGINAL_STRIPE_KEY;
});

// ── Request helpers ───────────────────────────────────────────
let reqSeq = 0;
function freshIp(): string {
  reqSeq++;
  return `198.51.100.${(reqSeq % 200) + 10}`;
}

function post(pathname: string, body: unknown, ip: string): Request {
  return new Request(`https://gradedate.test${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

// Missing-email/password bodies hit validation (400) AFTER the rate-limit
// check, so they exercise the bucket without touching the DB or email seams.
describe("signup vs waitlist rate-limit isolation", () => {
  test("waitlist exhaustion does NOT affect signup (separate buckets)", async () => {
    const ip = "203.0.113.201";
    // Exhaust the waitlist bucket: 5 allowed (400 body validation), 6th is 429.
    const waitlistStatuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await handleApiRoute(post("/api/waitlist/join", {}, ip));
      waitlistStatuses.push(res!.status);
    }
    expect(waitlistStatuses.slice(0, 5)).toEqual([400, 400, 400, 400, 400]);
    expect(waitlistStatuses[5]).toBe(429);
    // A signup from the same IP is NOT blocked — its own bucket is still fresh.
    const signupRes = await handleApiRoute(post("/api/auth/signup", {}, ip));
    expect(signupRes!.status).toBe(400); // body validation, not 429
  });

  test("signup exhaustion does NOT affect waitlist (separate buckets)", async () => {
    const ip = "203.0.113.202";
    // Exhaust the signup bucket: 20 allowed, 21st is 429.
    const signupStatuses: number[] = [];
    for (let i = 0; i < 21; i++) {
      const res = await handleApiRoute(post("/api/auth/signup", {}, ip));
      signupStatuses.push(res!.status);
    }
    expect(signupStatuses.slice(0, 20).every((s) => s === 400)).toBe(true);
    expect(signupStatuses[20]).toBe(429);
    // A waitlist join from the same IP is NOT blocked.
    const waitlistRes = await handleApiRoute(post("/api/waitlist/join", {}, ip));
    expect(waitlistRes!.status).toBe(400); // not 429
  });

  test("each bucket is still enforced and the 429 stays generic", async () => {
    const ip = "203.0.113.203";
    for (let i = 0; i < 20; i++) {
      expect((await handleApiRoute(post("/api/auth/signup", {}, ip)))!.status).toBe(400);
    }
    const blocked = await handleApiRoute(post("/api/auth/signup", {}, ip));
    expect(blocked!.status).toBe(429);
    const body = (await blocked!.json()) as Record<string, unknown>;
    expect(body.code).toBe("RATE_LIMITED");
    // Generic message — must never reveal endpoint-specific detail.
    expect(String(body.error)).toContain("Too many requests");
    expect(String(body.error)).not.toContain("signup");
    expect(String(body.error)).not.toContain("waitlist");
  });

  test("a different client is not blocked by another client's exhaustion", async () => {
    const ipA = "203.0.113.204";
    for (let i = 0; i < 6; i++) {
      await handleApiRoute(post("/api/waitlist/join", {}, ipA));
    }
    const res = await handleApiRoute(post("/api/waitlist/join", {}, "203.0.113.205"));
    expect(res!.status).toBe(400);
  });

  test("CSRF is still required exactly where it was before", async () => {
    // /api/upload is CSRF-protected and still rejects a token-less POST.
    const noCsrf = new Request("https://gradedate.test/api/upload", {
      method: "POST",
      headers: { "x-forwarded-for": freshIp() },
      body: new FormData(),
    });
    const uploadRes = await handleApiRoute(noCsrf);
    expect(uploadRes!.status).toBe(403);
    expect(((await uploadRes!.json()) as Record<string, unknown>).error).toBe(
      "Invalid or missing CSRF token",
    );

    // Signup and waitlist remain public pre-auth routes (no CSRF needed) —
    // behavior unchanged; both still hit body validation, not a CSRF 403.
    const signupRes = await handleApiRoute(post("/api/auth/signup", {}, freshIp()));
    expect(signupRes!.status).toBe(400);
    const waitlistRes = await handleApiRoute(post("/api/waitlist/join", {}, freshIp()));
    expect(waitlistRes!.status).toBe(400);
  });
});

describe("signup/waitlist rate-limit source wiring", () => {
  test("signup uses its own dedicated bucket, not the shared strict one", () => {
    expect(apiSource).toContain(
      'checkRateLimit(req, "signup", { maxRequests: 20, windowMs: 15 * 60 * 1000 })',
    );
  });
  test("waitlist uses its own dedicated bucket, not the shared strict one", () => {
    expect(apiSource).toContain(
      'checkRateLimit(req, "waitlist", { maxRequests: 5, windowMs: 15 * 60 * 1000 })',
    );
  });
  test("handleSignup no longer uses the shared strict bucket", () => {
    const signupBlock = apiSource.slice(
      apiSource.indexOf("async function handleSignup"),
      apiSource.indexOf("async function handleLogin"),
    );
    expect(signupBlock).not.toContain("checkStrictRateLimit");
  });
  test("handleWaitlistJoin no longer uses the shared strict bucket", () => {
    const waitlistBlock = apiSource.slice(
      apiSource.indexOf("async function handleWaitlistJoin"),
      apiSource.indexOf("// ── Contact"),
    );
    expect(waitlistBlock).not.toContain("checkStrictRateLimit");
  });
});
