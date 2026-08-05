import { describe, expect, test } from "bun:test";
import { getMatchActionError, matchActionFailureMessage } from "./matches-action";

describe("match action error handling", () => {
  test("accepts successful responses", () => {
    expect(getMatchActionError(true, {}, "like")).toBeNull();
  });

  test("returns the daily limit sentinel for the likes overlay", () => {
    expect(getMatchActionError(false, { code: "DAILY_LIMIT" }, "like")).toBe("DAILY_LIMIT");
  });

  test("uses server errors when available", () => {
    expect(getMatchActionError(false, { error: "Request rejected" }, "pass")).toBe("Request rejected");
  });

  test("provides a retryable fallback for malformed failures", () => {
    expect(getMatchActionError(false, null, "like")).toBe(matchActionFailureMessage("like"));
    expect(getMatchActionError(false, {}, "pass")).toContain("pass on");
  });
});
