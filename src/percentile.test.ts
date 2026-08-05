import { describe, expect, test } from "bun:test";
import { computePercentile, topPercentLabel } from "./percentile";

describe("computePercentile", () => {
  test("0 of N users at-or-below -> 0", () => {
    expect(computePercentile(0, 10)).toBe(0);
    expect(computePercentile(0, 25)).toBe(0);
  });

  test("all users at-or-below -> 100", () => {
    expect(computePercentile(10, 10)).toBe(100);
    expect(computePercentile(25, 25)).toBe(100);
  });

  test("half -> 50", () => {
    expect(computePercentile(5, 10)).toBe(50);
    expect(computePercentile(3, 6)).toBe(50);
  });

  test("rounds to one decimal place", () => {
    expect(computePercentile(1, 3)).toBe(33.3);
    expect(computePercentile(2, 3)).toBe(66.7);
    expect(computePercentile(1, 6)).toBe(16.7);
    expect(computePercentile(2, 7)).toBe(28.6);
  });

  test("total of 0 never divides by zero", () => {
    expect(computePercentile(0, 0)).toBe(0);
  });

  test("clamps inputs into the 0-100 range", () => {
    expect(computePercentile(-1, 10)).toBe(0);
    expect(computePercentile(11, 10)).toBe(100);
    expect(computePercentile(999, 10)).toBe(100);
  });

  test("result is always within [0, 100]", () => {
    for (const total of [1, 3, 10, 42]) {
      for (let atOrBelow = 0; atOrBelow <= total * 2; atOrBelow++) {
        const p = computePercentile(atOrBelow, total);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe("topPercentLabel", () => {
  test("higher percentile -> lower Top N%", () => {
    expect(topPercentLabel(80)).toBe("Top 20%");
    expect(topPercentLabel(50)).toBe("Top 50%");
    expect(topPercentLabel(0)).toBe("Top 100%");
    expect(topPercentLabel(100)).toBe("Top 0%");
  });

  test("rounds the complement like the API labels", () => {
    expect(topPercentLabel(72.4)).toBe("Top 28%"); // 100 - 72.4 = 27.6 -> 28
    expect(topPercentLabel(82.5)).toBe("Top 18%"); // 17.5 -> 18
    expect(topPercentLabel(99.9)).toBe("Top 0%"); // 0.1 -> 0
  });
});
