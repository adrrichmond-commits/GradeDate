import { describe, expect, test } from "bun:test";
import {
  aggregateGradingMethod,
  fallbackGrade,
  FALLBACK_FEEDBACK,
} from "./grading-method";

describe("aggregateGradingMethod", () => {
  test("all photos AI-graded reports ai", () => {
    expect(aggregateGradingMethod(5, 5)).toBe("ai");
    expect(aggregateGradingMethod(1, 1)).toBe("ai");
  });

  test("no photos AI-graded reports mock", () => {
    expect(aggregateGradingMethod(0, 5)).toBe("mock");
    expect(aggregateGradingMethod(0, 1)).toBe("mock");
  });

  test("some photos fall back reports mixed", () => {
    expect(aggregateGradingMethod(4, 5)).toBe("mixed");
    expect(aggregateGradingMethod(1, 3)).toBe("mixed");
  });

  test("empty input reports mock", () => {
    expect(aggregateGradingMethod(0, 0)).toBe("mock");
  });
});

describe("FALLBACK_FEEDBACK", () => {
  test("says the grade is simulated and that AI was unavailable", () => {
    expect(FALLBACK_FEEDBACK.toLowerCase()).toContain("simulated");
    expect(FALLBACK_FEEDBACK.toLowerCase()).toContain("unavailable");
  });

  test("does not claim the photo was analyzed", () => {
    const lower = FALLBACK_FEEDBACK.toLowerCase();
    for (const cue of ["lighting", "angle", "crop", "smile", "photo quality"]) {
      expect(lower).not.toContain(cue);
    }
  });
});

describe("fallbackGrade", () => {
  test("stays within the 3-8 fallback range and is an integer", () => {
    for (let i = 0; i < 500; i++) {
      const g = fallbackGrade();
      expect(Number.isInteger(g)).toBe(true);
      expect(g).toBeGreaterThanOrEqual(3);
      expect(g).toBeLessThanOrEqual(8);
    }
  });
});
