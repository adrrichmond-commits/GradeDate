import { describe, expect, test } from "bun:test";
import { getSignupDays } from "./signup-date";

describe("signup date day options", () => {
  test("returns an array before month/year selection", () => {
    expect(getSignupDays("", "")).toEqual(Array.from({ length: 31 }, (_, i) => i + 1));
  });

  test("respects the selected month's length", () => {
    expect(getSignupDays("02", "2024")).toHaveLength(29);
    expect(getSignupDays("04", "2025")).toHaveLength(30);
  });
});
