import { describe, expect, test } from "bun:test";
import {
  isCheckoutBlocked,
  nextSubscriptionConfirmationState,
  SUBSCRIPTION_CONFIRMATION_TIMEOUT_MS,
} from "./subscription-confirmation";

describe("subscription checkout confirmation", () => {
  test("pending becomes confirmed after webhook fulfillment", () => {
    expect(nextSubscriptionConfirmationState("processing", 2_000)).toBe("pending");
    expect(nextSubscriptionConfirmationState("active", 2_000)).toBe("confirmed");
  });
  test("timeout can be retried without claiming success", () => {
    expect(nextSubscriptionConfirmationState("processing", SUBSCRIPTION_CONFIRMATION_TIMEOUT_MS)).toBe("timeout");
    expect(nextSubscriptionConfirmationState("inactive", SUBSCRIPTION_CONFIRMATION_TIMEOUT_MS)).toBe("timeout");
  });
  test("paid and processing subscriptions block duplicate checkout", () => {
    expect(isCheckoutBlocked("active")).toBe(true);
    expect(isCheckoutBlocked("processing")).toBe(true);
    expect(isCheckoutBlocked("inactive")).toBe(false);
  });
  test("webhook delay remains pending until fulfillment", () => {
    expect(nextSubscriptionConfirmationState("processing", 10_000)).toBe("pending");
    expect(nextSubscriptionConfirmationState("active", 10_000)).toBe("confirmed");
  });
});
