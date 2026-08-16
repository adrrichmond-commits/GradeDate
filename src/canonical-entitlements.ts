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
/** Canonical display price for the one-time 7-day Profile Boost upsell ($2.99). */
export const BOOST_PRICE_DISPLAY = "$2.99";

export function isReferralRewardActive(expiresAt: Date | string | null, now = new Date()): boolean {
  return expiresAt === null || new Date(expiresAt).getTime() > now.getTime();
}

export function founderPriceLockApplies(isFounder: boolean, founderNumber: number | null, lockedPriceId: string | null): boolean {
  return isFounder && founderNumber !== null && founderNumber >= 1 && founderNumber <= FOUNDER_CAP && lockedPriceId === PREMIUM_PRICE_ID;
}

/** Length of the closed-beta Premium trial granted to cohort members at signup. */
export const BETA_TRIAL_DURATION_DAYS = 14;

/**
 * A Premium trial is active while its end timestamp is still in the future.
 * `trial_ends_at` is the single source of truth (NULL/undefined = never had a trial).
 */
export function isTrialActive(trialEndsAt: string | Date | null | undefined, now = new Date()): boolean {
  if (!trialEndsAt) return false;
  const end = new Date(trialEndsAt).getTime();
  if (Number.isNaN(end)) return false;
  return end > now.getTime();
}

/**
 * Canonical Premium entitlement: an active subscription/reward (subscription
 * status "active" and, when an expiry exists, not yet expired — real Stripe
 * subscriptions have no expiry) OR an active trial. Everything server-side
 * that gates Premium features must derive from this helper so the trial is
 * enforced in the API, not just the UI.
 */
export function hasPremiumEntitlement(
  subscriptionStatus: string,
  subscriptionExpiresAt: string | Date | null | undefined,
  trialEndsAt: string | Date | null | undefined,
  now = new Date(),
): boolean {
  const subscriptionActive =
    subscriptionStatus === "active" &&
    (!subscriptionExpiresAt || new Date(subscriptionExpiresAt).getTime() > now.getTime());
  return subscriptionActive || isTrialActive(trialEndsAt, now);
}

/**
 * Base timestamp a 1-month referral reward extends from: the later of the
 * user's current premium expiry (or now) and an in-flight trial end. A user
 * mid-trial keeps the free month *after* the trial instead of wasting it
 * inside the trial; a user with no active trial extends from now (or their
 * existing expiry, preserving current stacking behavior).
 */
export function referralRewardExtensionBase(
  subscriptionExpiresAt: string | Date | null | undefined,
  trialEndsAt: string | Date | null | undefined,
  now = new Date(),
): Date {
  const expiry = subscriptionExpiresAt ? new Date(subscriptionExpiresAt).getTime() : now.getTime();
  const trial = trialEndsAt ? new Date(trialEndsAt).getTime() : now.getTime();
  return new Date(Math.max(Number.isNaN(expiry) ? now.getTime() : expiry, Number.isNaN(trial) ? now.getTime() : trial));
}
