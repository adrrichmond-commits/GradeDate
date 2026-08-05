import { describe, expect, test } from "bun:test";
import { leagueRangeScore, normalizeLeagueValue } from "./mutual-league";

describe("mutual league value normalization", () => {
  test("compares percentile values directly on the 0-100 scale", () => {
    expect(normalizeLeagueValue({ percentile: 72, grade: 8 })).toBe(72);
    expect(leagueRangeScore({ percentile: 72 }, { percentile: 76 })).toBe(40);
    expect(leagueRangeScore({ percentile: 72 }, { percentile: 78 })).toBe(0);
  });

  test("converts grade values to their percentage equivalent", () => {
    expect(normalizeLeagueValue({ grade: 8 })).toBe(80);
    expect(leagueRangeScore({ grade: 8 }, { grade: 9 })).toBe(40);
    expect(leagueRangeScore({ grade: 8 }, { grade: 7 })).toBe(40);
  });

  test("uses one scale for mixed percentile and grade values", () => {
    expect(leagueRangeScore({ percentile: 80 }, { grade: 8 })).toBe(40);
    expect(leagueRangeScore({ percentile: 65 }, { grade: 8 })).toBe(0);
  });

  test("clamps out-of-range finite values to the canonical bounds", () => {
    expect(normalizeLeagueValue({ percentile: -5 })).toBe(0);
    expect(normalizeLeagueValue({ percentile: 120 })).toBe(100);
    expect(normalizeLeagueValue({ grade: -2 })).toBe(10);
    expect(normalizeLeagueValue({ grade: 12 })).toBe(100);
  });

  test("returns no range score when both ranking values are missing", () => {
    expect(normalizeLeagueValue({})).toBeNull();
    expect(leagueRangeScore({}, { grade: 8 })).toBe(0);
    expect(leagueRangeScore({ percentile: null }, { percentile: null })).toBe(0);
  });

  test("prefers percentile when both values are present", () => {
    expect(normalizeLeagueValue({ percentile: 30, grade: 9 })).toBe(30);
  });
});
