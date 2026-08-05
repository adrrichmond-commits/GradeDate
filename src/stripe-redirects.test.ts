import { describe, expect, test } from "bun:test";
import {
  foundersCheckoutUrls,
  requestOrigin,
  storeUpsellCheckoutUrls,
  subscriptionCheckoutUrls,
} from "./stripe-redirects";

describe("stripe redirect URL construction", () => {
  test("requestOrigin never returns a hardcoded host — it follows the request URL", () => {
    expect(requestOrigin("https://gradedate.app/api/subscription/create-checkout")).toBe("https://gradedate.app");
    expect(requestOrigin("http://localhost:3000/api/subscription/create-checkout")).toBe("http://localhost:3000");
    expect(requestOrigin("https://gradedate-preview-123.vercel.app/api/founders/checkout")).toBe(
      "https://gradedate-preview-123.vercel.app",
    );
  });

  test("subscription checkout points at the existing /subscribe route with success/canceled state", () => {
    const urls = subscriptionCheckoutUrls("https://gradedate.app/api/subscription/create-checkout");
    expect(urls.success_url).toBe(
      "https://gradedate.app/subscribe?success=true&session_id={CHECKOUT_SESSION_ID}",
    );
    expect(urls.cancel_url).toBe("https://gradedate.app/subscribe?canceled=true");
  });

  test("subscription checkout uses the current origin (localhost works for local testing)", () => {
    const urls = subscriptionCheckoutUrls("http://localhost:3000/api/subscription/create-checkout");
    expect(urls.success_url).toStartWith("http://localhost:3000/subscribe?success=true");
    expect(urls.cancel_url).toStartWith("http://localhost:3000/subscribe?canceled=true");
  });

  test("upsell checkout points at /store with payment state and an encoded product", () => {
    const urls = storeUpsellCheckoutUrls("https://gradedate.app/api/store/create-checkout", "re-grade");
    expect(urls.success_url).toBe(
      "https://gradedate.app/store?payment=success&product=re-grade&session_id={CHECKOUT_SESSION_ID}",
    );
    expect(urls.cancel_url).toBe("https://gradedate.app/store?payment=cancelled");
    // products with reserved characters must be URL-encoded
    const encoded = storeUpsellCheckoutUrls("https://gradedate.app/api/store/create-checkout", "a b&c").success_url;
    expect(encoded).toContain("product=a%20b%26c");
  });

  test("founders checkout points at /store with founders success/canceled state", () => {
    const urls = foundersCheckoutUrls("https://gradedate.app/api/founders/checkout");
    expect(urls.success_url).toBe("https://gradedate.app/store?founders=success&session_id={CHECKOUT_SESSION_ID}");
    expect(urls.cancel_url).toBe("https://gradedate.app/store?founders=canceled");
  });

  test("no checkout URL falls back to a hardcoded /subscribe/success path", () => {
    for (const urls of [
      subscriptionCheckoutUrls("https://gradedate.app/api/subscription/create-checkout"),
      storeUpsellCheckoutUrls("https://gradedate.app/api/store/create-checkout", "boost"),
      foundersCheckoutUrls("https://gradedate.app/api/founders/checkout"),
    ]) {
      expect(urls.success_url).not.toContain("/subscribe/success");
      expect(urls.success_url).toContain("{CHECKOUT_SESSION_ID}");
      expect(new URL(urls.success_url).origin).toBe("https://gradedate.app");
      expect(new URL(urls.cancel_url).origin).toBe("https://gradedate.app");
    }
  });
});
