import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { skipVerificationVisible } from "./age-verification";

/**
 * Mandatory age-verification (owner-ratified beta decisions):
 * - Stripe Identity sessions default to document + require_matching_selfie
 *   (env STRIPE_IDENTITY_REQUIREMENTS can still override to "document").
 * - When VERIFICATION_REQUIRED=true (set for production + preview in beta),
 *   core actions (like, message, subscription checkout, store upsell) return
 *   403 "Verify your age to continue" for any user whose verification_status
 *   is not "verified" — enforced server-side so direct API calls cannot
 *   bypass it. Browsing/profile editing stay open.
 * - Onboarding hides the "Skip for now" affordance when verification is
 *   required.
 *
 * Behavioral tests drive the real handleApiRoute through
 * mock.module("stripe") + mock.module("../src/db.ts"); the db mock is
 * generated from api-handler's own import list so it satisfies every import.
 */
const apiSource = readFileSync(new URL("./api-handler.ts", import.meta.url), "utf8");
const dbImportMatch = apiSource.match(/import \{([^}]*)\} from "\.\.\/src\/db\.ts"/);
if (!dbImportMatch) throw new Error("could not locate db import block in api-handler.ts");
const DB_IMPORT_NAMES = dbImportMatch[1]
  .split(",")
  .map((s) => s.trim().replace(/^type\s+/, ""))
  .filter(Boolean);

// ── Shared mutable state the mocks read/write ──────────────────
let currentUser: Record<string, unknown> = {
  id: 7,
  email: "verify@gradedate.test",
  display_name: "Verifier",
  subscription_status: "none",
  subscription_updated_at: null,
  suspended_until: null,
  verification_status: "unverified",
  verification_session_id: null,
  verification_session_created_at: null,
  verification_verified_at: null,
};
const createCalls: Array<Record<string, unknown>> = [];
const recordLikeCalls: Array<[number, number, string]> = [];
const createMessageCalls: Array<Record<string, unknown>> = [];

function makeDbMock(): Record<string, unknown> {
  const mock: Record<string, unknown> = {};
  for (const name of DB_IMPORT_NAMES) mock[name] = async () => undefined;
  return {
    ...mock,
    getSessionById: async () => ({ id: "s1", user_id: 7 }),
    getUserById: async () => currentUser,
    startVerificationSession: async (_userId: number, sessionId: string) => ({
      ...currentUser,
      verification_status: "pending",
      verification_session_id: sessionId,
    }),
    getPushSubscriptions: async () => [],
    // Like happy-path dependencies
    useDailyLike: async () => 5,
    getLike: async () => null,
    recordLike: async (a: number, b: number, action: string) => {
      recordLikeCalls.push([a, b, action]);
      return true;
    },
    // Message happy-path dependencies
    getMatchById: async () => ({
      id: 1,
      user1_id: 7,
      user2_id: 99,
      created_at: "2026-08-11T16:00:00Z",
      mutual_league_score: null,
    }),
    createMessage: async (matchId: number, senderId: number, content: string) => {
      createMessageCalls.push({ matchId, senderId, content });
      return { id: 11, match_id: matchId, sender_id: senderId, content, read: false, created_at: "2026-08-11T16:00:00Z" };
    },
    upsertMessageModerationFlag: async () => undefined,
  };
}
mock.module("../src/db.ts", () => makeDbMock());
mock.module("stripe", () => ({
  default: class FakeStripe {
    constructor(key: string) {
      if (!key) throw new Error("FakeStripe requires a secret key");
    }
    identity = {
      verificationSessions: {
        retrieve: async () => null,
        create: async (params: Record<string, unknown>) => {
          createCalls.push(params);
          return { id: "vs_new", client_secret: "secret_new" };
        },
      },
    };
    webhooks = { constructEvent: () => ({}) };
  },
}));

const ORIGINAL_STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
const ORIGINAL_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const ORIGINAL_REQUIRED = process.env.VERIFICATION_REQUIRED;
const ORIGINAL_ID_REQ = process.env.STRIPE_IDENTITY_REQUIREMENTS;
let handleApiRoute: (req: Request) => Promise<Response | null>;

function resetState(): void {
  createCalls.length = 0;
  recordLikeCalls.length = 0;
  createMessageCalls.length = 0;
  currentUser = {
    id: 7,
    email: "verify@gradedate.test",
    display_name: "Verifier",
    subscription_status: "none",
    subscription_updated_at: null,
    suspended_until: null,
    verification_status: "unverified",
    verification_session_id: null,
    verification_session_created_at: null,
    verification_verified_at: null,
  };
}

function authHeaders(): Record<string, string> {
  return {
    "content-type": "application/json",
    cookie: "session_id=s1; csrf_token=a",
    "X-CSRF-Token": "a",
  };
}
function likeRequest(): Request {
  return new Request("https://gradedate.test/api/matches/like", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ liked_id: 99 }),
  });
}
function messageRequest(): Request {
  return new Request("https://gradedate.test/api/messages/send", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ match_id: 1, content: "hi there!" }),
  });
}
function checkoutRequest(): Request {
  return new Request("https://gradedate.test/api/subscription/create-checkout", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ plan: "monthly" }),
  });
}
function upsellRequest(): Request {
  return new Request("https://gradedate.test/api/store/create-checkout", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ product: "boost" }),
  });
}
function verificationSessionRequest(): Request {
  return new Request("https://gradedate.test/api/verification/session", {
    method: "POST",
    headers: authHeaders(),
    body: "{}",
  });
}

