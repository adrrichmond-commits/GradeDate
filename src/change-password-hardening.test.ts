import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";

/**
 * Change-password security hardening (follow-up to PR #148):
 * 1. Session revocation — a successful password change must revoke every other
 *    active session for the user while keeping the current session alive
 *    (revokeOtherSessions in src/db.ts, called from handleChangePassword).
 * 2. Rate limiting — POST /api/auth/change-password is limited to 5 attempts
 *    per client per 15 minutes (reuses the shared in-memory rate limiter from
 *    src/rate-limit.ts), returning a generic 429 so the response never reveals
 *    whether the current password was correct.
 *
 * Behavioral tests drive the real handleApiRoute with a mocked db module
 * (generated from api-handler's own import list, same pattern as
 * src/beta-invite.test.ts). BunPw is the real Bun.password implementation, so
 * the mock users are seeded with real PBKDF2 hashes.
 */
const apiSource = readFileSync(new URL("./api-handler.ts", import.meta.url), "utf8");
const dbImportMatch = apiSource.match(/import \{([^}]*)\} from "\.\.\/src\/db\.ts"/);
if (!dbImportMatch) throw new Error("could not locate db import block in api-handler.ts");
const DB_IMPORT_NAMES = dbImportMatch[1]
  .split(",")
  .map((s) => s.trim().replace(/^type\s+/, ""))
  .filter(Boolean);

// ── Shared mutable state the mocks read/write ──────────────────
const USER_ID = 100;
const OTHER_USER_ID = 101;
interface MockSession { id: string; user_id: number; revoked_at: string | null }
const usersById = new Map<number, Record<string, unknown>>();
const sessions = new Map<string, MockSession>();
let passwordUpdates: Array<{ userId: number; passwordHash: string }> = [];
let revokeCalls: Array<{ userId: number; keepSessionId: string }> = [];
const adminAudit: Array<Record<string, unknown>> = [];
let currentPassword = "oldpass123";

function baseUser(id: number, email: string, passwordHash: string): Record<string, unknown> {
  return {
    id,
    email,
    password_hash: passwordHash,
    display_name: null,
    age: 25,
    gender: null,
    looking_for: "",
    bio: null,
    photo_path: null,
    grade: null,
    subscription_status: "none",
    subscription_updated_at: null,
    subscription_expires_at: null,
    stripe_customer_id: null,
    stripe_subscription_id: null,
    verification_status: "verified",
    verification_session_id: null,
    verification_verified_at: null,
    verification_session_created_at: null,
    regrades_available: 0,
    boost_until: null,
    date_of_birth: "2000-01-01",
    latitude: null,
    longitude: null,
    max_distance: 50,
    location_city: null,
    location_state: null,
    daily_likes_remaining: 3,
    daily_likes_reset_at: null,
    last_free_regrade_at: null,
    percentile: null,
    percentile_city: null,
    like_packs: 0,
    role: "user",
    suspended_until: null,
    suspension_reason: null,
    is_founder: false,
    founder_number: null,
    founder_price_lock_price_id: null,
  };
}

async function resetState(): Promise<void> {
  passwordUpdates = [];
  revokeCalls = [];
  adminAudit.length = 0;
  currentPassword = "oldpass123";
  const hash = await Bun.password.hash(currentPassword);
  usersById.set(USER_ID, baseUser(USER_ID, "user@gradedate.test", hash));
  usersById.set(OTHER_USER_ID, baseUser(OTHER_USER_ID, "other@gradedate.test", hash));
  sessions.clear();
  sessions.set("s_current", { id: "s_current", user_id: USER_ID, revoked_at: null });
  sessions.set("s_other_1", { id: "s_other_1", user_id: USER_ID, revoked_at: null });
  sessions.set("s_other_2", { id: "s_other_2", user_id: USER_ID, revoked_at: null });
  sessions.set("s_other_user", { id: "s_other_user", user_id: OTHER_USER_ID, revoked_at: null });
}

