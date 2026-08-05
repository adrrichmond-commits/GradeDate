/** Pure policy helpers kept separate so canonical pricing/entitlement rules are testable without a database. */
export const PREMIUM_PRICE_ID = "price_1TvzqyGuEElH7kaiCi3hjt8b";
export const PREMIUM_MONTHLY_PRICE = 5.99;
export const FOUNDER_CAP = 1000;
export const BOOST_DURATION_DAYS = 7;

export function isReferralRewardActive(expiresAt: Date | string | null, now = new Date()): boolean {
  return expiresAt === null || new Date(expiresAt).getTime() > now.getTime();
}

export function founderPriceLockApplies(isFounder: boolean, founderNumber: number | null, lockedPriceId: string | null): boolean {
  return isFounder && founderNumber !== null && founderNumber >= 1 && founderNumber <= FOUNDER_CAP && lockedPriceId === PREMIUM_PRICE_ID;
}
