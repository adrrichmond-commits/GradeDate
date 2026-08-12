import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";

/**
 * Closed-beta invite system (Austin cohort):
 * - BETA_INVITE_REQUIRED=true gates signup behind a valid beta invite code
 *   AND an Austin-metro IP location (flag defaults OFF in code).
 * - Codes are stored server-side with issued/redeemed state; cohort 1 caps at
 *   50 REDEEMED signups (enforced atomically at redemption).
 * - Redeeming a beta code fires the existing referral reward (the invite code
 *   is also a referral_codes row with max_uses=1 tied to the inviter), so the
 *   inviter and referee each get 1 month Premium when the referee subscribes.
 * - Cohort-full signups are rejected with a clear message and the blocked
 *   email is handed to the existing waitlist.
 * - Issuance is an owner/admin-only route behind the privileged-MFA gate,
 *   audit-logged, and never ships a backdoor.
 *
 * Behavioral tests drive the real handleApiRoute through mock.module for the
 * db, geo, and stripe modules; the db mock is generated from api-handler's own
 * import list so every import is satisfied.
 */
const apiSource = readFileSync(new URL("./api-handler.ts", import.meta.url), "utf8");
const dbImportMatch = apiSource.match(/import \{([^}]*)\} from "\.\.\/src\/db\.ts"/);
if (!dbImportMatch) throw new Error("could not locate db import block in api-handler.ts");
const DB_IMPORT_NAMES = dbImportMatch[1]
  .split(",")
  .map((s) => s.trim().replace(/^type\s+/, ""))
  .filter(Boolean);

// ── Shared mutable state the mocks read/write ──────────────────
const ADMIN_ID = 7;
const INVITER_ID = 8;
let nextUserId = 100;
const usersById = new Map<number, Record<string, unknown>>();
const sessions = new Map<string, { id: string; user_id: number; mfa_verified_at?: string | null }>();
const invites = new Map<string, { code: string; referrer_user_id: number; redeemed_at: string | null; redeemed_by_user_id: number | null }>();
let redeemedCount = 0;
const referralRewards: Array<{ referrer_user_id: number; referee_user_id: number }> = [];
const adminAudit: Array<Record<string, unknown>> = [];
const waitlistEnrollments: string[] = [];
const deletedUsers: number[] = [];
const issuedCalls: Array<{ codes: string[]; referrerUserId: number; issuedByUserId: number }> = [];
let mockGeo = { city: "Austin", region: "TX", isAustinMetro: true };
let forceRedeemRace = false;
let failWaitlistJoin = false;
let mockCodeSeq = 0;

