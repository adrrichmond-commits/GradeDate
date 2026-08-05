import { describe, expect, test } from "bun:test";
import { parseStoreReturnState, parseSubscriptionReturnState } from "./checkout-return";

describe("parseStoreReturnState", () => {
  test("no matching params yields none", () => {
    expect(parseStoreReturnState("")).toEqual({ kind: "none" });
    expect(parseStoreReturnState("?product=re-grade")).toEqual({ kind: "none" });
    expect(parseStoreReturnState(new URLSearchParams())).toEqual({ kind: "none" });
  });

  test("founders success and canceled return states", () => {
    expect(parseStoreReturnState("?founders=success&session_id=cs_123")).toEqual({
      kind: "founders-success",
      sessionId: "cs_123",
    });
    expect(parseStoreReturnState("?founders=success")).toEqual({ kind: "founders-success", sessionId: null });
    expect(parseStoreReturnState("?founders=canceled")).toEqual({ kind: "founders-cancelled" });
  });

  test("upsell success with session+product activates (server-verified)", () => {
    expect(parseStoreReturnState("?payment=success&product=boost&session_id=cs_abc")).toEqual({
      kind: "activate",
      productId: "boost",
      sessionId: "cs_abc",
    });
  });

  test("upsell success without a verifiable session falls back to the generic banner", () => {
    expect(parseStoreReturnState("?payment=success")).toEqual({
      kind: "payment-success",
      productId: null,
      sessionId: null,
    });
    expect(parseStoreReturnState("?payment=success&product=boost")).toEqual({
      kind: "payment-success",
      productId: "boost",
      sessionId: null,
    });
  });

  test("upsell cancel returns payment-cancelled", () => {
    expect(parseStoreReturnState("?payment=cancelled")).toEqual({ kind: "payment-cancelled" });
  });

  test("founders params win over generic payment params", () => {
    expect(parseStoreReturnState("?founders=success&payment=cancelled&session_id=cs_9")).toEqual({
      kind: "founders-success",
      sessionId: "cs_9",
    });
  });
});

describe("parseSubscriptionReturnState", () => {
  test("success and canceled flags are strict", () => {
    expect(parseSubscriptionReturnState("?success=true")).toEqual({
      success: true,
      canceled: false,
      sessionId: null,
    });
    expect(parseSubscriptionReturnState("?canceled=true")).toEqual({
      success: false,
      canceled: true,
      sessionId: null,
    });
    expect(parseSubscriptionReturnState("?success=false")).toEqual({
      success: false,
      canceled: false,
      sessionId: null,
    });
    expect(parseSubscriptionReturnState("?success=1")).toEqual({
      success: false,
      canceled: false,
      sessionId: null,
    });
  });

  test("session_id is preserved when present", () => {
    expect(parseSubscriptionReturnState("?success=true&session_id=cs_xyz")).toEqual({
      success: true,
      canceled: false,
      sessionId: "cs_xyz",
    });
  });

  test("URLSearchParams input works the same as strings", () => {
    const params = new URLSearchParams("?success=true&canceled=true");
    expect(parseSubscriptionReturnState(params).success).toBe(true);
    expect(parseSubscriptionReturnState(params).canceled).toBe(true);
  });
});
