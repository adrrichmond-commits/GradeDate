import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  BETA_TRIAL_DURATION_DAYS,
  hasPremiumEntitlement,
  isTrialActive,
  referralRewardExtensionBase,
} from "./canonical-entitlements";
/**
 * 14-day Premium trial for closed-beta users (owner decision 2026-08-11:
 * "give them a taste but drive sales").
 *
 * Design:
 * - `users.trial_ends_at` (NULL = never had a trial) is the single source of
 *   truth. The trial starts at signup: `redeemBetaInviteCode` (the beta
 *   cohort-membership write, only reachable when BETA_INVITE_REQUIRED=true)
 *   sets `trial_ends_at = COALESCE(trial_ends_at, NOW() + 14 days)` — one
 *   grant, idempotent, and non-beta signups never touch it.
 * - Entitlement derivation is canonical: `hasPremiumEntitlement(status,
 *   expires_at, trial_ends_at)` = active subscription OR active trial. Every
 *   server gate (likes, liked-me, re-grades, grading flow, daily-like
 *   queries) uses it, so the trial is enforced in the API, not just the UI.
 * - Precedence: subscription > referral > trial for expiry purposes, but all
 *   three OR together for "is premium". Referral rewards extend from
 *   GREATEST(current expiry, trial end, now) + 1 month, so a mid-trial user
 *   keeps the free month AFTER the trial. Subscribing during a trial never
 *   touches trial_ends_at (no double-grant, no free-forever).
 */
const apiSource = readFileSync(new URL("./api-handler.ts", import.meta.url), "utf8");
const dbSource = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const dbImportMatch = apiSource.match(/import \{([^}]*)\} from "\.\.\/src\/db\.ts"/);
if (!dbImportMatch) throw new Error("could not locate db import block in api-handler.ts");
const DB_IMPORT_NAMES = dbImportMatch[1]
  .split(",")
  .map((s) => s.trim().replace(/^type\s+/, ""))
  .filter(Boolean);

// ── Pure policy tests (no db, no api) ─────────────────────────
describe("canonical trial policy", () => {
  const now = new Date("2026-08-11T12:00:00Z");
  const future = new Date("2026-08-25T12:00:00Z").toISOString();
  const past = new Date("2026-08-01T12:00:00Z").toISOString();

  test("isTrialActive: null/undefined/past = inactive, future = active", () => {
    expect(isTrialActive(null, now)).toBe(false);
    expect(isTrialActive(undefined, now)).toBe(false);
    expect(isTrialActive(past, now)).toBe(false);
    expect(isTrialActive(future, now)).toBe(true);
  });

  test("trial duration constant is 14 days", () => {
    expect(BETA_TRIAL_DURATION_DAYS).toBe(14);
  });

  test("hasPremiumEntitlement: subscription wins, trial wins when active", () => {
    // Real Stripe sub: active, no expiry → premium
    expect(hasPremiumEntitlement("active", null, null, now)).toBe(true);
    // Referral reward: active but expired → not premium
    expect(hasPremiumEntitlement("active", past, null, now)).toBe(false);
    // Trial: inactive subscription + future trial end → premium
    expect(hasPremiumEntitlement("inactive", null, future, now)).toBe(true);
    // Trial expired → not premium (server-side revocation)
    expect(hasPremiumEntitlement("inactive", null, past, now)).toBe(false);
    // No subscription, no trial → free
    expect(hasPremiumEntitlement("none", null, null, now)).toBe(false);
    // Expired referral reward + still in trial → premium (OR semantics)
    expect(hasPremiumEntitlement("active", past, future, now)).toBe(true);
  });

  test("referralRewardExtensionBase: mid-trial referral extends AFTER the trial", () => {
    // Mid-trial: base = trial end (referral month starts after the trial)
    expect(referralRewardExtensionBase(null, future, now).toISOString()).toBe(future);
    // No trial: base = now
    expect(referralRewardExtensionBase(null, null, now).getTime()).toBe(now.getTime());
    // Existing later expiry wins (stacking preserved)
    const later = new Date("2026-09-01T12:00:00Z").toISOString();
    expect(referralRewardExtensionBase(later, future, now).toISOString()).toBe(later);
    // Expired trial + existing expiry: expiry wins, not the past trial end
    expect(referralRewardExtensionBase(later, past, now).toISOString()).toBe(later);
  });
});