function baseUser(id: number, email: string): Record<string, unknown> {
  return {
    id,
    email,
    password_hash: "hash",
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
    verification_status: "unverified",
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

function resetState(): void {
  nextUserId = 100;
  usersById.clear();
  sessions.clear();
  invites.clear();
  redeemedCount = 0;
  referralRewards.length = 0;
  adminAudit.length = 0;
  waitlistEnrollments.length = 0;
  deletedUsers.length = 0;
  issuedCalls.length = 0;
  mockGeo = { city: "Austin", region: "TX", isAustinMetro: true };
  forceRedeemRace = false;
  failWaitlistJoin = false;
  mockCodeSeq = 0;
  // Seed an owner (with a privileged MFA-verified session) and an inviter.
  usersById.set(ADMIN_ID, { ...baseUser(ADMIN_ID, "owner@gradedate.app"), role: "owner", verification_status: "verified" });
  usersById.set(INVITER_ID, { ...baseUser(INVITER_ID, "inviter@gradedate.test"), verification_status: "verified" });
  sessions.set("s_admin", { id: "s_admin", user_id: ADMIN_ID, mfa_verified_at: "2026-08-11T16:00:00Z" });
}

function makeDbMock(): Record<string, unknown> {
  const mock: Record<string, unknown> = {};
  for (const name of DB_IMPORT_NAMES) mock[name] = async () => undefined;
  const cohortCap = () => {
    const n = Number(process.env.BETA_COHORT_CAP);
    return Number.isInteger(n) && n > 0 ? n : 50;
  };
  return {
    ...mock,
    betaCohortCap: cohortCap,
    getUserByEmail: async (email: string) => {
      for (const u of usersById.values()) if (u.email === email) return u;
      return null;
    },
    getUserById: async (id: number) => usersById.get(id) ?? null,
    createUser: async (email: string, _hash: string, dob?: string) => {
      const u = baseUser(nextUserId, email);
      u.date_of_birth = dob ?? null;
      usersById.set(nextUserId, u);
      return u;
    },
    createSession: async () => ({ id: "s_signup", user_id: nextUserId - 1 }),
    getSessionById: async (id: string) => sessions.get(id) ?? null,
    getBetaInviteCodeByCode: async (code: string) => invites.get(code) ?? null,
    getRedeemedBetaInviteCount: async () => redeemedCount,
    getBetaInviteStats: async () => ({ cap: cohortCap(), redeemed: redeemedCount, issued: invites.size }),
    redeemBetaInviteCode: async (code: string, userId: number) => {
      if (forceRedeemRace) return { success: false, error: "cohort_full" };
      const inv = invites.get(code);
      if (!inv) return { success: false, error: "invalid" };
      if (inv.redeemed_at) return { success: false, error: "already_redeemed" };
      if (redeemedCount >= cohortCap()) return { success: false, error: "cohort_full" };
      inv.redeemed_at = "2026-08-11T17:00:00Z";
      inv.redeemed_by_user_id = userId;
      redeemedCount++;
      return { success: true };
    },
    issueBetaInviteCodes: async ({ codes, referrerUserId, issuedByUserId }: { codes: string[]; referrerUserId: number; issuedByUserId: number }) => {
      issuedCalls.push({ codes, referrerUserId, issuedByUserId });
      for (const code of codes) invites.set(code, { code, referrer_user_id: referrerUserId, redeemed_at: null, redeemed_by_user_id: null });
      return codes;
    },
    generateRandomCode: () => {
      mockCodeSeq++;
      return `BETA${String(mockCodeSeq).padStart(4, "0")}`;
    },
    applyReferralCode: async (code: string, newUserId: number) => {
      const inv = invites.get(code);
      if (!inv) return { success: false, error: "Invalid referral code" };
      if (inv.referrer_user_id === newUserId) return { success: false, error: "You cannot use your own referral code" };
      if (referralRewards.some((r) => r.referee_user_id === newUserId)) return { success: false, error: "You have already used a referral code" };
      referralRewards.push({ referrer_user_id: inv.referrer_user_id, referee_user_id: newUserId });
      return { success: true };
    },
    deleteUserAccount: async (userId: number) => { deletedUsers.push(userId); usersById.delete(userId); },
    joinWaitlist: async (email: string) => {
      if (failWaitlistJoin) throw new Error("waitlist insert failed: column zip_code does not exist");
      waitlistEnrollments.push(email);
      return null; // ON CONFLICT DO NOTHING duplicate → idempotent success
    },
    recordAdminAuditEvent: async (event: Record<string, unknown>) => { adminAudit.push(event); },
  };
}
mock.module("../src/db.ts", () => makeDbMock());
mock.module("../src/geo", () => ({
  getApproximateLocation: async () => mockGeo,
  getClientIp: () => "203.0.113.9",
}));
mock.module("stripe", () => ({
  default: class FakeStripe {
    constructor(key: string) {
      if (!key) throw new Error("FakeStripe requires a secret key");
    }
    identity = {
      verificationSessions: {
        retrieve: async () => null,
        create: async () => ({ id: "vs_new", client_secret: "secret_new" }),
      },
    };
    webhooks = { constructEvent: () => ({}) };
  },
}));

const ORIGINAL_BETA_REQUIRED = process.env.BETA_INVITE_REQUIRED;
const ORIGINAL_BETA_CAP = process.env.BETA_COHORT_CAP;
const ORIGINAL_STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
const ORIGINAL_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
let handleApiRoute: (req: Request) => Promise<Response | null>;

beforeAll(async () => {
  process.env.STRIPE_SECRET_KEY = "sk_test_mock";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_mock";
  ({ handleApiRoute } = await import("./api-handler"));
  resetState();
});
afterAll(() => {
  const restore = (name: string, original: string | undefined) => {
    if (original === undefined) delete process.env[name];
    else process.env[name] = original;
  };
  restore("BETA_INVITE_REQUIRED", ORIGINAL_BETA_REQUIRED);
  restore("BETA_COHORT_CAP", ORIGINAL_BETA_CAP);
  restore("STRIPE_SECRET_KEY", ORIGINAL_STRIPE_KEY);
  restore("STRIPE_WEBHOOK_SECRET", ORIGINAL_WEBHOOK_SECRET);
});

// ── Request helpers ───────────────────────────────────────────
let reqSeq = 0;
function freshIp(): string {
  reqSeq++;
  return `203.0.113.${(reqSeq % 200) + 10}`;
}
function signupRequest(body: Record<string, unknown>): Request {
  return new Request("https://gradedate.test/api/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": freshIp() },
    body: JSON.stringify({ email: `u${reqSeq}@gradedate.test`, password: "secret123", date_of_birth: "2000-01-01", ...body }),
  });
}
function adminIssueRequest(body: Record<string, unknown>): Request {
  return new Request("https://gradedate.test/api/admin/beta-invites", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: "csrf_token=a; session_id=s_admin", "X-CSRF-Token": "a" },
    body: JSON.stringify(body),
  });
}
function adminStatsRequest(): Request {
  return new Request("https://gradedate.test/api/admin/beta-invites", {
    method: "GET",
    headers: { cookie: "csrf_token=a; session_id=s_admin" },
  });
}
function waitlistRequest(body: Record<string, unknown>): Request {
  return new Request("https://gradedate.test/api/waitlist/join", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": freshIp() },
    body: JSON.stringify(body),
  });
}
function issueForTest(count: number, referrerUserId = INVITER_ID): string[] {
  const codes: string[] = [];
  for (let i = 1; i <= count; i++) {
    const code = `BETA${String(i).padStart(4, "0")}`;
    invites.set(code, { code, referrer_user_id: referrerUserId, redeemed_at: null, redeemed_by_user_id: null });
    codes.push(code);
  }
  return codes;
}