function makeDbMock(): Record<string, unknown> {
  const mock: Record<string, unknown> = {};
  for (const name of DB_IMPORT_NAMES) mock[name] = async () => undefined;
  return {
    ...mock,
    getUserById: async (id: number) => usersById.get(id) ?? null,
    getSessionById: async (id: string) => {
      const s = sessions.get(id);
      if (!s || s.revoked_at) return null;
      return s;
    },
    updateUserPassword: async (userId: number, passwordHash: string) => {
      passwordUpdates.push({ userId, passwordHash });
      const u = usersById.get(userId);
      if (u) u.password_hash = passwordHash;
    },
    revokeOtherSessions: async (userId: number, keepSessionId: string) => {
      revokeCalls.push({ userId, keepSessionId });
      for (const s of sessions.values()) {
        if (s.user_id === userId && s.id !== keepSessionId) s.revoked_at = "2026-08-12T00:00:00Z";
      }
    },
    recordAdminAuditEvent: async (event: Record<string, unknown>) => { adminAudit.push(event); },
  };
}
mock.module("../src/db.ts", () => makeDbMock());

const ORIGINAL_STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
let handleApiRoute: (req: Request) => Promise<Response | null>;

beforeAll(async () => {
  process.env.STRIPE_SECRET_KEY = "sk_test_mock";
  ({ handleApiRoute } = await import("./api-handler"));
  await resetState();
});
afterAll(() => {
  if (ORIGINAL_STRIPE_KEY === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = ORIGINAL_STRIPE_KEY;
});

// ── Request helpers ───────────────────────────────────────────
let reqSeq = 0;
function freshIp(): string {
  reqSeq++;
  return `203.0.113.${(reqSeq % 200) + 10}`;
}
const CSRF = "csrf-token-a";
function changePasswordRequest(body: Record<string, unknown>, sessionId: string, ip?: string): Request {
  return new Request("https://gradedate.test/api/auth/change-password", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip ?? freshIp(),
      cookie: `csrf_token=${CSRF}; session_id=${sessionId}`,
      "X-CSRF-Token": CSRF,
    },
    body: JSON.stringify(body),
  });
}

// ── Tests ─────────────────────────────────────────────────────
describe("change-password session revocation", () => {
  beforeEach(async () => { await resetState(); });

  test("a successful change revokes every other session but keeps the current one alive", async () => {
    const res = await handleApiRoute(
      changePasswordRequest(
        { current_password: "oldpass123", new_password: "newpass456" },
        "s_current",
        "203.0.113.50",
      ),
    );
    expect(res!.status).toBe(200);
    expect(await res!.json()).toEqual({ ok: true });

    // revokeOtherSessions was called with the current session id as the keeper.
    expect(revokeCalls).toEqual([{ userId: USER_ID, keepSessionId: "s_current" }]);

    // Other sessions for the same user are revoked (no longer valid).
    const other1 = await handleApiRoute(
      new Request("https://gradedate.test/api/auth/me", {
        headers: { cookie: `csrf_token=${CSRF}; session_id=s_other_1` },
      }),
    );
    expect(other1!.status).toBe(401);
    const other2 = await handleApiRoute(
      new Request("https://gradedate.test/api/auth/me", {
        headers: { cookie: `csrf_token=${CSRF}; session_id=s_other_2` },
      }),
    );
    expect(other2!.status).toBe(401);

    // A session belonging to a different user is untouched.
    const otherUser = await handleApiRoute(
      new Request("https://gradedate.test/api/auth/me", {
        headers: { cookie: `csrf_token=${CSRF}; session_id=s_other_user` },
      }),
    );
    expect(otherUser!.status).toBe(200);

    // The current session is still valid after the change.
    const me = await handleApiRoute(
      new Request("https://gradedate.test/api/auth/me", {
        headers: { cookie: `csrf_token=${CSRF}; session_id=s_current` },
      }),
    );
    expect(me!.status).toBe(200);

    // The password hash was actually updated.
    expect(passwordUpdates).toHaveLength(1);
    expect(passwordUpdates[0].userId).toBe(USER_ID);
    expect(passwordUpdates[0].passwordHash).not.toContain("oldpass123");
  });

  test("a failed change (wrong current password) revokes nothing", async () => {
    const res = await handleApiRoute(
      changePasswordRequest(
        { current_password: "wrong-password", new_password: "newpass456" },
        "s_current",
        "203.0.113.51",
      ),
    );
    expect(res!.status).toBe(401);
    expect(revokeCalls).toHaveLength(0);
    expect(passwordUpdates).toHaveLength(0);
    // All sessions remain valid.
    for (const id of ["s_current", "s_other_1", "s_other_2"]) {
      expect(sessions.get(id)!.revoked_at).toBeNull();
    }
  });
});

