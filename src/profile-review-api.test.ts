import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { hasPremiumEntitlement } from "./canonical-entitlements";
import {
  FALLBACK_OVERALL,
  LOCKED_SECTION_COPY,
  PROFILE_REVIEW_SECTIONS,
  type ProfileReviewResult,
  type ProfileSnapshot,
} from "./profile-review";
/**
 * Route-level tests for POST /api/profile-review (Premium Full-Profile Review).
 *
 * Product contract (owner-locked):
 *  - FREE users get ONE one-time bio review ("a taste"): 200 with the bio
 *    section real and every other section locked with honest upsell copy;
 *    a second attempt is 402 FREE_REVIEW_USED with premiumRequired:true so the
 *    UI can render the Premium upsell.
 *  - PREMIUM users (hasPremiumEntitlement) get the FULL review — all nine
 *    sections — capped at one per 30 days (402 REVIEW_WINDOW_ACTIVE).
 *  - method is "ai" | "mock" and the fallback carries the honest "AI review
 *    was unavailable" copy.
 *  - 401 unauthenticated, 403 without CSRF, 429 past the abuse brake.
 *
 * db.ts is mocked via the accepted mock.module pattern (same as
 * beta-trial.test.ts). The review provider is stubbed through the injectable
 * seam setProfileReviewFnForTesting — no module mocking of profile-review.ts.
 */
const apiSource = readFileSync(new URL("./api-handler.ts", import.meta.url), "utf8");
const dbSource = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const dbImportMatch = apiSource.match(/import \{([^}]*)\} from "\.\.\/src\/db\.ts"/);
if (!dbImportMatch) throw new Error("could not locate db import block in api-handler.ts");
const DB_IMPORT_NAMES = dbImportMatch[1]
  .split(",")
  .map((s) => s.trim().replace(/^type\s+/, ""))
  .filter(Boolean);

// ── DB contract tests (source-level: SQL that must ship) ───────
describe("db contract for profile reviews", () => {
  test("profile_reviews table ships with tier CHECK and JSONB columns", () => {
    expect(dbSource).toContain("CREATE TABLE IF NOT EXISTS profile_reviews");
    expect(dbSource).toContain("tier TEXT NOT NULL CHECK (tier IN ('free','premium'))");
    expect(dbSource).toContain("profile_snapshot JSONB NOT NULL");
    expect(dbSource).toContain("review JSONB NOT NULL");
    expect(dbSource).toContain("method TEXT NOT NULL");
    expect(dbSource).toContain("user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE");
  });
  test("db functions exist for record/check window", () => {
    expect(dbSource).toContain("export async function recordProfileReview");
    expect(dbSource).toContain("export async function hasUsedFreeReview");
    expect(dbSource).toContain("export async function premiumReviewsInWindow");
    expect(dbSource).toContain("export async function lastPremiumReviewAt");
  });
});

// ── Behavioral tests through the real handleApiRoute ───────────
let nextUserId = 100;
const usersById = new Map<number, Record<string, unknown>>();
const sessions = new Map<string, { id: string; user_id: number }>();
const profileReviews: Array<{
  id: number;
  user_id: number;
  tier: "free" | "premium";
  profile_snapshot: unknown;
  review: unknown;
  method: string;
  created_at: string;
}> = [];
let reviewMethod: "ai" | "mock" = "ai";
let nextReviewId = 1;

function baseUser(id: number, email: string): Record<string, unknown> {
  return {
    id,
    email,
    password_hash: "hash",
    display_name: "Test",
    age: 28,
    gender: "woman",
    looking_for: "everyone",
    bio: "Coffee brewer, trail runner, weekend painter.",
    photo_path: null,
    grade: 7,
    subscription_status: "inactive",
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
    date_of_birth: "1998-01-01",
    latitude: null,
    longitude: null,
    max_distance: 50,
    location_city: "Austin",
    location_state: "TX",
    daily_likes_remaining: 3,
    daily_likes_reset_at: null,
    last_free_regrade_at: null,
    percentile: null,
    percentile_city: null,
    like_packs: 0,
    communication_style: "Direct and warm",
    lifestyle: "Active, early riser",
    dating_goals: "Something real",
    college: null,
    occupation: null,
    hobbies: "Trail running, watercolor",
    height: null,
    pronouns: null,
    ideal_first_date: "Morning coffee and a walk",
    green_flags: "Curious, kind",
    red_flags: "Vague plans",
    obsessions: "Film cameras",
    is_founder: false,
    founder_number: null,
    founder_price_lock_price_id: null,
    role: "user",
    suspended_until: null,
    suspension_reason: null,
    created_at: new Date().toISOString(),
  };
}