// ── Tests ─────────────────────────────────────────────────────
describe("beta mode OFF (default) — signup unchanged", () => {
  test("signup without any code still succeeds", async () => {
    resetState();
    delete process.env.BETA_INVITE_REQUIRED;
    const res = await handleApiRoute(signupRequest({}));
    expect(res!.status).toBe(201);
  });
});

describe("BETA_INVITE_REQUIRED=true — invite gate on signup", () => {
  beforeEach(() => {
    resetState();
    process.env.BETA_INVITE_REQUIRED = "true";
  });

  test("missing invite code is rejected with a waitlist-pointing message and no account is created", async () => {
    const res = await handleApiRoute(signupRequest({}));
    expect(res!.status).toBe(400);
    const body = (await res!.json()) as Record<string, unknown>;
    expect(body.code).toBe("BETA_INVITE_REQUIRED");
    expect(String(body.error)).toContain("waitlist");
    expect(usersById.size).toBe(2); // only the seeded owner + inviter
  });

  test("unknown code is rejected as invalid", async () => {
    const res = await handleApiRoute(signupRequest({ referral_code: "NOPE1234" }));
    expect(res!.status).toBe(403);
    const body = (await res!.json()) as Record<string, unknown>;
    expect(body.code).toBe("BETA_INVITE_INVALID");
    expect(usersById.size).toBe(2);
  });

  test("a normal (non-beta) referral code does NOT open the gate", async () => {
    const res = await handleApiRoute(signupRequest({ referral_code: "GRD8XK2P" }));
    expect(res!.status).toBe(403);
    expect(((await res!.json()) as Record<string, unknown>).code).toBe("BETA_INVITE_INVALID");
  });

  test("an already-redeemed code is rejected", async () => {
    issueForTest(1);
    invites.get("BETA0001")!.redeemed_at = "2026-08-11T10:00:00Z";
    invites.get("BETA0001")!.redeemed_by_user_id = 99;
    redeemedCount = 1;
    const res = await handleApiRoute(signupRequest({ referral_code: "BETA0001" }));
    expect(res!.status).toBe(409);
    expect(((await res!.json()) as Record<string, unknown>).code).toBe("BETA_INVITE_ALREADY_REDEEMED");
  });

  test("valid code + Austin location → signup succeeds, code redeemed, referral reward fires", async () => {
    issueForTest(1);
    const res = await handleApiRoute(signupRequest({ referral_code: "BETA0001" }));
    expect(res!.status).toBe(201);
    const inv = invites.get("BETA0001")!;
    expect(inv.redeemed_at).not.toBeNull();
    expect(inv.redeemed_by_user_id).toBe(100);
    expect(redeemedCount).toBe(1);
    // The inviter's referral reward fires through the existing machinery.
    expect(referralRewards).toHaveLength(1);
    expect(referralRewards[0]).toEqual({ referrer_user_id: INVITER_ID, referee_user_id: 100 });
    // The new account exists.
    expect(usersById.has(100)).toBe(true);
  });

  test("non-Austin location is rejected with Austin-beta-only and consumes nothing", async () => {
    issueForTest(1);
    mockGeo = { city: "Houston", region: "TX", isAustinMetro: false };
    const res = await handleApiRoute(signupRequest({ referral_code: "BETA0001" }));
    expect(res!.status).toBe(403);
    const body = (await res!.json()) as Record<string, unknown>;
    expect(body.code).toBe("BETA_AUSTIN_ONLY");
    expect(invites.get("BETA0001")!.redeemed_at).toBeNull();
    expect(redeemedCount).toBe(0);
    expect(usersById.size).toBe(2);
  });

  test("geo failure (provider down) fails closed: signup rejected", async () => {
    issueForTest(1);
    mockGeo = { city: null, region: null, isAustinMetro: false };
    const res = await handleApiRoute(signupRequest({ referral_code: "BETA0001" }));
    expect(res!.status).toBe(403);
    expect(((await res!.json()) as Record<string, unknown>).code).toBe("BETA_AUSTIN_ONLY");
  });
});