beforeAll(async () => {
  process.env.STRIPE_SECRET_KEY = "sk_test_mock";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_mock";
  ({ handleApiRoute } = await import("./api-handler"));
});
afterAll(() => {
  const restore = (name: string, original: string | undefined) => {
    if (original === undefined) delete process.env[name];
    else process.env[name] = original;
  };
  restore("STRIPE_SECRET_KEY", ORIGINAL_STRIPE_KEY);
  restore("STRIPE_WEBHOOK_SECRET", ORIGINAL_WEBHOOK_SECRET);
  restore("VERIFICATION_REQUIRED", ORIGINAL_REQUIRED);
  restore("STRIPE_IDENTITY_REQUIREMENTS", ORIGINAL_ID_REQ);
});

describe("identityRequirements — document + matching selfie by default", () => {
  test("default (no env) creates a session with require_matching_selfie=true", async () => {
    resetState();
    delete process.env.STRIPE_IDENTITY_REQUIREMENTS;
    const res = await handleApiRoute(verificationSessionRequest());
    expect(res!.status).toBe(200);
    expect(createCalls).toHaveLength(1);
    const params = createCalls[0] as { options?: { document?: { require_matching_selfie?: boolean } } };
    expect(params.options).toEqual({ document: { require_matching_selfie: true } });
  });

  test("document_selfie env keeps require_matching_selfie=true", async () => {
    resetState();
    process.env.STRIPE_IDENTITY_REQUIREMENTS = "document_selfie";
    const res = await handleApiRoute(verificationSessionRequest());
    expect(res!.status).toBe(200);
    const params = createCalls[0] as { options?: { document?: { require_matching_selfie?: boolean } } };
    expect(params.options).toEqual({ document: { require_matching_selfie: true } });
  });

  test("document env override disables the selfie requirement", async () => {
    resetState();
    process.env.STRIPE_IDENTITY_REQUIREMENTS = "document";
    const res = await handleApiRoute(verificationSessionRequest());
    expect(res!.status).toBe(200);
    const params = createCalls[0] as { options?: { document?: { require_matching_selfie?: boolean } } };
    expect(params.options).toEqual({ document: { require_matching_selfie: false } });
  });
});

describe("VERIFICATION_REQUIRED=true — unverified users are blocked", () => {
  beforeAll(() => {
    process.env.VERIFICATION_REQUIRED = "true";
  });

  test("like returns 403 with a clear error and records nothing", async () => {
    resetState();
    const res = await handleApiRoute(likeRequest());
    expect(res!.status).toBe(403);
    const body = (await res!.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ error: "Verify your age to continue", code: "VERIFICATION_REQUIRED" });
    expect(recordLikeCalls).toEqual([]);
  });

  test("message send returns 403", async () => {
    resetState();
    const res = await handleApiRoute(messageRequest());
    expect(res!.status).toBe(403);
    const body = (await res!.json()) as Record<string, unknown>;
    expect(body.error).toBe("Verify your age to continue");
    expect(createMessageCalls).toEqual([]);
  });

  test("subscription checkout returns 403", async () => {
    resetState();
    const res = await handleApiRoute(checkoutRequest());
    expect(res!.status).toBe(403);
    const body = (await res!.json()) as Record<string, unknown>;
    expect(body.error).toBe("Verify your age to continue");
  });

  test("store upsell (boost) returns 403", async () => {
    resetState();
    const res = await handleApiRoute(upsellRequest());
    expect(res!.status).toBe(403);
    const body = (await res!.json()) as Record<string, unknown>;
    expect(body.error).toBe("Verify your age to continue");
  });

  test("pending (started but unfinished) users are also blocked", async () => {
    resetState();
    currentUser = { ...currentUser, verification_status: "pending", verification_session_id: "vs_a" };
    const res = await handleApiRoute(likeRequest());
    expect(res!.status).toBe(403);
  });

  test("verified user is allowed to like", async () => {
    resetState();
    currentUser = { ...currentUser, verification_status: "verified", verification_verified_at: "2026-08-11T16:00:00Z" };
    const res = await handleApiRoute(likeRequest());
    expect(res!.status).toBe(200);
    const body = (await res!.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ ok: true, matched: false });
    expect(recordLikeCalls).toEqual([[7, 99, "like"]]);
  });

  test("verified user is allowed to send a message", async () => {
    resetState();
    currentUser = { ...currentUser, verification_status: "verified", verification_verified_at: "2026-08-11T16:00:00Z" };
    const res = await handleApiRoute(messageRequest());
    expect(res!.status).toBe(200);
    const body = (await res!.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ ok: true });
    expect(createMessageCalls).toEqual([{ matchId: 1, senderId: 7, content: "hi there!" }]);
  });
});

describe("VERIFICATION_REQUIRED off — pre-beta behavior unchanged", () => {
  test("unverified user can still like", async () => {
    resetState();
    delete process.env.VERIFICATION_REQUIRED;
    const res = await handleApiRoute(likeRequest());
    expect(res!.status).toBe(200);
    expect(recordLikeCalls).toEqual([[7, 99, "like"]]);
  });
});

describe("onboarding skip affordance", () => {
  test("skip is hidden when verification is required", () => {
    expect(skipVerificationVisible({ verification_required: true } as never)).toBe(false);
  });
  test("skip is visible when verification is optional", () => {
    expect(skipVerificationVisible({ verification_required: false } as never)).toBe(true);
  });
  test("skip is never shown to anonymous users", () => {
    expect(skipVerificationVisible(null)).toBe(false);
  });
});