function makePremium(u: Record<string, unknown>): void {
  u.subscription_status = "active";
  u.subscription_updated_at = new Date().toISOString();
}

function resetState(): void {
  nextUserId = 100;
  usersById.clear();
  sessions.clear();
  profileReviews.length = 0;
  nextReviewId = 1;
  reviewMethod = "ai";
  const freeUser = baseUser(nextUserId, "free@gradedate.test");
  usersById.set(nextUserId, freeUser);
  sessions.set("s_free", { id: "s_free", user_id: nextUserId });
  nextUserId++;
  const free2User = baseUser(nextUserId, "free2@gradedate.test");
  usersById.set(nextUserId, free2User);
  sessions.set("s_free2", { id: "s_free2", user_id: nextUserId });
  nextUserId++;
  const free3User = baseUser(nextUserId, "free3@gradedate.test");
  usersById.set(nextUserId, free3User);
  sessions.set("s_free3", { id: "s_free3", user_id: nextUserId });
  nextUserId++;
  const premiumUser = baseUser(nextUserId, "premium@gradedate.test");
  makePremium(premiumUser);
  usersById.set(nextUserId, premiumUser);
  sessions.set("s_premium", { id: "s_premium", user_id: nextUserId });
  nextUserId++;
  // Re-register the default deterministic provider fake so a test that swaps
  // the seam (e.g. the snapshot-capture test) can never leak into the next one.
  setProfileReviewFnForTesting(defaultReviewFn);
}

