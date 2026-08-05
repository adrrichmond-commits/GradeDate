import { describe, expect, test } from "bun:test";
import {
  computeGradeBands,
  compute8020Counts,
  isNonEmptyRange,
  inRangeBand,
} from "./matching";

describe("inRangeBand", () => {
  test("mid grades are ±1 around the user's grade", () => {
    expect(inRangeBand(5)).toEqual({ min: 4, max: 6 });
    expect(inRangeBand(7)).toEqual({ min: 6, max: 8 });
  });

  test("extreme grades clamp to the 1-10 scale", () => {
    expect(inRangeBand(1)).toEqual({ min: 1, max: 2 });
    expect(inRangeBand(10)).toEqual({ min: 9, max: 10 });
  });
});

describe("computeGradeBands", () => {
  test("mid grade: in-range ±1, above/below strictly outside", () => {
    const bands = computeGradeBands(5);
    expect(bands.inRange).toEqual({ min: 4, max: 6 });
    expect(bands.above).toEqual({ min: 7, max: 10 });
    expect(bands.below).toEqual({ min: 1, max: 3 });
    expect(isNonEmptyRange(bands.inRange)).toBe(true);
    expect(isNonEmptyRange(bands.above)).toBe(true);
    expect(isNonEmptyRange(bands.below)).toBe(true);
  });

  test("grade 1: below band is empty so out-of-range never duplicates in-range", () => {
    const bands = computeGradeBands(1);
    expect(bands.inRange).toEqual({ min: 1, max: 2 });
    expect(bands.above).toEqual({ min: 3, max: 10 });
    expect(bands.below).toEqual({ min: 1, max: 0 });
    expect(isNonEmptyRange(bands.below)).toBe(false);
  });

  test("grade 10: above band is empty so out-of-range never duplicates in-range", () => {
    const bands = computeGradeBands(10);
    expect(bands.inRange).toEqual({ min: 9, max: 10 });
    expect(bands.below).toEqual({ min: 1, max: 8 });
    expect(bands.above).toEqual({ min: 11, max: 10 });
    expect(isNonEmptyRange(bands.above)).toBe(false);
  });

  test("single-grade outer bands at grade 3 (below) and grade 8 (above)", () => {
    const grade3 = computeGradeBands(3);
    expect(grade3.below).toEqual({ min: 1, max: 1 });
    expect(isNonEmptyRange(grade3.below)).toBe(true);

    const grade8 = computeGradeBands(8);
    expect(grade8.above).toEqual({ min: 10, max: 10 });
    expect(isNonEmptyRange(grade8.above)).toBe(true);
  });

  test("bands are all on the grade scale and never reference invalid grades", () => {
    for (let g = 1; g <= 10; g++) {
      const { inRange, above, below } = computeGradeBands(g);
      expect(inRange.min).toBeGreaterThanOrEqual(1);
      expect(inRange.max).toBeLessThanOrEqual(10);
      expect(above.max).toBeLessThanOrEqual(10);
      expect(below.min).toBeGreaterThanOrEqual(1);
      // in-range is always queryable — the feed base never disappears
      expect(isNonEmptyRange(inRange)).toBe(true);
    }
  });

  test("bands partition the 1-10 scale with no overlap or gap", () => {
    for (let g = 1; g <= 10; g++) {
      const { inRange, above, below } = computeGradeBands(g);
      if (isNonEmptyRange(above)) expect(above.min).toBe(inRange.max + 1);
      if (isNonEmptyRange(below)) expect(below.max).toBe(inRange.min - 1);
      // out-of-range bands never overlap the in-range band
      expect(above.min).toBeGreaterThanOrEqual(inRange.max + 1);
      expect(below.max).toBeLessThanOrEqual(inRange.min - 1);
    }
  });
});

describe("compute8020Counts", () => {
  test("with in-range users: all in-range + ~10% from each side", () => {
    const counts = compute8020Counts(100, 50, 50);
    expect(counts.inRangeCount).toBe(100);
    expect(counts.aboveCount).toBe(13); // ceil(100 * 0.125)
    expect(counts.belowCount).toBe(13);
  });

  test("smaller in-range pool sizes the outside budget proportionally", () => {
    expect(compute8020Counts(8, 10, 10)).toEqual({ inRangeCount: 8, aboveCount: 1, belowCount: 1 });
    expect(compute8020Counts(4, 10, 10)).toEqual({ inRangeCount: 4, aboveCount: 1, belowCount: 1 });
  });

  test("outside pools are capped at what is available", () => {
    expect(compute8020Counts(100, 3, 0)).toEqual({ inRangeCount: 100, aboveCount: 3, belowCount: 0 });
  });

  test("fallback: empty in-range pool never empties the feed when outside users exist", () => {
    const counts = compute8020Counts(0, 5, 3);
    expect(counts.inRangeCount).toBe(0);
    expect(counts.aboveCount).toBe(5);
    expect(counts.belowCount).toBe(3);
    expect(counts.aboveCount + counts.belowCount).toBeGreaterThan(0);
  });

  test("only no graded users at all yields a fully empty feed", () => {
    expect(compute8020Counts(0, 0, 0)).toEqual({ inRangeCount: 0, aboveCount: 0, belowCount: 0 });
  });
});
