/**
 * One-time store purchase confirmation policy (pure, unit-testable).
 *
 * Mirrors the subscription checkout confirmation pattern: returning from
 * Stripe is never treated as fulfillment. The client first asks the server to
 * verify + grant the session (`/api/store/activate`), then polls the
 * authenticated entitlement status (`/api/store/entitlement-status`) with a
 * bounded timeout until the server reports the entitlement, or the user is
 * shown an explicit timeout/error state they can retry.
 */

export type StoreConfirmationState = "idle" | "pending" | "confirmed" | "timeout" | "error";

export const STORE_CONFIRMATION_TIMEOUT_MS = 30_000;
export const STORE_CONFIRMATION_INTERVAL_MS = 2_000;
/** A pending entitlement older than this no longer blocks a new purchase
 * (abandoned Checkout sessions are treated as expired). */
export const STORE_PENDING_STALE_MS = 60 * 60 * 1000;

/** Canonical one-time store products (re-grade $0.99, boost $2.99/7 days,
 * 5 like-pack $0.99). No annual, see-who-liked-you reveal, or Founder
 * one-time products exist here. */
export const STORE_PRODUCTS = ["re-grade", "boost", "like-pack"] as const;
export type StoreProduct = (typeof STORE_PRODUCTS)[number];

export function nextStoreConfirmationState(
  entitled: boolean,
  elapsedMs: number,
): StoreConfirmationState {
  if (entitled) return "confirmed";
  if (elapsedMs >= STORE_CONFIRMATION_TIMEOUT_MS) return "timeout";
  return "pending";
}

/**
 * Duplicate-purchase policy for one-time store products.
 * - A pending purchase (payment returned, entitlement not yet granted) blocks
 *   a new checkout for every product, so a user can't pay twice while the
 *   first purchase is still being confirmed.
 * - An active re-grade credit or active boost blocks a new checkout (matches
 *   the store UI's "already owned" state and the server-side grant).
 * - Like-packs are stackable by canonical product decision ("always
 *   purchasable"), so only a *pending* like-pack purchase blocks.
 */
export function isStorePurchaseBlocked(product: string, entitled: boolean, pending: boolean): boolean {
  if (pending) return true;
  if (product === "like-pack") return false;
  return entitled;
}