function makeDbMock(): Record<string, unknown> {
  const mock: Record<string, unknown> = {};
  for (const name of DB_IMPORT_NAMES) mock[name] = async () => undefined;
  return {
    ...mock,
    getUserById: async (id: number) => usersById.get(id) ?? null,
    getSessionById: async (id: string) => sessions.get(id) ?? null,
    recordProfileReview: async (input: {
      userId: number;
      tier: "free" | "premium";
      profileSnapshot: unknown;
      review: unknown;
      method: string;
    }) => {
      const row = {
        id: nextReviewId++,
        user_id: input.userId,
        tier: input.tier,
        profile_snapshot: input.profileSnapshot,
        review: input.review,
        method: input.method,
        created_at: new Date().toISOString(),
      };
      profileReviews.push(row);
      return row;
    },
    hasUsedFreeReview: async (userId: number) =>
      profileReviews.some((r) => r.user_id === userId && r.tier === "free"),
    premiumReviewsInWindow: async (userId: number, days = 30) => {
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      return profileReviews.filter(
        (r) => r.user_id === userId && r.tier === "premium" && new Date(r.created_at).getTime() >= cutoff,
      ).length;
    },
    lastPremiumReviewAt: async (userId: number) => {
      const rows = profileReviews
        .filter((r) => r.user_id === userId && r.tier === "premium")
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return rows.length > 0 ? rows[0].created_at : null;
    },
  };
}
mock.module("../src/db.ts", () => makeDbMock());
mock.module("../src/geo", () => ({
  getApproximateLocation: async () => ({ city: "Austin", region: "TX", isAustinMetro: true }),
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

const ORIGINAL_STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
const ORIGINAL_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
let handleApiRoute: (req: Request) => Promise<Response | null>;
let setProfileReviewFnForTesting: (fn: unknown) => void;

/**
 * Deterministic fake provider: reports method from the reviewMethod switch,
 * and derives feedback from the snapshot it was given (so tests can assert
 * that the free taste only ever sends the bio field).
 */
async function defaultReviewFn(snapshot: ProfileSnapshot): Promise<{ review: ProfileReviewResult; method: "ai" | "mock" }> {
  if (reviewMethod === "mock") {
    // Mirror the real deterministic fallback so the route-level honest-copy
    // assertions match what the production module would produce.
    const sections = PROFILE_REVIEW_SECTIONS.map(([key, label]) => ({ key, label, feedback: FALLBACK_OVERALL }));
    return { review: { overall: FALLBACK_OVERALL, sections, tips: [] }, method: "mock" };
  }
  const sections = PROFILE_REVIEW_SECTIONS.map(([key, label]) => ({
    key,
    label,
    feedback: `${label} feedback for: ${(snapshot[key as keyof ProfileSnapshot] ?? "EMPTY") as string}`,
  }));
  return {
    review: { overall: "Overall summary", sections, tips: [{ id: "t1", text: "Tip one", source: "rule" }] },
    method: "ai",
  };
}

beforeAll(async () => {
  process.env.STRIPE_SECRET_KEY = "sk_test_mock";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_mock";
  const api = await import("./api-handler");
  handleApiRoute = api.handleApiRoute;
  setProfileReviewFnForTesting = api.setProfileReviewFnForTesting;
  resetState();
});
afterAll(() => {
  const restore = (name: string, original: string | undefined) => {
    if (original === undefined) delete process.env[name];
    else process.env[name] = original;
  };
  restore("STRIPE_SECRET_KEY", ORIGINAL_STRIPE_KEY);
  restore("STRIPE_WEBHOOK_SECRET", ORIGINAL_WEBHOOK_SECRET);
});
beforeEach(() => resetState());

let reqSeq = 0;
function freshIp(): string {
  reqSeq++;
  return `203.0.113.${(reqSeq % 200) + 10}`;
}
function reviewRequest(sessionId: string | null, { csrf = true, ip }: { csrf?: boolean; ip?: string } = {}): Request {
  const cookie = sessionId ? `csrf_token=a; session_id=${sessionId}` : "csrf_token=a";
  const headers: Record<string, string> = { "content-type": "application/json", "x-forwarded-for": ip ?? freshIp() };
  if (csrf) {
    headers.cookie = cookie;
    headers["X-CSRF-Token"] = "a";
  }
  return new Request("https://gradedate.test/api/profile-review", {
    method: "POST",
    headers,
    body: JSON.stringify({}),
  });
}

describe("POST /api/profile-review — auth, CSRF, rate limit", () => {
  test("unauthenticated request is 401", async () => {
    const res = await handleApiRoute(reviewRequest(null));
    expect(res?.status).toBe(401);
  });
  test("missing CSRF token is 403", async () => {
    const res = await handleApiRoute(reviewRequest("s_free", { csrf: false }));
    expect(res?.status).toBe(403);
  });
  test("rate-limit bucket 429s beyond 3 requests in 15 minutes", async () => {
    const ip = "198.51.100.77";
    // Four DIFFERENT users on one shared IP: the first three succeed (free
    // taste / premium review / free taste), the fourth is blocked by the
    // abuse brake before any review work happens.
    const sessionsForRate = ["s_free", "s_premium", "s_free2", "s_free3"];
    const statuses: Array<number | undefined> = [];
    for (const session of sessionsForRate) {
      const res = await handleApiRoute(reviewRequest(session, { ip }));
      statuses.push(res?.status);
    }
    expect(statuses.slice(0, 3)).toEqual([200, 200, 200]);
    expect(statuses[3]).toBe(429);
  });
});

describe("POST /api/profile-review — free one-time taste", () => {
  test("first free use returns 200: bio section real, other sections locked, method ai", async () => {
    const res = await handleApiRoute(reviewRequest("s_free"));
    expect(res?.status).toBe(200);
    const body = await res!.json();
    expect(body.method).toBe("ai");
    expect(body.premiumRequired).toBe(false);
    const sections = body.review.sections as Array<{ key: string; feedback: string; locked?: boolean }>;
    expect(sections).toHaveLength(9);
    const bio = sections.find((s) => s.key === "bio")!;
    expect(bio.feedback).toContain("Bio feedback for: Coffee brewer");
    expect(bio.locked).toBeUndefined();
    for (const section of sections.filter((s) => s.key !== "bio")) {
      expect(section.locked).toBe(true);
      expect(section.feedback).toBe(LOCKED_SECTION_COPY);
    }
    expect(body.review.overall).toBe(bio.feedback);
    expect(body.review.tips[0].source).toBe("rule");
  });

  test("free taste sends ONLY the bio field to the provider (no full-review leak)", async () => {
    let captured: ProfileSnapshot | null = null;
    setProfileReviewFnForTesting(async (snapshot: ProfileSnapshot) => {
      captured = snapshot;
      return { review: { overall: "o", sections: [], tips: [] }, method: "ai" };
    });
    await handleApiRoute(reviewRequest("s_free"));
    expect(captured).not.toBeNull();
    expect(captured!.bio).toBe("Coffee brewer, trail runner, weekend painter.");
    for (const key of ["hobbies", "ideal_first_date", "green_flags", "red_flags", "obsessions", "communication_style", "lifestyle", "dating_goals"]) {
      expect(captured![key as keyof ProfileSnapshot]).toBeNull();
    }
  });

  test("second free use is 402 FREE_REVIEW_USED with premiumRequired true (upsell shape)", async () => {
    await handleApiRoute(reviewRequest("s_free"));
    const res = await handleApiRoute(reviewRequest("s_free"));
    expect(res?.status).toBe(402);
    const body = await res!.json();
    expect(body.code).toBe("FREE_REVIEW_USED");
    expect(body.premiumRequired).toBe(true);
    expect(body.error).toContain("Premium");
  });

  test("free taste with provider fallback reports method mock and honest copy", async () => {
    reviewMethod = "mock";
    const res = await handleApiRoute(reviewRequest("s_free"));
    expect(res?.status).toBe(200);
    const body = await res!.json();
    expect(body.method).toBe("mock");
    expect(body.review.overall).toBe(FALLBACK_OVERALL);
  });
});

describe("POST /api/profile-review — premium full review", () => {
  test("premium user gets the full review: all sections unlocked", async () => {
    const res = await handleApiRoute(reviewRequest("s_premium"));
    expect(res?.status).toBe(200);
    const body = await res!.json();
    expect(body.method).toBe("ai");
    expect(body.premiumRequired).toBe(false);
    const sections = body.review.sections as Array<{ key: string; feedback: string; locked?: boolean }>;
    expect(sections).toHaveLength(9);
    for (const section of sections) {
      expect(section.locked).toBeUndefined();
      expect(section.feedback.length).toBeGreaterThan(0);
    }
    // The premium snapshot carries every field.
    expect(body.review.sections.find((s: { key: string }) => s.key === "hobbies")!.feedback).toContain("Trail running, watercolor");
    expect(body.review.sections.find((s: { key: string }) => s.key === "dating_goals")!.feedback).toContain("Something real");
  });

  test("premium review is recorded with tier premium", async () => {
    await handleApiRoute(reviewRequest("s_premium"));
    const user = [...usersById.values()].find((u) => u.email === "premium@gradedate.test")!;
    const rows = profileReviews.filter((r) => r.user_id === (user.id as number));
    expect(rows).toHaveLength(1);
    expect(rows[0].tier).toBe("premium");
    expect(rows[0].method).toBe("ai");
    expect((rows[0].profile_snapshot as ProfileSnapshot).hobbies).toBe("Trail running, watercolor");
  });

  test("premium 30-day cap: second review in the window is 402 REVIEW_WINDOW_ACTIVE", async () => {
    await handleApiRoute(reviewRequest("s_premium"));
    const res = await handleApiRoute(reviewRequest("s_premium"));
    expect(res?.status).toBe(402);
    const body = await res!.json();
    expect(body.code).toBe("REVIEW_WINDOW_ACTIVE");
    expect(body.premiumRequired).toBe(false);
    expect(body.days_remaining).toBeGreaterThanOrEqual(1);
    expect(body.days_remaining).toBeLessThanOrEqual(30);
  });

  test("premium review with provider fallback reports method mock", async () => {
    reviewMethod = "mock";
    const res = await handleApiRoute(reviewRequest("s_premium"));
    expect(res?.status).toBe(200);
    const body = await res!.json();
    expect(body.method).toBe("mock");
    expect(body.review.overall).toBe(FALLBACK_OVERALL);
  });

  test("a free taste does not count toward the premium window", async () => {
    // Free user uses their taste, then upgrades: full review must be allowed.
    await handleApiRoute(reviewRequest("s_free"));
    const user = [...usersById.values()].find((u) => u.email === "free@gradedate.test")!;
    makePremium(user);
    const res = await handleApiRoute(reviewRequest("s_free"));
    expect(res?.status).toBe(200);
    const body = await res!.json();
    expect(body.review.sections.every((s: { locked?: boolean }) => !s.locked)).toBe(true);
    // And now the premium window is active: another one is capped.
    const res2 = await handleApiRoute(reviewRequest("s_free"));
    expect(res2?.status).toBe(402);
    expect((await res2!.json()).code).toBe("REVIEW_WINDOW_ACTIVE");
  });
});
