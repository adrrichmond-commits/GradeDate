import { describe, expect, test } from "bun:test";
import { isGradeCardOwner } from "./grade-card-access";

describe("grade card access", () => {
  test("allows an authenticated user to request their own card", () => {
    expect(isGradeCardOwner(42, 42)).toBe(true);
  });

  test("rejects a different user, invalid IDs, and missing identity", () => {
    expect(isGradeCardOwner(42, 43)).toBe(false);
    expect(isGradeCardOwner(0, 0)).toBe(false);
    expect(isGradeCardOwner(Number.NaN, 42)).toBe(false);
    expect(isGradeCardOwner(42, Number.NaN)).toBe(false);
  });
});
