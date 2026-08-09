import { describe, expect, test } from "bun:test";
import { BOOST_DURATION_DAYS, FOUNDER_CAP, PREMIUM_MONTHLY_PRICE, PREMIUM_PRICE_ID, founderPriceLockApplies, isReferralRewardActive } from "./canonical-entitlements";

describe("canonical pricing and entitlement policy", () => {
  test("uses the monthly $5.99 Premium offer and seven-day boost", () => {
    expect(PREMIUM_MONTHLY_PRICE).toBe(5.99);
    expect(PREMIUM_PRICE_ID).toBe("price_1TvMPLDtCG0wmyJUuL2BtfhU");
    expect(BOOST_DURATION_DAYS).toBe(7);
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
