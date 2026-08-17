/**
 * Behavioral tests for the waitlist → invite launch-ops flow (Austin beta):
 *   GET  /api/admin/waitlist            — owner/admin waitlist listing (+audit)
 *   POST /api/admin/beta-invites        — issue codes; notify:true also emails
 *                                         waitlist recipients their personal link
 *   GET  /api/admin/beta-invites        — cohort progress incl. waitlist total
 *
 * Same harness as beta-invite.test.ts: real handleApiRoute, mock.module for db,
 * geo, stripe, and email. The db mock is generated from api-handler's import
 * list so every import is satisfied; waitlist functions are implemented here.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";

const apiSource = readFileSync(new URL("./api-handler.ts", import.meta.url), "utf8");
const dbImportMatch = apiSource.match(/import \{([^}]*)\} from "\.\.\/src\/db\.ts"/);
if (!dbImportMatch) throw new Error("could not locate db import block in api-handler.ts");
const DB_IMPORT_NAMES = dbImportMatch[1]
  .split(",")
  .map((s) => s.trim().replace(/^type\s+/, ""))
  .filter(Boolean);

// ── Shared mutable state the mocks read/write ──────────────────
const ADMIN_ID = 7;
const MODERATOR_ID = 9;
let nextUserId = 100;
const usersById = new Map<number, Record<string, unknown>>();
const sessions = new Map<string, { id: string; user_id: number; mfa_verified_at?: string | null }>();
const invites = new Map<string, { code: string; referrer_user_id: number | null; redeemed_at: string | null; redeemed_by_user_id: number | null }>();
let redeemedCount = 0;
const adminAudit: Array<Record<string, unknown>> = [];
const issuedCalls: Array<{ codes: string[]; referrerUserId: number | null; issuedByUserId: number }> = [];
const sentEmails: Array<{ to: string; inviteUrl: string }> = [];
/** Oldest-first waitlist rows (id, email, zip_code, created_at). */
let waitlistRows: Array<{ id: number; email: string; zip_code: string | null; created_at: string }> = [];
let mockCodeSeq = 0;
let emailFailure: "ok" | "fail" = "ok";

