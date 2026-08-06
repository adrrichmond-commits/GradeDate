export type SubscriptionConfirmationState = "idle" | "pending" | "confirmed" | "timeout" | "error";

export const SUBSCRIPTION_CONFIRMATION_TIMEOUT_MS = 30_000;
export const SUBSCRIPTION_CONFIRMATION_INTERVAL_MS = 2_000;

export function nextSubscriptionConfirmationState(
  status: string | null | undefined,
  elapsedMs: number,
): SubscriptionConfirmationState {
  if (status === "active") return "confirmed";
  if (elapsedMs >= SUBSCRIPTION_CONFIRMATION_TIMEOUT_MS) return "timeout";
  return "pending";
}

export function isCheckoutBlocked(status: string | null | undefined): boolean {
  return status === "active" || status === "processing";
}
