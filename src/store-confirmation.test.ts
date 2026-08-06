import { describe, expect, test } from "bun:test";
import {
  isStorePurchaseBlocked,
  nextStoreConfirmationState,
  STORE_CONFIRMATION_TIMEOUT_MS,
  STORE_PENDING_STALE_MS,
  STORE_PRODUCTS,
} from "./store-confirmation";

describe("store purchase confirmation", () => {
  test("pending becomes confirmed only when the server reports the entitlement", () => {
    expect(nextStoreConfirmationState(false, 2_000)).toBe("pending");
    expect(nextStoreConfirmationState(true, 2_000)).toBe("confirmed");
  });
  test("bounded timeout can be retried without ever claiming success", () => {
    expect(nextStoreConfirmationState(false, STORE_CONFIRMATION_TIMEOUT_MS)).toBe("timeout");
    expect(nextStoreConfirmationState(false, STORE_CONFIRMATION_TIMEOUT_MS + 30_000)).toBe("timeout");
  });
  test("a pending purchase blocks duplicate checkout for every canonical product", () => {
    for (const product of STORE_PRODUCTS) {
      expect(isStorePurchaseBlocked(product, false, true)).toBe(true);
    }
  });
  test("active re-grades and boosts block checkout; like-packs stay stackable", () => {
    expect(isStorePurchaseBlocked("re-grade", true, false)).toBe(true);
    expect(isStorePurchaseBlocked("boost", true, false)).toBe(true);
    expect(isStorePurchaseBlocked("like-pack", true, false)).toBe(false);
  });
  test("an inactive entitlement never blocks a new purchase", () => {
    for (const product of STORE_PRODUCTS) {
      expect(isStorePurchaseBlocked(product, false, false)).toBe(false);
    }
  });
  test("abandoned pending entitlements stop blocking after the stale window", () => {
    expect(STORE_PENDING_STALE_MS).toBe(60 * 60 * 1000);
  });
});
