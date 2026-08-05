import { describe, expect, test } from "bun:test";
import {
  initialUnmatchState,
  unmatchReducer,
  unmatchFailureMessage,
  validateUnmatchRequest,
  type UnmatchState,
} from "./unmatch-flow";

describe("unmatch confirmation flow", () => {
  test("starts idle with no target", () => {
    expect(initialUnmatchState).toEqual({ phase: "idle", targetUserId: null, error: null });
  });

  test("REQUEST opens the confirmation dialog for the target user", () => {
    const next = unmatchReducer(initialUnmatchState, { type: "REQUEST", targetUserId: 42 });
    expect(next.phase).toBe("confirming");
    expect(next.targetUserId).toBe(42);
    expect(next.error).toBeNull();
  });

  test("CANCEL is the undo path — returns to idle before anything is deleted", () => {
    const confirming = unmatchReducer(initialUnmatchState, { type: "REQUEST", targetUserId: 42 });
    const cancelled = unmatchReducer(confirming, { type: "CANCEL" });
    expect(cancelled).toEqual(initialUnmatchState);
  });

  test("CANCEL also clears a failed state so the user can walk away", () => {
    const failed: UnmatchState = { phase: "failed", targetUserId: 7, error: "nope" };
    expect(unmatchReducer(failed, { type: "CANCEL" })).toEqual(initialUnmatchState);
  });

  test("CONFIRM moves to pending and clears stale errors", () => {
    const confirming = unmatchReducer(initialUnmatchState, { type: "REQUEST", targetUserId: 42 });
    const next = unmatchReducer(confirming, { type: "CONFIRM" });
    expect(next.phase).toBe("pending");
    expect(next.targetUserId).toBe(42);
  });

  test("CONFIRM is ignored when no confirmation was requested", () => {
    expect(unmatchReducer(initialUnmatchState, { type: "CONFIRM" })).toBe(initialUnmatchState);
    const done = unmatchReducer(
      unmatchReducer(unmatchReducer(initialUnmatchState, { type: "REQUEST", targetUserId: 1 }), { type: "CONFIRM" }),
      { type: "SUCCEEDED" },
    );
    expect(unmatchReducer(done, { type: "CONFIRM" })).toBe(done);
  });

  test("SUCCEEDED only fires from pending", () => {
    expect(unmatchReducer(initialUnmatchState, { type: "SUCCEEDED" })).toBe(initialUnmatchState);
    const done = unmatchReducer(
      unmatchReducer(unmatchReducer(initialUnmatchState, { type: "REQUEST", targetUserId: 1 }), { type: "CONFIRM" }),
      { type: "SUCCEEDED" },
    );
    expect(done.phase).toBe("done");
    expect(done.targetUserId).toBe(1);
  });

  test("FAILED surfaces the error only from pending", () => {
    expect(unmatchReducer(initialUnmatchState, { type: "FAILED", error: "boom" })).toBe(initialUnmatchState);
    const failed = unmatchReducer(
      unmatchReducer(unmatchReducer(initialUnmatchState, { type: "REQUEST", targetUserId: 1 }), { type: "CONFIRM" }),
      { type: "FAILED", error: "boom" },
    );
    expect(failed.phase).toBe("failed");
    expect(failed.error).toBe("boom");
    expect(failed.targetUserId).toBe(1);
  });

  test("a failed attempt can retry without re-requesting", () => {
    const failed: UnmatchState = { phase: "failed", targetUserId: 1, error: "boom" };
    const retry = unmatchReducer(failed, { type: "CONFIRM" });
    expect(retry.phase).toBe("pending");
    expect(retry.error).toBeNull();
  });

  test("REQUEST while pending is ignored (no double dialog, no re-entry)", () => {
    const pending = unmatchReducer(
      unmatchReducer(initialUnmatchState, { type: "REQUEST", targetUserId: 42 }),
      { type: "CONFIRM" },
    );
    expect(unmatchReducer(pending, { type: "REQUEST", targetUserId: 99 })).toBe(pending);
  });

  test("CANCEL is ignored while pending so the request runs to completion", () => {
    const pending = unmatchReducer(
      unmatchReducer(initialUnmatchState, { type: "REQUEST", targetUserId: 42 }),
      { type: "CONFIRM" },
    );
    expect(unmatchReducer(pending, { type: "CANCEL" })).toBe(pending);
  });
});

describe("unmatch API response handling", () => {
  test("accepts a successful response", () => {
    expect(unmatchFailureMessage(true, {})).toBeNull();
    expect(unmatchFailureMessage(true, null)).toBeNull();
  });

  test("surfaces server errors verbatim", () => {
    expect(unmatchFailureMessage(false, { error: "Unauthorized" })).toBe("Unauthorized");
  });

  test("falls back to a retryable message for malformed failures", () => {
    expect(unmatchFailureMessage(false, null)).toBe("We couldn't unmatch right now. Please try again.");
    expect(unmatchFailureMessage(false, {})).toBe("We couldn't unmatch right now. Please try again.");
    expect(unmatchFailureMessage(false, { error: 42 })).toBe("We couldn't unmatch right now. Please try again.");
  });
});

describe("unmatch API validation contract", () => {
  test("requires a numeric matchUserId", () => {
    expect(validateUnmatchRequest(1, undefined)).toBe("matchUserId is required");
    expect(validateUnmatchRequest(1, null)).toBe("matchUserId is required");
    expect(validateUnmatchRequest(1, "42")).toBe("matchUserId is required");
    expect(validateUnmatchRequest(1, 42)).toBeNull();
  });

  test("rejects unmatching yourself", () => {
    expect(validateUnmatchRequest(7, 7)).toBe("You cannot unmatch yourself");
    expect(validateUnmatchRequest(7, 8)).toBeNull();
  });
});
