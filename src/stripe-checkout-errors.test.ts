import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  stripeErrorClientFields,
  stripeErrorDetails,
  stripeErrorMessage,
  stripeErrorStatus,
} from "./stripe-error";
import { EVENTS } from "./observability";

/**
 * Checkout error-handling contract:
 * - A Stripe failure during checkout must surface the readable Stripe message
 *   in a JSON body (never a non-JSON 500), reflect Stripe's own 4xx/5xx status,
 *   and never leave the user blocked from retrying.
 * - A stale "processing" marker (older than 15 minutes) must unblock retry.
 *
 * The behavioral tests drive the real handleApiRoute through
 * mock.module("stripe") + mock.module("../src/db.ts") so no network or
 * database is touched. The db mock is generated from api-handler's own import
 * list so it always satisfies every named import (push.ts and api-handler both
 * import from db at module scope).
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
  email: "checkout@gradedate.test",
  subscription_status: "none",
  subscription_updated_at: null,
  suspended_until: null,
};
let stripeError: unknown = null;
const statusCalls: Array<[number, string]> = [];
const clearedPending: Array<[number, string]> = [];

function makeDbMock(): Record<string, unknown> {
  const mock: Record<string, unknown> = {};
  for (const name of DB_IMPORT_NAMES) mock[name] = async () => undefined;
  return {
    ...mock,
    getSessionById: async () => ({ id: "s1", user_id: 7 }),
    getUserById: async () => currentUser,
    updateSubscriptionStatus: async (id: number, status: string) => {
      statusCalls.push([id, status]);
    },
    clearPendingUpsell: async (id: number, product: string) => {
      clearedPending.push([id, product]);
    },
    getUpsellEntitlementState: async () => ({ entitled: false, pending: false }),
    createPendingUpsell: async () => true,
  };
}

mock.module("../src/db.ts", () => makeDbMock());

mock.module("stripe", () => ({
  default: class FakeStripe {
    constructor(key: string) {
      if (!key) throw new Error("FakeStripe requires a secret key");
    }
    checkout = {
      sessions: {
        create: async () => {
          if (stripeError) throw stripeError;
          return { id: "cs_test", url: "https://checkout.stripe.com/c/pay/cs_test" };
        },
        expire: async () => {},
      },
    };
  },
}));

const ORIGINAL_STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
const ORIGINAL_UPSELL_PRICES = {
  regrade: process.env.STRIPE_REGRADE_PRICE_ID,
  boost: process.env.STRIPE_BOOST_PRICE_ID,
  likePack: process.env.STRIPE_LIKE_PACK_PRICE_ID,
};

let handleApiRoute: (req: Request) => Promise<Response | null>;

function makeRequest(path: string, body: unknown): Request {
  return new Request(`https://gradedate.test${path}`, {
    method: "POST",
    headers: {
      cookie: "session_id=s1; csrf_token=abc",
      "x-csrf-token": "abc",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function stripeErr(message: string, extra: Record<string, unknown> = {}) {
  const err: Record<string, unknown> = new Error(message);
  Object.assign(err, { type: "StripeInvalidRequestError", code: "resource_missing", statusCode: 400, requestId: "req_live_abc", ...extra });
  return err;
}

beforeAll(async () => {
  process.env.STRIPE_SECRET_KEY = "sk_test_mock";
  process.env.STRIPE_REGRADE_PRICE_ID = "price_regrade";
  process.env.STRIPE_BOOST_PRICE_ID = "price_boost";
  process.env.STRIPE_LIKE_PACK_PRICE_ID = "price_like_pack";
  ({ handleApiRoute } = await import("./api-handler"));
});

afterAll(() => {
  if (ORIGINAL_STRIPE_KEY === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = ORIGINAL_STRIPE_KEY;
  if (ORIGINAL_UPSELL_PRICES.regrade === undefined) delete process.env.STRIPE_REGRADE_PRICE_ID;
  else process.env.STRIPE_REGRADE_PRICE_ID = ORIGINAL_UPSELL_PRICES.regrade;
  if (ORIGINAL_UPSELL_PRICES.boost === undefined) delete process.env.STRIPE_BOOST_PRICE_ID;
  else process.env.STRIPE_BOOST_PRICE_ID = ORIGINAL_UPSELL_PRICES.boost;
  if (ORIGINAL_UPSELL_PRICES.likePack === undefined) delete process.env.STRIPE_LIKE_PACK_PRICE_ID;
  else process.env.STRIPE_LIKE_PACK_PRICE_ID = ORIGINAL_UPSELL_PRICES.likePack;
});

describe("stripe-error helpers", () => {
  test("extracts the readable Stripe message", () => {
    expect(stripeErrorMessage(stripeErr("No such price: 'price_1U3FtBDRVY1OwX1GxlXTusdU'"))).toBe(
      "No such price: 'price_1U3FtBDRVY1OwX1GxlXTusdU'",
    );
    expect(stripeErrorMessage(new Error("Invalid API Key provided"))).toBe("Invalid API Key provided");
  });
  test("falls back to a generic message for non-Stripe errors", () => {
    expect(stripeErrorMessage(undefined)).toBe("Stripe checkout failed. Please try again.");
    expect(stripeErrorMessage("boom")).toBe("Stripe checkout failed. Please try again.");
    expect(stripeErrorMessage({})).toBe("Stripe checkout failed. Please try again.");
  });
  test("uses the Stripe error's own 4xx/5xx status, else 500", () => {
    expect(stripeErrorStatus(stripeErr("no price", { statusCode: 404 }))).toBe(404);
    expect(stripeErrorStatus(stripeErr("no price", { statusCode: 503 }))).toBe(503);
    expect(stripeErrorStatus(stripeErr("no price", { statusCode: 401 }))).toBe(401);
    expect(stripeErrorStatus(stripeErr("no price"))).toBe(400);
    // Non-4xx/5xx or missing status codes fall back to 500
    expect(stripeErrorStatus(stripeErr("no price", { statusCode: 302 }))).toBe(500);
    expect(stripeErrorStatus(stripeErr("no price", { statusCode: undefined }))).toBe(500);
    expect(stripeErrorStatus(undefined)).toBe(500);
  });
  test("collects structured details for server logs (no API key material)", () => {
    expect(stripeErrorDetails(stripeErr("No such price"))).toEqual({
      message: "No such price",
      code: "resource_missing",
      type: "StripeInvalidRequestError",
      statusCode: 400,
      requestId: "req_live_abc",
    });
  });
  test("client fields carry only type and Stripe request id", () => {
    expect(stripeErrorClientFields(stripeErr("No such price"))).toEqual({
      type: "StripeInvalidRequestError",
      request_id: "req_live_abc",
    });
    expect(stripeErrorClientFields({ message: "x" })).toEqual({});
  });
});

describe("subscription checkout Stripe failure", () => {
  test("returns a JSON body with the Stripe message and resets subscription_status to none", async () => {
    statusCalls.length = 0;
    stripeError = stripeErr("No such price: 'price_1U3FtBDRVY1OwX1GxlXTusdU'");
    try {
      const res = await handleApiRoute(makeRequest("/api/subscription/create-checkout", { plan: "monthly" }));
      expect(res).not.toBeNull();
      expect(res!.status).toBe(400);
      const body = (await res!.json()) as Record<string, unknown>;
      expect(body.error).toContain("No such price");
      expect(body.code).toBe("STRIPE_CHECKOUT_FAILED");
      expect((body.stripe as Record<string, unknown>).type).toBe("StripeInvalidRequestError");
      expect((body.stripe as Record<string, unknown>).request_id).toBe("req_live_abc");
      // The reset to "none" must come AFTER the "processing" marker was set.
      expect(statusCalls).toEqual([[7, "processing"], [7, "none"]]);
    } finally {
      stripeError = null;
    }
  });

  test("reflects a 503 and 500 fallback for other Stripe failures", async () => {
    statusCalls.length = 0;
    stripeError = stripeErr("Stripe is overloaded", { statusCode: 503, type: "StripeConnectionError" });
    try {
      const res = await handleApiRoute(makeRequest("/api/subscription/create-checkout", { plan: "monthly" }));
      expect(res!.status).toBe(503);
      expect((await res!.json()) as Record<string, unknown>).toMatchObject({ error: "Stripe is overloaded" });
      expect(statusCalls.at(-1)).toEqual([7, "none"]);
    } finally {
      stripeError = null;
    }

    statusCalls.length = 0;
    stripeError = new Error("Socket hang up"); // no statusCode
    try {
      const res = await handleApiRoute(makeRequest("/api/subscription/create-checkout", { plan: "monthly" }));
      expect(res!.status).toBe(500);
      const body = (await res!.json()) as Record<string, unknown>;
      expect(body.error).toBe("Socket hang up");
      expect(body.code).toBe("STRIPE_CHECKOUT_FAILED");
      expect(statusCalls.at(-1)).toEqual([7, "none"]);
    } finally {
      stripeError = null;
    }
  });

  test("a stale 'processing' marker unblocks the retry and is reset before a fresh checkout", async () => {
    statusCalls.length = 0;
    stripeError = null;
    currentUser = {
      ...currentUser,
      subscription_status: "processing",
      subscription_updated_at: new Date(Date.now() - 20 * 60_000).toISOString(),
    };
    try {
      const res = await handleApiRoute(makeRequest("/api/subscription/create-checkout", { plan: "monthly" }));
      expect(res).not.toBeNull();
      expect(res!.status).toBe(200);
      const body = (await res!.json()) as Record<string, unknown>;
      expect(body.url).toBe("https://checkout.stripe.com/c/pay/cs_test");
      // stale marker cleared (none) then fresh checkout marker set (processing)
      expect(statusCalls).toEqual([[7, "none"], [7, "processing"]]);
    } finally {
      currentUser = { ...currentUser, subscription_status: "none", subscription_updated_at: null };
    }
  });

  test("a fresh 'processing' marker still blocks with 409 and never touches status", async () => {
    statusCalls.length = 0;
    currentUser = {
      ...currentUser,
      subscription_status: "processing",
      subscription_updated_at: new Date(Date.now() - 60_000).toISOString(),
    };
    try {
      const res = await handleApiRoute(makeRequest("/api/subscription/create-checkout", { plan: "monthly" }));
      expect(res!.status).toBe(409);
      const body = (await res!.json()) as Record<string, unknown>;
      expect(body.code).toBe("SUBSCRIPTION_ALREADY_PENDING");
      expect(statusCalls).toEqual([]);
    } finally {
      currentUser = { ...currentUser, subscription_status: "none", subscription_updated_at: null };
    }
  });

  test("an active subscription always blocks, even with a stale timestamp", async () => {
    currentUser = {
      ...currentUser,
      subscription_status: "active",
      subscription_updated_at: new Date(Date.now() - 60 * 60_000).toISOString(),
    };
    try {
      const res = await handleApiRoute(makeRequest("/api/subscription/create-checkout", { plan: "monthly" }));
      expect(res!.status).toBe(409);
    } finally {
      currentUser = { ...currentUser, subscription_status: "none", subscription_updated_at: null };
    }
  });
});

describe("upsell checkout Stripe failure", () => {
  test("returns a JSON body with the Stripe message and clears the pending marker", async () => {
    statusCalls.length = 0;
    clearedPending.length = 0;
    stripeError = stripeErr("No such price: 'price_1X'");
    try {
      const res = await handleApiRoute(makeRequest("/api/store/create-checkout", { product: "boost" }));
      expect(res).not.toBeNull();
      expect(res!.status).toBe(400);
      const body = (await res!.json()) as Record<string, unknown>;
      expect(body.error).toContain("No such price");
      expect(body.code).toBe("STRIPE_CHECKOUT_FAILED");
      expect(clearedPending).toEqual([[7, "boost"]]);
      expect(statusCalls).toEqual([]);
    } finally {
      stripeError = null;
    }
  });

  test("503 from Stripe propagates for upsells too", async () => {
    clearedPending.length = 0;
    stripeError = stripeErr("Connection error", { statusCode: 503, type: "StripeConnectionError" });
    try {
      const res = await handleApiRoute(makeRequest("/api/store/create-checkout", { product: "re-grade" }));
      expect(res!.status).toBe(503);
      expect(((await res!.json()) as Record<string, unknown>).error).toContain("Connection error");
      expect(clearedPending).toEqual([[7, "re-grade"]]);
    } finally {
      stripeError = null;
    }
  });
});

describe("checkout error-handling wiring (static contract)", () => {
  test("handleCreateCheckout wraps the Stripe call, resets to none, logs, and returns JSON", () => {
    expect(apiSource).toContain("isCheckoutBlocked(user.subscription_status, user.subscription_updated_at)");
    // reset-on-error path must use the existing helper
    expect(apiSource).toContain("await updateSubscriptionStatus(user.id, \"none\")");
    // server-side structured log with Stripe details
    expect(apiSource).toContain("logError(EVENTS.PREMIUM_CHECKOUT_FAILED");
    expect(apiSource).toContain("...stripeErrorDetails(err)");
    // the failed checkout never falls through to the global non-JSON 500
    expect(apiSource).toContain("code: \"STRIPE_CHECKOUT_FAILED\"");
    expect(apiSource).toContain("stripeErrorStatus(err)");
  });
  test("handleUpsellCheckout clears the pending marker, logs, and returns JSON on Stripe failure", () => {
    expect(apiSource).toContain("logError(EVENTS.STRIPE_UPSELL_CHECKOUT_FAILED");
    expect(apiSource).toContain("await clearPendingUpsell(user.id, product).catch(() => {})");
    expect(apiSource).toContain("code: \"STRIPE_CHECKOUT_FAILED\"");
  });
  test("db.ts exports clearPendingUpsell and deletes only pending rows", () => {
    const dbSource = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
    const start = dbSource.indexOf("export async function clearPendingUpsell(");
    expect(start).toBeGreaterThan(-1);
    const clearFn = dbSource.slice(start, dbSource.indexOf("\n}\n", start) + 3);
    expect(clearFn).toContain("DELETE FROM paid_upsell_entitlements");
    expect(clearFn).toContain("status = 'pending'");
    expect(clearFn).not.toContain("granted");
  });
  test("EVENTS registry has the upsell checkout failure event", () => {
    expect(EVENTS.STRIPE_UPSELL_CHECKOUT_FAILED).toBe("stripe.upsell_checkout.failed");
    expect(EVENTS.PREMIUM_CHECKOUT_FAILED).toBe("premium_checkout.failed");
  });
});