describe("cohort cap (50 redeemed signups)", () => {
  beforeEach(() => {
    resetState();
    process.env.BETA_INVITE_REQUIRED = "true";
    process.env.BETA_COHORT_CAP = "50";
  });

  test("the 50th redemption is accepted", async () => {
    issueForTest(50);
    for (let i = 1; i <= 49; i++) {
      const code = `BETA${String(i).padStart(4, "0")}`;
      invites.get(code)!.redeemed_at = "2026-08-11T10:00:00Z";
      invites.get(code)!.redeemed_by_user_id = 1000 + i;
    }
    redeemedCount = 49;
    const res = await handleApiRoute(signupRequest({ referral_code: "BETA0050" }));
    expect(res!.status).toBe(201);
    expect(redeemedCount).toBe(50);
  });

  test("the 51st redemption is rejected with cohort-full and handed to the waitlist", async () => {
    issueForTest(51);
    for (let i = 1; i <= 50; i++) {
      const code = `BETA${String(i).padStart(4, "0")}`;
      invites.get(code)!.redeemed_at = "2026-08-11T10:00:00Z";
      invites.get(code)!.redeemed_by_user_id = 1000 + i;
    }
    redeemedCount = 50;
    const res = await handleApiRoute(signupRequest({ email: "full@gradedate.test", referral_code: "BETA0051" }));
    expect(res!.status).toBe(409);
    const body = (await res!.json()) as Record<string, unknown>;
    expect(body.code).toBe("BETA_COHORT_FULL");
    expect(String(body.error)).toContain("waitlist");
    // The blocked signup is enrolled in the waitlist and no account was created.
    expect(waitlistEnrollments).toContain("full@gradedate.test");
    expect(usersById.size).toBe(2);
    expect(redeemedCount).toBe(50);
    expect(referralRewards).toHaveLength(0);
  });

  test("a concurrent cap race unwinds the just-created account (no orphan users)", async () => {
    issueForTest(1);
    forceRedeemRace = true; // atomic claim fails even though the pre-check passed
    const res = await handleApiRoute(signupRequest({ email: "race@gradedate.test", referral_code: "BETA0001" }));
    expect(res!.status).toBe(409);
    expect(((await res!.json()) as Record<string, unknown>).code).toBe("BETA_COHORT_FULL");
    expect(deletedUsers).toContain(100); // the created account was unwound
    expect(usersById.has(100)).toBe(false); // mock delete removes nothing, but we assert the call
    expect(waitlistEnrollments).toContain("race@gradedate.test");
    expect(referralRewards).toHaveLength(0);
    expect(redeemedCount).toBe(0);
  });
});