// ── DB contract tests (source-level: SQL that must ship) ───────
describe("db contract for the beta trial", () => {
  test("users table carries trial_ends_at with a migration for existing dbs", () => {
    expect(dbSource).toContain("trial_ends_at TIMESTAMPTZ");
    expect(dbSource).toContain("ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ");
  });

  test("redeemBetaInviteCode grants the trial once (idempotent COALESCE)", () => {
    expect(dbSource).toContain("UPDATE users SET trial_ends_at = COALESCE(trial_ends_at, NOW() + INTERVAL '14 days')");
  });

  test("referral reward extends from the later of expiry/now and the trial end", () => {
    expect(dbSource).toContain("GREATEST(COALESCE(subscription_expires_at, NOW()), COALESCE(trial_ends_at, NOW())) + INTERVAL '1 month'");
  });

  test("daily-like queries treat an active trial as premium server-side", () => {
    expect(dbSource).toContain("subscription_expires_at, trial_ends_at, like_packs");
    expect(dbSource).toContain("hasPremiumEntitlement(row.subscription_status, row.subscription_expires_at, row.trial_ends_at)");
  });

  test("stripe activation never touches the trial (no double-grant)", () => {
    // updateUserStripeInfo must not clear/extend trial_ends_at
    const fn = dbSource.slice(dbSource.indexOf("export async function updateUserStripeInfo"), dbSource.indexOf("export async function getUserByStripeCustomerId"));
    expect(fn).toContain("subscription_status = 'active'");
    expect(fn).not.toContain("trial_ends_at");
  });
});

// ── Behavioral tests through the real handleApiRoute ───────────
const ADMIN_ID = 7;
const INVITER_ID = 8;
let nextUserId = 100;
const usersById = new Map<number, Record<string, unknown>>();
const sessions = new Map<string, { id: string; user_id: number }>();
const invites = new Map<string, { code: string; referrer_user_id: number; redeemed_at: string | null; redeemed_by_user_id: number | null }>();
let redeemedCount = 0;
const referralRewards: Array<{ referrer_user_id: number; referee_user_id: number }> = [];
const appliedRewards: Array<number> = [];
let mockGeo = { city: "Austin", region: "TX", isAustinMetro: true };
let freeLikeReturns = 0; // what useDailyLike returns for non-premium users
let forceRedeemRace = false;

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
    trial_ends_at: null,
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
function resetState(): void {
  nextUserId = 100;
  usersById.clear();
  sessions.clear();
  invites.clear();
  redeemedCount = 0;
  referralRewards.length = 0;
  appliedRewards.length = 0;
  mockGeo = { city: "Austin", region: "TX", isAustinMetro: true };
  freeLikeReturns = 0;
  forceRedeemRace = false;
  usersById.set(ADMIN_ID, { ...baseUser(ADMIN_ID, "owner@gradedate.app"), role: "owner" });
  usersById.set(INVITER_ID, { ...baseUser(INVITER_ID, "inviter@gradedate.test") });
  sessions.set("s_admin", { id: "s_admin", user_id: ADMIN_ID });
}
function makeDbMock(): Record<string, unknown> {
  const mock: Record<string, unknown> = {};
  for (const name of DB_IMPORT_NAMES) mock[name] = async () => undefined;
  return {
    ...mock,
    betaCohortCap: async () => 50,
    getUserByEmail: async (email: string) => {
      for (const u of usersById.values()) if (u.email === email) return u;
      return null;
    },
    getUserById: async (id: number) => usersById.get(id) ?? null,
    getUserByStripeCustomerId: async (customerId: string) => {
      for (const u of usersById.values()) if (u.stripe_customer_id === customerId) return u;
      return null;
    },
    createUser: async (email: string, _hash: string, dob?: string) => {
      const u = baseUser(nextUserId, email);
      u.date_of_birth = dob ?? null;
      usersById.set(nextUserId, u);
      const id = nextUserId;
      nextUserId++;
      return usersById.get(id);
    },
    createSession: async (userId: number) => {
      const s = { id: `s_${userId}`, user_id: userId };
      sessions.set(s.id, s);
      return s;
    },
    getSessionById: async (id: string) => sessions.get(id) ?? null,
    getBetaInviteCodeByCode: async (code: string) => invites.get(code) ?? null,
    getRedeemedBetaInviteCount: async () => redeemedCount,
    redeemBetaInviteCode: async (code: string, userId: number) => {
      if (forceRedeemRace) return { success: false, error: "cohort_full" };
      const inv = invites.get(code);
      if (!inv) return { success: false, error: "invalid" };
      if (inv.redeemed_at) return { success: false, error: "already_redeemed" };
      if (redeemedCount >= 50) return { success: false, error: "cohort_full" };
      inv.redeemed_at = new Date().toISOString();
      inv.redeemed_by_user_id = userId;
      redeemedCount++;
      // Mirror the real db: beta membership grants the one-time 14-day trial.
      const u = usersById.get(userId);
      if (u) {
        u.trial_ends_at = new Date(Date.now() + BETA_TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000).toISOString();
      }
      return { success: true };
    },
    applyReferralCode: async (code: string, newUserId: number) => {
      const inv = invites.get(code);
      if (!inv) return { success: false, error: "Invalid referral code" };
      if (inv.referrer_user_id === newUserId) return { success: false, error: "You cannot use your own referral code" };
      if (referralRewards.some((r) => r.referee_user_id === newUserId)) return { success: false, error: "You have already used a referral code" };
      referralRewards.push({ referrer_user_id: inv.referrer_user_id, referee_user_id: newUserId });
      return { success: true };
    },
    enrollInWaitlistOnFull: async () => null,
    useDailyLike: async (userId: number) => {
      const u = usersById.get(userId);
      if (!u) return 0;
      const premium = hasPremiumEntitlement(String(u.subscription_status), (u.subscription_expires_at as string) ?? null, (u.trial_ends_at as string) ?? null);
      return premium ? -1 : freeLikeReturns;
    },
    getDailyLikesRemaining: async (userId: number) => {
      const u = usersById.get(userId);
      if (!u) return 0;
      const premium = hasPremiumEntitlement(String(u.subscription_status), (u.subscription_expires_at as string) ?? null, (u.trial_ends_at as string) ?? null);
      return premium ? -1 : 3;
    },
    getLike: async () => false,
    recordLike: async () => true,
    updateUserStripeInfo: async (userId: number, customerId: string, subscriptionId: string) => {
      const u = usersById.get(userId);
      if (!u) return;
      u.subscription_status = "active";
      u.subscription_updated_at = new Date().toISOString();
      u.stripe_customer_id = customerId;
      u.stripe_subscription_id = subscriptionId;
      // trial_ends_at deliberately untouched — subscription does not extend/renew the trial
    },
    updateSubscriptionStatus: async (userId: number, status: string) => {
      const u = usersById.get(userId);
      if (!u) return;
      u.subscription_status = status;
      u.subscription_updated_at = new Date().toISOString();
    },
    getFounderSpotsRemaining: async () => ({ remaining: 999, total: 1000 }),
    assignFounderNumber: async () => null,
    getReferralRewardForReferee: async (refereeUserId: number) => {
      const r = referralRewards.find((x) => x.referee_user_id === refereeUserId);
      return r ? { id: 1, referrer_user_id: r.referrer_user_id, referee_user_id: r.referee_user_id, applied: false, expires_at: null } : null;
    },
    applyReferralReward: async (rewardId: number) => { appliedRewards.push(rewardId); },
    deleteUserAccount: async (userId: number) => { usersById.delete(userId); },
    joinWaitlist: async () => null,
  };
}
mock.module("../src/db.ts", () => makeDbMock());
mock.module("../src/geo", () => ({
  getApproximateLocation: async () => mockGeo,
  getClientIp: () => "203.0.113.9",
}));
let constructEventResult: Record<string, unknown> | null = null;
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
    webhooks = { constructEvent: () => constructEventResult ?? {} };
  },
}));

