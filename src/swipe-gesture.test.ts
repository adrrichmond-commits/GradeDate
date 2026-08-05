import { describe, expect, test } from "bun:test";
import {
  computeSwipeFrame,
  getSwipeDecision,
  resolveSwipeAction,
  swipeThreshold,
  SWIPE_MAX_FADE,
  SWIPE_MAX_ROTATION_DEG,
  SWIPE_MIN_THRESHOLD_PX,
} from "./swipe-gesture";

describe("swipeThreshold", () => {
  test("scales with card width", () => {
    expect(swipeThreshold(400)).toBe(100);
    expect(swipeThreshold(600)).toBe(150);
  });
  test("never drops below the minimum usable distance", () => {
    expect(swipeThreshold(200)).toBe(SWIPE_MIN_THRESHOLD_PX);
    expect(swipeThreshold(0)).toBe(SWIPE_MIN_THRESHOLD_PX);
  });
});

describe("computeSwipeFrame", () => {
  test("mirrors horizontal movement exactly", () => {
    const frame = computeSwipeFrame(120, 0, 100);
    expect(frame.x).toBe(120);
  });
  test("damps vertical movement", () => {
    const frame = computeSwipeFrame(0, 100, 100);
    expect(frame.y).toBe(35); // 100 * 0.35
  });
  test("caps vertical drift on extreme diagonal drags", () => {
    const frame = computeSwipeFrame(300, 5000, 100);
    expect(frame.y).toBeLessThanOrEqual(42); // 120 * 0.35
  });
  test("rotates toward the drag direction", () => {
    expect(computeSwipeFrame(100, 0, 100).rotation).toBeGreaterThan(0);
    expect(computeSwipeFrame(-100, 0, 100).rotation).toBeLessThan(0);
    expect(computeSwipeFrame(0, 100, 100).rotation).toBe(0);
  });
  test("caps rotation for huge drags", () => {
    expect(computeSwipeFrame(5000, 0, 100).rotation).toBe(SWIPE_MAX_ROTATION_DEG);
    expect(computeSwipeFrame(-5000, 0, 100).rotation).toBe(-SWIPE_MAX_ROTATION_DEG);
  });
  test("reports direction only beyond the threshold", () => {
    expect(computeSwipeFrame(99, 0, 100).direction).toBeNull();
    expect(computeSwipeFrame(100, 0, 100).direction).toBe("like");
    expect(computeSwipeFrame(-100, 0, 100).direction).toBe("pass");
  });
  test("stays fully opaque below the threshold and fades beyond it", () => {
    expect(computeSwipeFrame(50, 0, 100).opacity).toBe(1);
    const beyond = computeSwipeFrame(200, 0, 100).opacity;
    expect(beyond).toBeLessThan(1);
    expect(beyond).toBeGreaterThanOrEqual(1 - SWIPE_MAX_FADE);
  });
});

describe("getSwipeDecision", () => {
  test("cancels below the threshold without a fling", () => {
    expect(getSwipeDecision(50, 100, 0.1)).toBe("cancel");
    expect(getSwipeDecision(-50, 100, 0.1)).toBe("cancel");
  });
  test("likes past the threshold to the right", () => {
    expect(getSwipeDecision(150, 100, 0.1)).toBe("like");
  });
  test("passes past the threshold to the left", () => {
    expect(getSwipeDecision(-150, 100, 0.1)).toBe("pass");
  });
  test("commits a fast fling even below the threshold", () => {
    expect(getSwipeDecision(40, 100, 0.9)).toBe("like");
    expect(getSwipeDecision(-40, 100, 0.9)).toBe("pass");
  });
  test("ignores fast taps that barely moved", () => {
    expect(getSwipeDecision(10, 100, 0.9)).toBe("cancel");
    expect(getSwipeDecision(0, 100, 0.9)).toBe("cancel");
  });
});

describe("resolveSwipeAction", () => {
  test("blocks every action while a previous action is pending", () => {
    expect(resolveSwipeAction({ dx: 300, threshold: 100, velocityX: 0, canAct: false })).toBe(
      "blocked",
    );
    expect(resolveSwipeAction({ dx: 0, threshold: 100, velocityX: 0, canAct: false })).toBe(
      "blocked",
    );
  });
  test("delegates to the decision when actions are allowed", () => {
    expect(resolveSwipeAction({ dx: 200, threshold: 100, velocityX: 0, canAct: true })).toBe("like");
    expect(resolveSwipeAction({ dx: -200, threshold: 100, velocityX: 0, canAct: true })).toBe("pass");
    expect(resolveSwipeAction({ dx: 20, threshold: 100, velocityX: 0.1, canAct: true })).toBe(
      "cancel",
    );
  });
});
