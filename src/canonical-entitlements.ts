/** Pure policy helpers kept separate so canonical pricing/entitlement rules are testable without a database. */

/**
 * Legacy Premium monthly subscription price id ($5.99/mo). Kept as the fallback
 * so previews/tests/the sandbox behave identically when PREMIUM_PRICE_ID is
 * unset. Production must set PREMIUM_PRICE_ID to the owner's live Stripe price
 * (the legacy id cannot be resolved by the live account).
 */
const DEFAULT_PREMIUM_PRICE_ID = "price_1TvMPLDtCG0wmyJUuL2BtfhU";

/** Resolve the Premium monthly price id, preferring the PREMIUM_PRICE_ID env override. */
export function resolvePremiumPriceId(env: Record<string, string | undefined> = process.env): string {
  return env.PREMIUM_PRICE_ID || DEFAULT_PREMIUM_PRICE_ID;
}

/** Canonical Premium monthly subscription price id ($5.99/mo). Env-overridable. */
export const PREMIUM_PRICE_ID = resolvePremiumPriceId();
export const PREMIUM_MONTHLY_PRICE = 5.99;
export const FOUNDER_CAP = 1000;
export const BOOST_DURATION_DAYS = 7;

export function isReferralRewardActive(expiresAt: Date | string | null, now = new Date()): boolean {
  return expiresAt === null || new Date(expiresAt).getTime() > now.getTime();
}

export function founderPriceLockApplies(isFounder: boolean, founderNumber: number | null, lockedPriceId: string | null): boolean {
  return isFounder && founderNumber !== null && founderNumber >= 1 && founderNumber <= FOUNDER_CAP && lockedPriceId === PREMIUM_PRICE_ID;
}