const ORIGINAL_BETA_REQUIRED = process.env.BETA_INVITE_REQUIRED;
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
  restore("STRIPE_SECRET_KEY", ORIGINAL_STRIPE_KEY);
  restore("STRIPE_WEBHOOK_SECRET", ORIGINAL_WEBHOOK_SECRET);
});
beforeEach(() => resetState());

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
function issueForTest(code: string, referrerUserId = INVITER_ID): void {
  invites.set(code, { code, referrer_user_id: referrerUserId, redeemed_at: null, redeemed_by_user_id: null });
}
function likeRequest(sessionId: string, likedId: number): Request {
  return new Request("https://gradedate.test/api/matches/like", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: `csrf_token=a; session_id=${sessionId}`, "X-CSRF-Token": "a" },
    body: JSON.stringify({ liked_id: likedId }),
  });
}
function webhookRequest(): Request {
  return new Request("https://gradedate.test/api/webhooks/stripe", {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": "sig" },
    body: JSON.stringify({}),
  });
}
const DAY_MS = 24 * 60 * 60 * 1000;

// ── Behavioral tests ───────────────────────────────────────────
describe("beta signup grants the one-time trial", () => {
  test("beta-mode signup with a redeemed invite gets trial_ends_at ~14 days out", async () => {
    process.env.BETA_INVITE_REQUIRED = "true";
    issueForTest("BETA0001");
    const res = await handleApiRoute(signupRequest({ referral_code: "BETA0001" }));
    expect(res?.status).toBe(201);
    const body = await res!.json();
    expect(body.user.trial_ends_at).toBeTruthy();
    const end = new Date(body.user.trial_ends_at).getTime();
    const now = Date.now();
    expect(end - now).toBeGreaterThan(13 * DAY_MS);
    expect(end - now).toBeLessThanOrEqual(14 * DAY_MS + 60_000);
  });

  test("non-beta signup (beta mode OFF) never gets a trial", async () => {
    delete process.env.BETA_INVITE_REQUIRED;
    const res = await handleApiRoute(signupRequest({}));
    expect(res?.status).toBe(201);
    const body = await res!.json();
    expect(body.user.trial_ends_at ?? null).toBeNull();
  });

  test("non-beta signup with a plain referral code gets no trial (referral is not a trial)", async () => {
    delete process.env.BETA_INVITE_REQUIRED;
    issueForTest("REFER01");
    const res = await handleApiRoute(signupRequest({ referral_code: "REFER01" }));
    expect(res?.status).toBe(201);
    const body = await res!.json();
    expect(body.user.trial_ends_at ?? null).toBeNull();
    expect(referralRewards.length).toBe(1); // referral reward still created
  });

  test("failed beta redemption (cohort full) creates no user and no trial", async () => {
    process.env.BETA_INVITE_REQUIRED = "true";
    issueForTest("BETA0002");
    forceRedeemRace = true;
    const res = await handleApiRoute(signupRequest({ referral_code: "BETA0002" }));
    expect(res?.status).toBe(409);
    expect([...usersById.values()].every((u) => u.trial_ends_at == null)).toBe(true);
  });
});

