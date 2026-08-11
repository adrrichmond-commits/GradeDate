import { describe, expect, test } from "bun:test";
import {
  isCheckoutBlocked,
  isProcessingInFlight,
  isProcessingStale,
  nextSubscriptionConfirmationState,
  PROCESSING_STALE_MS,
  SUBSCRIPTION_CONFIRMATION_TIMEOUT_MS,
} from "./subscription-confirmation";

const NOW = Date.parse("2026-08-11T14:00:00.000Z");
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

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

describe("isProcessingStale", () => {
  test("a fresh processing marker is not stale", () => {
    expect(isProcessingStale(minutesAgo(1), NOW)).toBe(false);
  });
  test("a processing marker older than 15 minutes is stale", () => {
    expect(isProcessingStale(minutesAgo(16), NOW)).toBe(true);
    expect(isProcessingStale(minutesAgo(PROCESSING_STALE_MS / 60_000 + 1), NOW)).toBe(true);
  });
  test("exactly at the threshold is not yet stale (strictly greater)", () => {
    expect(isProcessingStale(minutesAgo(PROCESSING_STALE_MS / 60_000), NOW)).toBe(false);
  });
  test("missing or unparseable timestamps are never stale (fail safe toward blocking)", () => {
    expect(isProcessingStale(null, NOW)).toBe(false);
    expect(isProcessingStale(undefined, NOW)).toBe(false);
    expect(isProcessingStale("not-a-date", NOW)).toBe(false);
  });
  test("accepts Date objects", () => {
    expect(isProcessingStale(new Date(NOW - 16 * 60_000), NOW)).toBe(true);
  });
});

describe("isCheckoutBlocked with staleness", () => {
  test("fresh processing still blocks a duplicate checkout", () => {
    expect(isCheckoutBlocked("processing", minutesAgo(1), NOW)).toBe(true);
  });
  test("stale processing no longer blocks — the user can retry", () => {
    expect(isCheckoutBlocked("processing", minutesAgo(20), NOW)).toBe(false);
  });
  test("active always blocks, even with a stale timestamp", () => {
    expect(isCheckoutBlocked("active", minutesAgo(60), NOW)).toBe(true);
    expect(isCheckoutBlocked("active", null, NOW)).toBe(true);
  });
  test("none and null are unblocked", () => {
    expect(isCheckoutBlocked("none", minutesAgo(1), NOW)).toBe(false);
    expect(isCheckoutBlocked(null, null, NOW)).toBe(false);
    expect(isCheckoutBlocked(undefined, undefined, NOW)).toBe(false);
  });
  test("without an updatedAt, processing blocks (backward compatible)", () => {
    expect(isCheckoutBlocked("processing")).toBe(true);
  });
});
describe("isProcessingInFlight (client Subscribe-button gate)", () => {
  test("fresh processing shows the disabled 'processing' state", () => {
    expect(isProcessingInFlight("processing", minutesAgo(1), NOW)).toBe(true);
  });
  test("stale processing unblocks — the normal Subscribe button renders", () => {
    expect(isProcessingInFlight("processing", minutesAgo(20), NOW)).toBe(false);
  });
  test("active never shows the processing notice", () => {
    expect(isProcessingInFlight("active", minutesAgo(1), NOW)).toBe(false);
  });
  test("none and non-processing states never show the notice", () => {
    expect(isProcessingInFlight("none", minutesAgo(1), NOW)).toBe(false);
    expect(isProcessingInFlight(null, null, NOW)).toBe(false);
    expect(isProcessingInFlight(undefined, undefined, NOW)).toBe(false);
    expect(isProcessingInFlight("inactive", minutesAgo(1), NOW)).toBe(false);
  });
  test("without an updatedAt, processing stays in flight (fail safe toward blocking)", () => {
    expect(isProcessingInFlight("processing")).toBe(true);
  });
});