describe("admin issuance (owner/admin only)", () => {
  beforeEach(() => {
    resetState();
    process.env.BETA_INVITE_REQUIRED = "true";
  });

  test("unauthenticated issuance is blocked by the privileged-MFA gate", async () => {
    const req = new Request("https://gradedate.test/api/admin/beta-invites", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ count: 5 }),
    });
    const res = await handleApiRoute(req);
    expect(res!.status).toBe(403);
    expect(((await res!.json()) as Record<string, unknown>).code).toBe("PRIVILEGED_MFA_REQUIRED");
  });

  test("owner with an MFA-verified session can issue a batch of codes", async () => {
    const res = await handleApiRoute(adminIssueRequest({ count: 3 }));
    expect(res!.status).toBe(200);
    const body = (await res!.json()) as Record<string, unknown>;
    const codes = body.codes as string[];
    expect(codes).toHaveLength(3);
    for (const code of codes) expect(invites.has(code)).toBe(true);
    expect(issuedCalls).toHaveLength(1);
    expect(issuedCalls[0]).toMatchObject({ referrerUserId: ADMIN_ID, issuedByUserId: ADMIN_ID });
    expect(body.cohort).toEqual({ cap: 50, redeemed: 0, remaining: 50 });
    // Issuance is audit-logged (counts only — codes are never logged).
    const audit = adminAudit.find((e) => e.action === "beta_invites.issue");
    expect(audit).toBeDefined();
    expect(audit!.actorUserId).toBe(ADMIN_ID);
    expect(JSON.stringify(audit!.metadata)).not.toContain("BETA");
  });

  test("codes can be issued for a specific referrer so the reward goes to them", async () => {
    const res = await handleApiRoute(adminIssueRequest({ count: 2, referrer_email: "inviter@gradedate.test" }));
    expect(res!.status).toBe(200);
    expect(issuedCalls[0].referrerUserId).toBe(INVITER_ID);
  });

  test("moderator role is NOT allowed to issue codes", async () => {
    usersById.set(ADMIN_ID, { ...baseUser(ADMIN_ID, "owner@gradedate.app"), role: "moderator", verification_status: "verified" });
    const res = await handleApiRoute(adminIssueRequest({ count: 1 }));
    expect(res!.status).toBe(403);
    expect(((await res!.json()) as Record<string, unknown>).error).toBe("Forbidden");
    expect(issuedCalls).toHaveLength(0);
  });

  test("invalid counts are rejected", async () => {
    const res0 = await handleApiRoute(adminIssueRequest({ count: 0 }));
    expect(res0!.status).toBe(400);
    const res101 = await handleApiRoute(adminIssueRequest({ count: 101 }));
    expect(res101!.status).toBe(400);
    const resNaN = await handleApiRoute(adminIssueRequest({}));
    expect(resNaN!.status).toBe(400);
  });

  test("GET stats returns cohort state without exposing codes", async () => {
    issueForTest(2);
    invites.get("BETA0001")!.redeemed_at = "2026-08-11T10:00:00Z";
    redeemedCount = 1;
    const res = await handleApiRoute(adminStatsRequest());
    expect(res!.status).toBe(200);
    const body = (await res!.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ issued: 2, cohort: { cap: 50, redeemed: 1, remaining: 49 } });
    expect(JSON.stringify(body)).not.toContain("BETA000");
  });

  test("issued codes can be redeemed end-to-end (issue → signup → reward)", async () => {
    // Issue via the admin route, then redeem via signup.
    const issueRes = await handleApiRoute(adminIssueRequest({ count: 1 }));
    const issued = ((await issueRes!.json()) as { codes: string[] }).codes;
    expect(issued).toHaveLength(1);
    const res = await handleApiRoute(signupRequest({ referral_code: issued[0] }));
    expect(res!.status).toBe(201);
    expect(redeemedCount).toBe(1);
    expect(referralRewards).toHaveLength(1);
    expect(referralRewards[0].referrer_user_id).toBe(ADMIN_ID);
  });
});

describe("waitlist remains available for everyone", () => {
  test("existing /api/waitlist/join still works", async () => {
    resetState();
    delete process.env.BETA_INVITE_REQUIRED;
    const res = await handleApiRoute(waitlistRequest({ email: "wl@gradedate.test", zip_code: "78701" }));
    expect(res!.status).toBe(200);
    expect(waitlistEnrollments).toContain("wl@gradedate.test");
  });

  test("duplicate email is still a 200 (idempotent join, no error leaked)", async () => {
    resetState();
    delete process.env.BETA_INVITE_REQUIRED;
    // The mock returns null for a duplicate (ON CONFLICT DO NOTHING) — the
    // handler must treat that as success, not as a failure.
    const res = await handleApiRoute(waitlistRequest({ email: "dup@gradedate.test", zip_code: "78701" }));
    expect(res!.status).toBe(200);
    const body = await res!.json();
    expect(body.success).toBe(true);
    expect(waitlistEnrollments).toContain("dup@gradedate.test");
  });

  test("a real DB error returns 500 with a generic message (no internal detail leaked)", async () => {
    resetState();
    delete process.env.BETA_INVITE_REQUIRED;
    failWaitlistJoin = true;
    const res = await handleApiRoute(waitlistRequest({ email: "err@gradedate.test", zip_code: "78701" }));
    expect(res!.status).toBe(500);
    const body = await res!.json();
    expect(String(body.error)).toBe("Could not join the waitlist. Please try again.");
    expect(String(body.error)).not.toContain("zip_code");
    expect(waitlistEnrollments).not.toContain("err@gradedate.test");
    failWaitlistJoin = false;
  });
});