describe("trial is server-enforced premium", () => {
  test("trial user can like without hitting the free daily cap", async () => {
    process.env.BETA_INVITE_REQUIRED = "true";
    issueForTest("BETA0003");
    const signup = await handleApiRoute(signupRequest({ referral_code: "BETA0003" }));
    const body = await signup!.json();
    const userId = body.user.id;
    freeLikeReturns = 0; // free users would be blocked
    const res = await handleApiRoute(likeRequest(`s_${userId}`, 999));
    expect(res?.status).not.toBe(402);
  });

  test("free user (no trial, no subscription) is still capped", async () => {
    delete process.env.BETA_INVITE_REQUIRED;
    const signup = await handleApiRoute(signupRequest({}));
    const body = await signup!.json();
    const userId = body.user.id;
    freeLikeReturns = 0;
    const res = await handleApiRoute(likeRequest(`s_${userId}`, 999));
    expect(res?.status).toBe(402);
    expect((await res!.json()).code).toBe("DAILY_LIMIT");
  });

  test("an expired trial no longer grants premium (revocation)", () => {
    const now = new Date("2026-08-11T12:00:00Z");
    expect(hasPremiumEntitlement("inactive", null, new Date("2026-08-01T12:00:00Z").toISOString(), now)).toBe(false);
  });
});

describe("subscription and referral coexistence", () => {
  test("subscribing during a trial activates the subscription without touching the trial (no double-grant)", async () => {
    process.env.BETA_INVITE_REQUIRED = "true";
    issueForTest("BETA0004");
    const signup = await handleApiRoute(signupRequest({ referral_code: "BETA0004" }));
    const body = await signup!.json();
    const userId = body.user.id;
    const trialBefore = usersById.get(userId)!.trial_ends_at as string;
    expect(trialBefore).toBeTruthy();

    // Stripe checkout completes for this user mid-trial
    constructEventResult = {
      type: "checkout.session.completed",
      data: { object: { id: "cs_trial1", mode: "subscription", payment_status: "paid", customer: "cus_1", subscription: "sub_1", metadata: { user_id: String(userId) } } },
    };
    const res = await handleApiRoute(webhookRequest());
    expect(res?.status).toBe(200);
    const u = usersById.get(userId)!;
    expect(u.subscription_status).toBe("active");
    expect(u.stripe_subscription_id).toBe("sub_1");
    // Trial untouched: still exactly the original end date — not extended, not cleared
    expect(u.trial_ends_at).toBe(trialBefore);
  });

  test("premium persists while the trial is active even after a subscription ends (bounded by trial end)", () => {
    const now = new Date("2026-08-11T12:00:00Z");
    const trialEnd = new Date("2026-08-25T12:00:00Z").toISOString();
    // cancelled subscription + still in trial → premium (trial remainder)
    expect(hasPremiumEntitlement("inactive", null, trialEnd, now)).toBe(true);
    // cancelled + trial over → free (no free-forever)
    expect(hasPremiumEntitlement("inactive", null, new Date("2026-08-01T12:00:00Z").toISOString(), now)).toBe(false);
  });

  test("referral reward fires normally during a trial and extends after it", async () => {
    process.env.BETA_INVITE_REQUIRED = "true";
    issueForTest("BETA0005");
    await handleApiRoute(signupRequest({ referral_code: "BETA0005" }));
    // Referee subscribes mid-trial → referral reward applies (mock records it)
    const refereeId = nextUserId - 1;
    constructEventResult = {
      type: "checkout.session.completed",
      data: { object: { id: "cs_trial2", mode: "subscription", payment_status: "paid", customer: "cus_2", subscription: "sub_2", metadata: { user_id: String(refereeId) } } },
    };
    await handleApiRoute(webhookRequest());
    expect(appliedRewards.length).toBe(1);
  });
});
