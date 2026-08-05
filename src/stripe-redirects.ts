/**
 * Stripe Checkout redirect helpers.
 *
 * Every Checkout Session `success_url` / `cancel_url` is built from the origin
 * of the incoming request instead of a hardcoded domain, so the same code works
 * on localhost, preview deployments, and the production domain. URLs always
 * point at existing app routes that already render return-state UI:
 *
 *   - subscription  -> /subscribe?success=true / /subscribe?canceled=true
 *   - store upsells -> /store?payment=success&product=… / /store?payment=cancelled
 *   - founders club -> /store?founders=success / /store?founders=canceled
 *
 * These URLs are a UX convenience only. Returning to the app never grants
 * entitlements: fulfillment happens server-side from the Stripe webhook
 * (`checkout.session.completed`), and the client verifies by refetching the
 * user and/or activating the session through the API.
 */

export interface CheckoutUrls {
  success_url: string;
  cancel_url: string;
}

/** Origin of the request the checkout was created from (never a hardcoded host). */
export function requestOrigin(reqUrl: string): string {
  return new URL(reqUrl).origin;
}

/** /subscribe renders ?success=true and ?canceled=true banners. */
export function subscriptionCheckoutUrls(reqUrl: string): CheckoutUrls {
  const origin = requestOrigin(reqUrl);
  return {
    success_url: `${origin}/subscribe?success=true&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/subscribe?canceled=true`,
  };
}

/** /store renders the return state for one-time power-up purchases. */
export function storeUpsellCheckoutUrls(reqUrl: string, product: string): CheckoutUrls {
  const origin = requestOrigin(reqUrl);
  return {
    success_url: `${origin}/store?payment=success&product=${encodeURIComponent(product)}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/store?payment=cancelled`,
  };
}

/**
 * Founders Club is a one-time purchase fulfilled by the Stripe webhook
 * (metadata product === "founders_club"). /store renders ?founders=success and
 * ?founders=canceled return states.
 */
export function foundersCheckoutUrls(reqUrl: string): CheckoutUrls {
  const origin = requestOrigin(reqUrl);
  return {
    success_url: `${origin}/store?founders=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/store?founders=canceled`,
  };
}
