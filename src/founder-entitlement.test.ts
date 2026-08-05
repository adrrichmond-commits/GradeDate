import { describe, expect, test } from "bun:test";
import { CANONICAL_PREMIUM_PRICE_ID, hasCanonicalFounderPriceLock } from "./db";

describe("Founder lifetime monthly price lock", () => {
  const base = { is_founder: true, founder_number: 1, founder_price_lock_price_id: CANONICAL_PREMIUM_PRICE_ID } as const;
  test("requires a numbered founder and the canonical $5.99 price ID", () => {
    expect(hasCanonicalFounderPriceLock(base)).toBe(true);
    expect(hasCanonicalFounderPriceLock({ ...base, founder_number: null })).toBe(false);
    expect(hasCanonicalFounderPriceLock({ ...base, founder_price_lock_price_id: "price_other" })).toBe(false);
  });
  test("never treats an unnumbered/is_founder-only user as a Founder entitlement", () => {
    expect(hasCanonicalFounderPriceLock({ ...base, is_founder: false })).toBe(false);
    expect(hasCanonicalFounderPriceLock({ ...base, founder_number: 1001 })).toBe(false);
  });
});
