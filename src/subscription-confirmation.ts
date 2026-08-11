export type SubscriptionConfirmationState = "idle" | "pending" | "confirmed" | "timeout" | "error";
export const SUBSCRIPTION_CONFIRMATION_TIMEOUT_MS = 30_000;
export const SUBSCRIPTION_CONFIRMATION_INTERVAL_MS = 2_000;
/** A "processing" marker older than this no longer blocks a new checkout: the
 * Stripe call that set it failed without a webhook, so the user must be able
 * to retry instead of being locked out forever. */
export const PROCESSING_STALE_MS = 15 * 60 * 1000;
export function nextSubscriptionConfirmationState(
  status: string | null | undefined,
  elapsedMs: number,
): SubscriptionConfirmationState {
  if (status === "active") return "confirmed";
  if (elapsedMs >= SUBSCRIPTION_CONFIRMATION_TIMEOUT_MS) return "timeout";
  return "pending";
}

/** True when a "processing" marker is stale (older than PROCESSING_STALE_MS)
 * and therefore should no longer block a checkout retry. A missing or
 * unparseable timestamp is treated as NOT stale so we fail safe toward
 * blocking, never toward granting anything. */
export function isProcessingStale(
  updatedAt: string | Date | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!updatedAt) return false;
  const time = updatedAt instanceof Date ? updatedAt.getTime() : new Date(updatedAt).getTime();
  if (Number.isNaN(time)) return false;
  return now - time > PROCESSING_STALE_MS;
}

/** A checkout attempt is blocked while a subscription is active, or while a
 * checkout is still in flight ("processing") — unless that marker is stale
 * (see isProcessingStale), which means a previous checkout attempt crashed and
 * must be retryable. Without an updatedAt, "processing" blocks (backward
 * compatible with the pre-staleness behavior). */
export function isCheckoutBlocked(
  status: string | null | undefined,
  updatedAt?: string | Date | null,
  now: number = Date.now(),
): boolean {
  if (status === "active") return true;
  if (status === "processing") return !isProcessingStale(updatedAt, now);
  return false;
}
