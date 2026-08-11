import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { EVENTS } from "./observability";

/**
 * Founder-state release on cancellation contract:
 * - A `customer.subscription.deleted` webhook must set the subscription
 *   inactive AND release the user's founder claim (is_founder flag,
 *   founder_number, price lock, founding_member badge) so the 1,000-spot
 *   Founders Club cap stays honest.
 * - The release must be idempotent (Stripe retries deliver the same event
 *   again) and unrelated event types must stay ignored.
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
const statusCalls: Array<[number, string]> = [];
const founderReleases: number[] = [];
let nextEvent: Record<string, unknown> = {
  id: "evt_sub_deleted",
  type: "customer.subscription.deleted",
  data: { object: { id: "sub_1", customer: "cus_founder" } },
};

function makeDbMock(): Record<string, unknown> {
  const mock: Record<string, unknown> = {};
  for (const name of DB_IMPORT_NAMES) mock[name] = async () => undefined;
  return {
    ...mock,
    getUserByStripeCustomerId: async (customerId: string) =>
      customerId === "cus_founder"
        ? { id: 7, email: "founder@gradedate.test", subscription_status: "active" }
        : null,
    updateSubscriptionStatus: async (id: number, status: string) => {
      statusCalls.push([id, status]);
    },
    revokeFounderState: async (id: number) => {
      founderReleases.push(id);
    },
  };
}

mock.module("../src/db.ts", () => makeDbMock());

mock.module("stripe", () => ({
  default: class FakeStripe {
    constructor(key: string) {
      if (!key) throw new Error("FakeStripe requires a secret key");
    }
    webhooks = {
      constructEvent: () => nextEvent,
    };
  },
}));

const ORIGINAL_STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
const ORIGINAL_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

let handleApiRoute: (req: Request) => Promise<Response | null>;

function webhookRequest(body: unknown): Request {
  return new Request("https://gradedate.test/api/webhooks/stripe", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": "t=1750000000,v1=fakesignature",
    },
    body: JSON.stringify(body),
  });
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

function deletedEvent(customer: string | null): Record<string, unknown> {
  const object: Record<string, unknown> = { id: "sub_1", status: "canceled" };
  if (customer !== null) object.customer = customer;
  return { id: "evt_sub_deleted", type: "customer.subscription.deleted", data: { object } };
}

describe("customer.subscription.deleted webhook", () => {
  test("sets status inactive and releases founder state for a known customer", async () => {
    statusCalls.length = 0;
    founderReleases.length = 0;
    nextEvent = deletedEvent("cus_founder");
    const res = await handleApiRoute(webhookRequest({}));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    expect(await res!.json()).toEqual({ received: true });
    expect(statusCalls).toEqual([[7, "inactive"]]);
    expect(founderReleases).toEqual([7]);
  });

  test("is idempotent across a second delivery (Stripe retries the event)", async () => {
    statusCalls.length = 0;
    founderReleases.length = 0;
    nextEvent = deletedEvent("cus_founder");
    const first = await handleApiRoute(webhookRequest({}));
    const second = await handleApiRoute(webhookRequest({}));
    expect(first!.status).toBe(200);
    expect(second!.status).toBe(200);
    expect(await second!.json()).toEqual({ received: true });
    expect(statusCalls).toEqual([[7, "inactive"], [7, "inactive"]]);
    expect(founderReleases).toEqual([7, 7]);
  });

  test("unrelated event types are still ignored", async () => {
    statusCalls.length = 0;
    founderReleases.length = 0;
    nextEvent = { id: "evt_charge", type: "charge.succeeded", data: { object: { id: "ch_1" } } };
    const res = await handleApiRoute(webhookRequest({}));
    expect(res!.status).toBe(200);
    expect(await res!.json()).toEqual({ received: true });
    expect(statusCalls).toEqual([]);
    expect(founderReleases).toEqual([]);
  });

  test("an unknown customer id is ignored without side effects", async () => {
    statusCalls.length = 0;
    founderReleases.length = 0;
    nextEvent = deletedEvent("cus_stranger");
    const res = await handleApiRoute(webhookRequest({}));
    expect(res!.status).toBe(200);
    expect(await res!.json()).toEqual({ received: true });
    expect(statusCalls).toEqual([]);
    expect(founderReleases).toEqual([]);
  });

  test("a subscription object without a customer is a safe no-op", async () => {
    statusCalls.length = 0;
    founderReleases.length = 0;
    nextEvent = deletedEvent(null);
    const res = await handleApiRoute(webhookRequest({}));
    expect(res!.status).toBe(200);
    expect(statusCalls).toEqual([]);
    expect(founderReleases).toEqual([]);
  });

  test("missing signature is rejected before any state change", async () => {
    statusCalls.length = 0;
    founderReleases.length = 0;
    nextEvent = deletedEvent("cus_founder");
    const res = await handleApiRoute(
      new Request("https://gradedate.test/api/webhooks/stripe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(res!.status).toBe(400);
    expect(statusCalls).toEqual([]);
    expect(founderReleases).toEqual([]);
  });
});

describe("founder release wiring (static contract)", () => {
  test("db.ts revokeFounderState resets the users columns and removes the badge", () => {
    const dbSource = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
    const start = dbSource.indexOf("export async function revokeFounderState(");
    expect(start).toBeGreaterThan(-1);
    const fn = dbSource.slice(start, dbSource.indexOf("\n}\n", start) + 3);
    expect(fn).toContain("is_founder = false");
    expect(fn).toContain("founder_number = NULL");
    expect(fn).toContain("founder_price_lock_price_id = NULL");
    expect(fn).toContain("DELETE FROM user_badges");
    expect(fn).toContain("badge_type = 'founding_member'");
    expect(fn).toContain("WHERE id = ${userId}");
  });

  test("releasing founder state restores a spot toward the 1,000 cap", () => {
    const dbSource = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
    // getFounderCount counts is_founder = true; revokeFounderState flips it false,
    // so spots remaining (1000 - count) recovers after a cancellation.
    expect(dbSource).toContain("SELECT COUNT(*)::int AS cnt FROM users WHERE is_founder = true");
    const start = dbSource.indexOf("export async function revokeFounderState(");
    expect(start).toBeGreaterThan(-1);
    const fn = dbSource.slice(start, dbSource.indexOf("\n}\n", start) + 3);
    expect(fn).toContain("is_founder = false");
    expect(fn).toContain("WHERE id = ${userId}");
  });

  test("api-handler releases founder state on deletion, right after setting inactive", () => {
    const deletedCase = apiSource.indexOf('case "customer.subscription.deleted"');
    const defaultCase = apiSource.indexOf("      default:", deletedCase);
    expect(deletedCase).toBeGreaterThan(-1);
    const inactiveIdx = apiSource.indexOf('await updateSubscriptionStatus(user.id, "inactive")', deletedCase);
    const releaseIdx = apiSource.indexOf("await revokeFounderState(user.id)", deletedCase);
    expect(inactiveIdx).toBeGreaterThan(-1);
    expect(releaseIdx).toBeGreaterThan(inactiveIdx);
    expect(releaseIdx).toBeLessThan(defaultCase);
    // new release event is logged and the original cancellation log is kept
    expect(apiSource.indexOf("logInfo(EVENTS.STRIPE_FOUNDER_RELEASED", deletedCase)).toBeGreaterThan(-1);
    expect(apiSource.indexOf("logInfo(EVENTS.STRIPE_SUBSCRIPTION_CANCELLED", deletedCase)).toBeGreaterThan(-1);
  });

  test("EVENTS registry has STRIPE_FOUNDER_RELEASED alongside the cancellation event", () => {
    expect(EVENTS.STRIPE_FOUNDER_RELEASED).toBe("stripe.founder.released");
    expect(EVENTS.STRIPE_SUBSCRIPTION_CANCELLED).toBe("stripe.subscription_cancelled");
  });
});
