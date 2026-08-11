import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { BOOST_DURATION_DAYS, FOUNDER_CAP, PREMIUM_MONTHLY_PRICE, PREMIUM_PRICE_ID, founderPriceLockApplies, isReferralRewardActive, resolvePremiumPriceId } from "./canonical-entitlements";

describe("canonical pricing and entitlement policy", () => {
  test("uses the monthly $5.99 Premium offer and seven-day boost", () => {
    expect(PREMIUM_MONTHLY_PRICE).toBe(5.99);
    expect(PREMIUM_PRICE_ID).toBe("price_1TvMPLDtCG0wmyJUuL2BtfhU");
    expect(BOOST_DURATION_DAYS).toBe(7);
  });
  test("resolves the Premium price id from PREMIUM_PRICE_ID env when set", () => {
    expect(resolvePremiumPriceId({ PREMIUM_PRICE_ID: "price_live_monthly_xyz" })).toBe("price_live_monthly_xyz");
    // Unset or empty env falls back to the legacy id (unchanged behavior).
    expect(resolvePremiumPriceId({})).toBe("price_1TvMPLDtCG0wmyJUuL2BtfhU");
    expect(resolvePremiumPriceId({ PREMIUM_PRICE_ID: "" })).toBe("price_1TvMPLDtCG0wmyJUuL2BtfhU");
  });
  test("api-handler consumes the canonical env-overridable price id (no hardcoded literal)", () => {
    // api-handler.ts is the subscription-checkout consumer; it must import the
    // canonical constant (which honors the PREMIUM_PRICE_ID env override) and
    // must not carry its own hardcoded copy of the legacy price id.
    const apiHandler = readFileSync(path.join(import.meta.dir, "api-handler.ts"), "utf8");
    expect(apiHandler).toContain('import { PREMIUM_PRICE_ID, hasPremiumEntitlement } from "./canonical-entitlements";');
    expect(apiHandler).not.toContain('const PREMIUM_PRICE_ID = "price_');
    expect(apiHandler).toContain("const priceId = PREMIUM_PRICE_ID;");
  });
  test("referral rewards expire strictly at their deadline", () => {
    const now = new Date("2026-01-08T00:00:00Z");
    expect(isReferralRewardActive("2026-01-08T00:00:01Z", now)).toBe(true);
    expect(isReferralRewardActive("2026-01-08T00:00:00Z", now)).toBe(false);
    expect(isReferralRewardActive("2026-01-07T23:59:59Z", now)).toBe(false);
    expect(isReferralRewardActive(null, now)).toBe(true);
  });
  test("only numbered first-1000 founders receive a canonical price lock", () => {
    expect(founderPriceLockApplies(true, 1, PREMIUM_PRICE_ID)).toBe(true);
    expect(founderPriceLockApplies(true, FOUNDER_CAP, PREMIUM_PRICE_ID)).toBe(true);
    expect(founderPriceLockApplies(true, FOUNDER_CAP + 1, PREMIUM_PRICE_ID)).toBe(false);
    expect(founderPriceLockApplies(true, null, PREMIUM_PRICE_ID)).toBe(false);
    expect(founderPriceLockApplies(false, 1, PREMIUM_PRICE_ID)).toBe(false);
  });
});
