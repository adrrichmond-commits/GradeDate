import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";

/**
 * Verification-session contract (age-verification pending-state fix):
 * - A user with verification_status="pending" must NEVER dead-end in a 409.
 *   Clicking "Resume verification" either resumes the SAME Stripe session
 *   (status processing/requires_input), persists an already-verified outcome
 *   (status verified, webhook not yet landed), or transparently replaces a
 *   dead session (canceled/expired/unknown/retrieval-error) with a fresh one.
 * - The identity webhook must only apply events whose session id matches the
 *   user's CURRENT verification_session_id; late events for replaced or
 *   abandoned sessions must not flip the user's status.
 *
 * Behavioral tests drive the real handleApiRoute through
 * mock.module("stripe") + mock.module("../src/db.ts") so no network or
 * database is touched. The db mock is generated from api-handler's own import
 * list so it always satisfies every named import.
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
  subscription_status: "none",
  subscription_updated_at: null,
  suspended_until: null,
  verification_status: "unverified",
  verification_session_id: null,
  verification_session_created_at: null,
  verification_verified_at: null,
};
let retrieveResult: unknown = null; // what identity retrieve returns (or throws)
let retrieveThrows = false;
const retrieveCalls: string[] = [];
const createCalls: Array<Record<string, unknown>> = [];
const startCalls: Array<[number, string]> = [];
const outcomeCalls: Array<[number, string, string]> = [];
const resetCalls: number[] = [];
let nextEvent: Record<string, unknown> = {
  id: "evt_identity",
  type: "identity.verification_session.canceled",
  data: { object: { id: "vs_a" } },
};

function makeDbMock(): Record<string, unknown> {
  const mock: Record<string, unknown> = {};
  for (const name of DB_IMPORT_NAMES) mock[name] = async () => undefined;
  return {
    ...mock,
    getSessionById: async () => ({ id: "s1", user_id: 7 }),
    getUserById: async () => currentUser,
    getUserByVerificationSessionId: async (sessionId: string) =>
      sessionId === currentUser.verification_session_id ? currentUser : null,
    startVerificationSession: async (userId: number, sessionId: string) => {
      startCalls.push([userId, sessionId]);
      return { ...currentUser, verification_status: "pending", verification_session_id: sessionId };
    },
    updateVerificationOutcome: async (userId: number, sessionId: string, outcome: string) => {
      outcomeCalls.push([userId, sessionId, outcome]);
    },
    resetVerificationSession: async (userId: number) => {
      resetCalls.push(userId);
    },
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
        retrieve: async (id: string) => {
          retrieveCalls.push(id);
          if (retrieveThrows) throw new Error("No such verification_session: " + id);
          return retrieveResult;
        },
        create: async (params: Record<string, unknown>) => {
          createCalls.push(params);
          return { id: "vs_new", client_secret: "secret_new" };
        },
      },
    };
    webhooks = {
      constructEvent: () => nextEvent,
    };
  },
}));
const ORIGINAL_STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
const ORIGINAL_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
let handleApiRoute: (req: Request) => Promise<Response | null>;

function sessionRequest(): Request {
  return new Request("https://gradedate.test/api/verification/session", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: "session_id=s1; csrf_token=a",
      "X-CSRF-Token": "a",
    },
    body: "{}",
  });
}
function webhookRequest(): Request {
  return new Request("https://gradedate.test/api/webhooks/stripe", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": "t=1750000000,v1=fakesignature",
    },
    body: JSON.stringify({}),
  });
}
function pendingUser(): void {
  currentUser = {
    ...currentUser,
    verification_status: "pending",
    verification_session_id: "vs_a",
    verification_session_created_at: "2026-08-11T16:00:00Z",
    verification_verified_at: null,
  };
}
function resetState(): void {
  retrieveResult = null;
  retrieveThrows = false;
  retrieveCalls.length = 0;
  createCalls.length = 0;
  startCalls.length = 0;
  outcomeCalls.length = 0;
  resetCalls.length = 0;
  currentUser = {
    id: 7,
    email: "verify@gradedate.test",
    subscription_status: "none",
    subscription_updated_at: null,
    suspended_until: null,
    verification_status: "unverified",
    verification_session_id: null,
    verification_session_created_at: null,
    verification_verified_at: null,
  };
}

beforeAll(async () => {
  process.env.STRIPE_SECRET_KEY = "sk_test_mock";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_mock";
  ({ handleApiRoute } = await import("./api-handler"));
});
afterAll(() => {
  if (ORIGINAL_STRIPE_KEY === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = ORIGINAL_STRIPE_KEY;
  if (ORIGINAL_WEBHOOK_SECRET === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
  else process.env.STRIPE_WEBHOOK_SECRET = ORIGINAL_WEBHOOK_SECRET;
});

describe("POST /api/verification/session — pending resume/replace flow", () => {
  test("fresh session for an unverified user (no pending state)", async () => {
    resetState();
    const res = await handleApiRoute(sessionRequest());
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const body = (await res!.json()) as Record<string, unknown>;
    expect(body).toEqual({ client_secret: "secret_new", id: "vs_new" });
    expect(retrieveCalls).toEqual([]);
    expect(createCalls).toHaveLength(1);
    expect(startCalls).toEqual([[7, "vs_new"]]);
    expect(resetCalls).toEqual([]);
    expect(outcomeCalls).toEqual([]);
  });

  test("resumes the SAME session when Stripe reports processing", async () => {
    resetState();
    pendingUser();
    retrieveResult = { id: "vs_a", status: "processing", client_secret: "secret_a" };
    const res = await handleApiRoute(sessionRequest());
    expect(res!.status).toBe(200);
    const body = (await res!.json()) as Record<string, unknown>;
    expect(body).toEqual({ client_secret: "secret_a", id: "vs_a", resumed: true });
    expect(retrieveCalls).toEqual(["vs_a"]);
    expect(createCalls).toEqual([]);
    expect(startCalls).toEqual([]);
    expect(resetCalls).toEqual([]);
  });

  test("resumes the SAME session when Stripe reports requires_input", async () => {
    resetState();
    pendingUser();
    retrieveResult = { id: "vs_a", status: "requires_input", client_secret: "secret_a" };
    const res = await handleApiRoute(sessionRequest());
    expect(res!.status).toBe(200);
    const body = (await res!.json()) as Record<string, unknown>;
    expect(body).toEqual({ client_secret: "secret_a", id: "vs_a", resumed: true });
    expect(createCalls).toEqual([]);
    expect(resetCalls).toEqual([]);
  });

  test("persists verified and returns 200 when Stripe already verified the session", async () => {
    resetState();
    pendingUser();
    retrieveResult = { id: "vs_a", status: "verified", client_secret: "secret_a" };
    const res = await handleApiRoute(sessionRequest());
    expect(res!.status).toBe(200);
    const body = (await res!.json()) as Record<string, unknown>;
    expect(body).toEqual({ verified: true });
    expect(outcomeCalls).toEqual([[7, "vs_a", "verified"]]);
    expect(createCalls).toEqual([]);
    expect(resetCalls).toEqual([]);
  });

  test("replaces a canceled session with a fresh one", async () => {
    resetState();
    pendingUser();
    retrieveResult = { id: "vs_a", status: "canceled", client_secret: "secret_a" };
    const res = await handleApiRoute(sessionRequest());
    expect(res!.status).toBe(200);
    const body = (await res!.json()) as Record<string, unknown>;
    expect(body).toEqual({ client_secret: "secret_new", id: "vs_new" });
    expect(resetCalls).toEqual([7]);
    expect(createCalls).toHaveLength(1);
    expect(startCalls).toEqual([[7, "vs_new"]]);
    expect(outcomeCalls).toEqual([]);
  });

  test("replaces any terminal/unknown status (e.g. expired) with a fresh one", async () => {
    resetState();
    pendingUser();
    retrieveResult = { id: "vs_a", status: "expired", client_secret: "secret_a" };
    const res = await handleApiRoute(sessionRequest());
    expect(res!.status).toBe(200);
    const body = (await res!.json()) as Record<string, unknown>;
    expect(body.client_secret).toBe("secret_new");
    expect(resetCalls).toEqual([7]);
    expect(startCalls).toEqual([[7, "vs_new"]]);
  });

  test("replaces the session when retrieval fails (expired/vanished)", async () => {
    resetState();
    pendingUser();
    retrieveThrows = true;
    const res = await handleApiRoute(sessionRequest());
    expect(res!.status).toBe(200);
    const body = (await res!.json()) as Record<string, unknown>;
    expect(body).toEqual({ client_secret: "secret_new", id: "vs_new" });
    expect(resetCalls).toEqual([7]);
    expect(createCalls).toHaveLength(1);
    expect(startCalls).toEqual([[7, "vs_new"]]);
  });

  test("keeps the already-verified 409 guard at the top (no Stripe calls)", async () => {
    resetState();
    currentUser = { ...currentUser, verification_status: "verified", verification_verified_at: "2026-08-11T16:00:00Z" };
    const res = await handleApiRoute(sessionRequest());
    expect(res!.status).toBe(409);
    const body = (await res!.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ error: "Already verified", verified: true });
    expect(retrieveCalls).toEqual([]);
    expect(createCalls).toEqual([]);
  });
});

describe("identity webhook — stale-session guard", () => {
  test("applies a verified event for the user's CURRENT session", async () => {
    resetState();
    pendingUser();
    nextEvent = {
      id: "evt_v",
      type: "identity.verification_session.verified",
      data: { object: { id: "vs_a" } },
    };
    const res = await handleApiRoute(webhookRequest());
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    expect(outcomeCalls).toEqual([[7, "vs_a", "verified"]]);
  });

  test("applies canceled/requires_input as unverified for the CURRENT session", async () => {
    resetState();
    pendingUser();
    nextEvent = {
      id: "evt_c",
      type: "identity.verification_session.canceled",
      data: { object: { id: "vs_a" } },
    };
    const res = await handleApiRoute(webhookRequest());
    expect(res!.status).toBe(200);
    expect(outcomeCalls).toEqual([[7, "vs_a", "unverified"]]);
  });

  test("IGNORES a late event for a replaced/abandoned session", async () => {
    resetState();
    // User replaced vs_a with vs_b; the old session's late event must not flip them.
    currentUser = {
      ...currentUser,
      verification_status: "pending",
      verification_session_id: "vs_b",
      verification_session_created_at: "2026-08-11T16:05:00Z",
    };
    nextEvent = {
      id: "evt_old",
      type: "identity.verification_session.canceled",
      data: { object: { id: "vs_a" } },
    };
    const res = await handleApiRoute(webhookRequest());
    expect(res!.status).toBe(200);
    expect(outcomeCalls).toEqual([]);
  });

  test("IGNORES a late verified event for an abandoned session", async () => {
    resetState();
    currentUser = {
      ...currentUser,
      verification_status: "pending",
      verification_session_id: "vs_b",
    };
    nextEvent = {
      id: "evt_old_v",
      type: "identity.verification_session.verified",
      data: { object: { id: "vs_a" } },
    };
    const res = await handleApiRoute(webhookRequest());
    expect(res!.status).toBe(200);
    expect(outcomeCalls).toEqual([]);
  });
});
