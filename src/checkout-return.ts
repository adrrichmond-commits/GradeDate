/**
 * Query-state parsers for Stripe Checkout return URLs.
 *
 * The return pages (/subscribe, /store) read their success/cancel state from
 * the query string Stripe redirects to. These pure parsers define the canonical
 * interpretation so the UI and the unit tests agree on the same behavior.
 *
 * Parsers deliberately only describe what the client *knows* from the return
 * URL — that the user was sent back by Stripe. They never claim payment
 * succeeded: entitlements are granted server-side by the webhook.
 */

export type StoreReturnState =
  | { kind: "activate"; productId: string; sessionId: string }
  | { kind: "payment-success"; productId: string | null; sessionId: string | null }
  | { kind: "payment-cancelled" }
  | { kind: "founders-success"; sessionId: string | null }
  | { kind: "founders-cancelled" }
  | { kind: "none" };

/** Parse the /store return query from a Stripe Checkout redirect. */
export function parseStoreReturnState(search: string | URLSearchParams): StoreReturnState {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const sessionId = params.get("session_id");
  const productId = params.get("product");
  if (params.get("founders") === "success") return { kind: "founders-success", sessionId };
  if (params.get("founders") === "canceled") return { kind: "founders-cancelled" };
  // Activation takes priority over the generic success banner: when a session
  // id + product are present the client can ask the server to verify the
  // payment (idempotent; the webhook is the source of truth).
  if (sessionId && productId) return { kind: "activate", productId, sessionId };
  if (params.get("payment") === "success") return { kind: "payment-success", productId, sessionId };
  if (params.get("payment") === "cancelled") return { kind: "payment-cancelled" };
  return { kind: "none" };
}

export interface SubscriptionReturnState {
  success: boolean;
  canceled: boolean;
  sessionId: string | null;
}

/** Parse the /subscribe return query from a Stripe Checkout redirect. */
export function parseSubscriptionReturnState(search: string | URLSearchParams): SubscriptionReturnState {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  return {
    success: params.get("success") === "true",
    canceled: params.get("canceled") === "true",
    sessionId: params.get("session_id"),
  };
}