describe("change-password rate limiting", () => {
  beforeEach(async () => { await resetState(); });

  test("5 attempts are allowed, the 6th from the same client is 429 with a generic message", async () => {
    const ip = "203.0.113.60";
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await handleApiRoute(
        changePasswordRequest(
          { current_password: "wrong-password", new_password: "newpass456" },
          "s_current",
          ip,
        ),
      );
      statuses.push(res!.status);
    }
    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses[5]).toBe(429);

    const body = (await (await handleApiRoute(
      changePasswordRequest(
        { current_password: "wrong-password", new_password: "newpass456" },
        "s_current",
        ip,
      ),
    ))!.json()) as Record<string, unknown>;
    expect(body.code).toBe("RATE_LIMITED");
    // Generic message — must not hint whether the current password was correct.
    expect(String(body.error)).toContain("Too many requests");
    expect(String(body.error)).not.toContain("password");
    // No side effects: nothing was revoked or re-hashed.
    expect(revokeCalls).toHaveLength(0);
    expect(passwordUpdates).toHaveLength(0);
  });

  test("a different client is not blocked by another client's limit", async () => {
    for (let i = 0; i < 6; i++) {
      await handleApiRoute(
        changePasswordRequest(
          { current_password: "wrong-password", new_password: "newpass456" },
          "s_current",
          "203.0.113.61",
        ),
      );
    }
    const res = await handleApiRoute(
      changePasswordRequest(
        { current_password: "wrong-password", new_password: "newpass456" },
        "s_current",
        "203.0.113.62",
      ),
    );
    expect(res!.status).toBe(401);
  });
});

describe("change-password existing behavior preserved", () => {
  beforeEach(async () => { await resetState(); });

  test("missing CSRF token is rejected with 403 before anything else", async () => {
    const req = new Request("https://gradedate.test/api/auth/change-password", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": freshIp(), cookie: "session_id=s_current" },
      body: JSON.stringify({ current_password: "oldpass123", new_password: "newpass456" }),
    });
    const res = await handleApiRoute(req);
    expect(res!.status).toBe(403);
    expect(((await res!.json()) as Record<string, unknown>).error).toBe("Invalid or missing CSRF token");
    expect(revokeCalls).toHaveLength(0);
  });

  test("wrong current password returns 401 without changing the password", async () => {
    const res = await handleApiRoute(
      changePasswordRequest(
        { current_password: "wrong-password", new_password: "newpass456" },
        "s_current",
        "203.0.113.70",
      ),
    );
    expect(res!.status).toBe(401);
    expect(((await res!.json()) as Record<string, unknown>).error).toBe("Current password is incorrect");
    expect(passwordUpdates).toHaveLength(0);
    expect(revokeCalls).toHaveLength(0);
  });

  test("unauthenticated request returns 401", async () => {
    const res = await handleApiRoute(
      changePasswordRequest(
        { current_password: "oldpass123", new_password: "newpass456" },
        "s_nonexistent",
        "203.0.113.71",
      ),
    );
    expect(res!.status).toBe(401);
    expect(((await res!.json()) as Record<string, unknown>).error).toBe("Unauthorized");
  });

  test("successful change returns {ok:true} and updates the stored hash", async () => {
    const res = await handleApiRoute(
      changePasswordRequest(
        { current_password: "oldpass123", new_password: "newpass456" },
        "s_current",
        "203.0.113.72",
      ),
    );
    expect(res!.status).toBe(200);
    expect(await res!.json()).toEqual({ ok: true });
    expect(passwordUpdates).toHaveLength(1);
    // The new hash verifies against the new password, not the old one.
    const stored = usersById.get(USER_ID)!.password_hash as string;
    expect(await Bun.password.verify("newpass456", stored)).toBe(true);
    expect(await Bun.password.verify("oldpass123", stored)).toBe(false);
  });

  test("an invalid new password is rejected with 400 and nothing changes", async () => {
    const res = await handleApiRoute(
      changePasswordRequest(
        { current_password: "oldpass123", new_password: "123" },
        "s_current",
        "203.0.113.73",
      ),
    );
    expect(res!.status).toBe(400);
    expect(passwordUpdates).toHaveLength(0);
    expect(revokeCalls).toHaveLength(0);
  });
});

describe("change-password hardening source wiring", () => {
  test("router rate-limits change-password with the shared limiter", () => {
    expect(apiSource).toContain('checkRateLimit(req, "change-password", { maxRequests: 5, windowMs: 15 * 60 * 1000 })');
  });
  test("handler revokes other sessions after a successful change", () => {
    expect(apiSource).toContain("await revokeOtherSessions(user.id, sessionId);");
    expect(apiSource).toContain("const sessionId = getSessionId(req);");
  });
});