function baseUser(id: number, email: string): Record<string, unknown> {
  return {
    id, email, password_hash: "hash", display_name: null, age: 25, gender: null,
    looking_for: "", bio: null, photo_path: null, grade: null, subscription_status: "none",
    subscription_updated_at: null, subscription_expires_at: null, stripe_customer_id: null,
    stripe_subscription_id: null, verification_status: "unverified", verification_session_id: null,
    verification_verified_at: null, verification_session_created_at: null, regrades_available: 0,
    boost_until: null, date_of_birth: "2000-01-01", latitude: null, longitude: null, max_distance: 50,
    location_city: null, location_state: null, daily_likes_remaining: 3, daily_likes_reset_at: null,
    last_free_regrade_at: null, percentile: null, percentile_city: null, like_packs: 0, role: "user",
    suspended_until: null, suspension_reason: null, is_founder: false, founder_number: null,
    founder_price_lock_price_id: null, trial_ends_at: null,
  };
}
function resetState(): void {
  nextUserId = 100;
  usersById.clear();
  sessions.clear();
  invites.clear();
  redeemedCount = 0;
  adminAudit.length = 0;
  issuedCalls.length = 0;
  sentEmails.length = 0;
  waitlistRows = [];
  mockCodeSeq = 0;
  emailFailure = "ok";
  setBetaInviteEmailSenderForTesting(captureBetaInviteEmail);
  usersById.set(ADMIN_ID, { ...baseUser(ADMIN_ID, "owner@gradedate.app"), role: "owner", verification_status: "verified" });
  usersById.set(MODERATOR_ID, { ...baseUser(MODERATOR_ID, "mod@gradedate.test"), role: "moderator", verification_status: "verified" });
  sessions.set("s_admin", { id: "s_admin", user_id: ADMIN_ID, mfa_verified_at: "2026-08-11T16:00:00Z" });
}
function seedWaitlist(emails: string[]): void {
  waitlistRows = emails.map((email, i) => ({
    id: i + 1,
    email,
    zip_code: i % 2 === 0 ? "78701" : null,
    created_at: `2026-08-0${(i % 9) + 1}T12:00:00Z`,
  }));
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
    getUserById: async (id: number) => usersById.get(id) ?? null,
    getUserByEmail: async (email: string) => {
      for (const u of usersById.values()) if (u.email === email) return u;
      return null;
    },
    getSessionById: async (id: string) => sessions.get(id) ?? null,
    getBetaInviteCodeByCode: async (code: string) => invites.get(code) ?? null,
    getBetaInviteStats: async () => ({ cap: cohortCap(), redeemed: redeemedCount, issued: invites.size }),
    getRedeemedBetaInviteCount: async () => redeemedCount,
    issueBetaInviteCodes: async ({ codes, referrerUserId, issuedByUserId }: { codes: string[]; referrerUserId: number | null; issuedByUserId: number }) => {
      issuedCalls.push({ codes, referrerUserId, issuedByUserId });
      for (const code of codes) invites.set(code, { code, referrer_user_id: referrerUserId, redeemed_at: null, redeemed_by_user_id: null });
      return codes;
    },
    generateRandomCode: () => {
      mockCodeSeq++;
      return `BETA${String(mockCodeSeq).padStart(4, "0")}`;
    },
    listWaitlistEntries: async ({ limit, offset = 0 }: { limit: number; offset?: number }) =>
      waitlistRows.slice(offset, offset + limit),
    getWaitlistCount: async () => waitlistRows.length,
    getWaitlistEntriesByIds: async (ids: number[]) => waitlistRows.filter((r) => ids.includes(r.id)),
    joinWaitlist: async () => null,
    recordAdminAuditEvent: async (event: Record<string, unknown>) => { adminAudit.push(event); },
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

const ORIGINAL_BETA_REQUIRED = process.env.BETA_INVITE_REQUIRED;
const ORIGINAL_BETA_CAP = process.env.BETA_COHORT_CAP;
const ORIGINAL_STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
const ORIGINAL_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
let handleApiRoute: (req: Request) => Promise<Response | null>;
let setBetaInviteEmailSenderForTesting: (fn: (input: { email: string; inviteUrl: string }) => Promise<boolean>) => void;
function captureBetaInviteEmail(input: { email: string; inviteUrl: string }): Promise<boolean> {
  sentEmails.push({ to: input.email, inviteUrl: input.inviteUrl });
  return Promise.resolve(emailFailure === "ok");
}
beforeAll(async () => {
  process.env.STRIPE_SECRET_KEY = "sk_test_mock";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_mock";
  ({ handleApiRoute, setBetaInviteEmailSenderForTesting } = await import("./api-handler"));
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
function adminIssueRequest(body: Record<string, unknown>): Request {
  return new Request("https://gradedate.app/api/admin/beta-invites", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: "csrf_token=a; session_id=s_admin", "X-CSRF-Token": "a" },
    body: JSON.stringify(body),
  });
}
function adminWaitlistRequest(query = ""): Request {
  return new Request(`https://gradedate.app/api/admin/waitlist${query}`, {
    method: "GET",
    headers: { cookie: "csrf_token=a; session_id=s_admin" },
  });
}
function adminStatsRequest(): Request {
  return new Request("https://gradedate.app/api/admin/beta-invites", {
    method: "GET",
    headers: { cookie: "csrf_token=a; session_id=s_admin" },
  });
}

// ── Tests ─────────────────────────────────────────────────────
describe("GET /api/admin/waitlist — owner/admin waitlist listing", () => {
  beforeEach(() => {
    resetState();
    seedWaitlist(["one@example.test", "two@example.test", "three@example.test"]);
  });
  test("lists entries oldest-first with total, and audits the read", async () => {
    const res = await handleApiRoute(adminWaitlistRequest());
    expect(res!.status).toBe(200);
    const body = (await res!.json()) as { total: number; limit: number; offset: number; entries: Array<{ id: number; email: string; zip_code: string | null; created_at: string }> };
    expect(body.total).toBe(3);
    expect(body.entries.map((e) => e.email)).toEqual(["one@example.test", "two@example.test", "three@example.test"]);
    expect(body.entries[0]).toMatchObject({ id: 1, email: "one@example.test", zip_code: "78701" });
    expect(typeof body.entries[0].created_at).toBe("string");
    const audit = adminAudit.find((e) => e.action === "waitlist.read");
    expect(audit).toBeDefined();
    expect(audit!.actorUserId).toBe(ADMIN_ID);
    expect(audit!.metadata).toMatchObject({ total: 3 });
  });
  test("respects limit/offset pagination", async () => {
    const res = await handleApiRoute(adminWaitlistRequest("?limit=2&offset=1"));
    const body = (await res!.json()) as { total: number; entries: Array<{ email: string }> };
    expect(body.total).toBe(3);
    expect(body.entries.map((e) => e.email)).toEqual(["two@example.test", "three@example.test"]);
  });
  test("moderator role cannot read the waitlist (403, no emails leaked)", async () => {
    sessions.set("s_mod", { id: "s_mod", user_id: MODERATOR_ID, mfa_verified_at: "2026-08-11T16:00:00Z" });
    const res = await handleApiRoute(new Request("https://gradedate.app/api/admin/waitlist", {
      method: "GET",
      headers: { cookie: "csrf_token=a; session_id=s_mod" },
    }));
    expect(res!.status).toBe(403);
    expect(((await res!.json()) as Record<string, unknown>).code).toBe("PRIVILEGED_MFA_REQUIRED");
  });
  test("unauthenticated access is blocked by the privileged-MFA gate", async () => {
    const res = await handleApiRoute(new Request("https://gradedate.app/api/admin/waitlist", { method: "GET" }));
    expect(res!.status).toBe(403);
    expect(((await res!.json()) as Record<string, unknown>).code).toBe("PRIVILEGED_MFA_REQUIRED");
  });
});

describe("POST /api/admin/beta-invites with notify — issue + email invites", () => {
  beforeEach(() => {
    resetState();
    process.env.BETA_INVITE_REQUIRED = "true";
    seedWaitlist(["wl1@example.test", "wl2@example.test", "wl3@example.test"]);
  });
  test("issues plain codes and emails each waitlister their own link (one email per recipient)", async () => {
    const res = await handleApiRoute(adminIssueRequest({ count: 2, notify: true }));
    expect(res!.status).toBe(200);
    const body = (await res!.json()) as { codes: string[]; emailed: number; clamped: boolean; cohort: { cap: number; redeemed: number; remaining: number } };
    expect(body.codes).toHaveLength(2);
    expect(body.emailed).toBe(2);
    expect(body.clamped).toBe(false);
    expect(body.cohort).toEqual({ cap: 50, redeemed: 0, remaining: 50 });
    // One email per recipient, each carrying ONLY that recipient's code.
    expect(sentEmails).toHaveLength(2);
    expect(sentEmails[0].to).toBe("wl1@example.test");
    expect(sentEmails[0].inviteUrl).toBe(`https://gradedate.app/signup?ref=${body.codes[0]}`);
    expect(sentEmails[1].to).toBe("wl2@example.test");
    expect(sentEmails[1].inviteUrl).toBe(`https://gradedate.app/signup?ref=${body.codes[1]}`);
    // No email contains another recipient's code.
    for (const mail of sentEmails) {
      expect(mail.inviteUrl).not.toContain(body.codes.find((c) => !mail.inviteUrl.includes(c)) ?? "__none__");
    }
    // Waitlist invites are plain codes: referrer is NULL, so no referral reward.
    expect(issuedCalls).toHaveLength(1);
    expect(issuedCalls[0].referrerUserId).toBeNull();
    // Audit logged (counts only — codes never logged).
    const audit = adminAudit.find((e) => e.action === "beta_invites.issue");
    expect(audit).toBeDefined();
    expect(audit!.metadata).toMatchObject({ count: 2, notify: true });
    expect(JSON.stringify(audit!.metadata)).not.toContain("BETA");
    expect(JSON.stringify(audit!.metadata)).not.toContain("wl1");
  });
  test("no email is sent when notify is false", async () => {
    const res = await handleApiRoute(adminIssueRequest({ count: 2 }));
    expect(res!.status).toBe(200);
    expect(sentEmails).toHaveLength(0);
    expect(issuedCalls[0].referrerUserId).toBe(ADMIN_ID);
  });
  test("waitlist empty → 409 with a clear code, no codes issued, no emails", async () => {
    waitlistRows = [];
    const res = await handleApiRoute(adminIssueRequest({ count: 3, notify: true }));
    expect(res!.status).toBe(409);
    expect(((await res!.json()) as Record<string, unknown>).code).toBe("WAITLIST_EMPTY");
    expect(issuedCalls).toHaveLength(0);
    expect(sentEmails).toHaveLength(0);
  });
  test("cap interplay: requesting more than remaining cohort spots is clamped", async () => {
    // 47 already redeemed → 3 spots remain; ask for 5.
    redeemedCount = 47;
    const res = await handleApiRoute(adminIssueRequest({ count: 5, notify: true }));
    expect(res!.status).toBe(200);
    const body = (await res!.json()) as { codes: string[]; emailed: number; clamped: boolean };
    expect(body.codes).toHaveLength(3);
    expect(body.emailed).toBe(3);
    expect(body.clamped).toBe(true);
    expect(sentEmails.map((m) => m.to)).toEqual(["wl1@example.test", "wl2@example.test", "wl3@example.test"]);
  });
  test("cohort full (0 remaining) → 409 before any issuance", async () => {
    redeemedCount = 50;
    const res = await handleApiRoute(adminIssueRequest({ count: 2, notify: true }));
    expect(res!.status).toBe(409);
    expect(((await res!.json()) as Record<string, unknown>).code).toBe("BETA_COHORT_FULL");
    expect(issuedCalls).toHaveLength(0);
    expect(sentEmails).toHaveLength(0);
  });
  test("explicit waitlist_ids are the notify targets (in order)", async () => {
    const res = await handleApiRoute(adminIssueRequest({ count: 2, notify: true, waitlist_ids: [3, 1] }));
    expect(res!.status).toBe(200);
    const body = (await res!.json()) as { codes: string[]; emailed: number };
    expect(body.codes).toHaveLength(2);
    expect(body.emailed).toBe(2);
    // getWaitlistEntriesByIds preserves oldest-first order within the selected set.
    expect(sentEmails.map((m) => m.to)).toEqual(["wl1@example.test", "wl3@example.test"]);
    expect(sentEmails[1].inviteUrl).toContain(body.codes[1]);
  });
  test("notify + referrer_email is rejected (waitlist invites are plain)", async () => {
    const res = await handleApiRoute(adminIssueRequest({ count: 1, notify: true, referrer_email: "inviter@gradedate.test" }));
    expect(res!.status).toBe(400);
    expect(issuedCalls).toHaveLength(0);
    expect(sentEmails).toHaveLength(0);
  });
  test("delivery failures are counted but codes stay valid", async () => {
    emailFailure = "fail";
    const res = await handleApiRoute(adminIssueRequest({ count: 2, notify: true }));
    expect(res!.status).toBe(200);
    const body = (await res!.json()) as { codes: string[]; emailed: number };
    expect(body.codes).toHaveLength(2);
    expect(body.emailed).toBe(0);
    const audit = adminAudit.find((e) => e.action === "beta_invites.notify");
    expect(audit).toBeDefined();
    expect(audit!.metadata).toMatchObject({ attempted: 2, delivered: 0, failed: 2 });
  });
  test("non-admin (moderator) cannot issue", async () => {
    sessions.set("s_mod", { id: "s_mod", user_id: MODERATOR_ID, mfa_verified_at: "2026-08-11T16:00:00Z" });
    const res = await handleApiRoute(new Request("https://gradedate.app/api/admin/beta-invites", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: "csrf_token=a; session_id=s_mod", "X-CSRF-Token": "a" },
      body: JSON.stringify({ count: 2, notify: true }),
    }));
    expect(res!.status).toBe(403);
    expect(sentEmails).toHaveLength(0);
  });
});

describe("GET /api/admin/beta-invites — cohort progress", () => {
  beforeEach(() => {
    resetState();
    process.env.BETA_INVITE_REQUIRED = "true";
    seedWaitlist(["a@example.test", "b@example.test"]);
  });
  test("returns redeemed/cap/remaining plus waitlist total, without codes", async () => {
    invites.set("BETA0001", { code: "BETA0001", referrer_user_id: ADMIN_ID, redeemed_at: "2026-08-11T10:00:00Z", redeemed_by_user_id: 101 });
    redeemedCount = 1;
    const res = await handleApiRoute(adminStatsRequest());
    expect(res!.status).toBe(200);
    const body = (await res!.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      issued: 1,
      cohort: { cap: 50, redeemed: 1, remaining: 49 },
      waitlist: { total: 2 },
    });
    expect(JSON.stringify(body)).not.toContain("BETA");
  });
});
