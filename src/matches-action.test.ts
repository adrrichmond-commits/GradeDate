import { describe, expect, test } from "bun:test";
import { getMatchActionError, matchActionFailureMessage } from "./matches-action";

describe("match action error handling", () => {
  test("accepts successful responses", () => {
    expect(getMatchActionError(true, {}, "like")).toBeNull();
  });

  test("returns the daily limit sentinel for the likes overlay", () => {
    expect(getMatchActionError(false, { code: "DAILY_LIMIT" }, "like")).toBe("DAILY_LIMIT");
  });
  test("returns the suspension sentinel so the page can surface the appeal path", () => {
    // 423 ACCOUNT_SUSPENDED must not fall through to the raw server error
    // string — the matches page turns the sentinel into the /appeal banner (M1).
    expect(getMatchActionError(false, { code: "ACCOUNT_SUSPENDED", error: "Account suspended" }, "like")).toBe("ACCOUNT_SUSPENDED");
    expect(getMatchActionError(false, { code: "ACCOUNT_SUSPENDED" }, "pass")).toBe("ACCOUNT_SUSPENDED");
  });

  test("uses server errors when available", () => {
    expect(getMatchActionError(false, { error: "Request rejected" }, "pass")).toBe("Request rejected");
  });

  test("provides a retryable fallback for malformed failures", () => {
    expect(getMatchActionError(false, null, "like")).toBe(matchActionFailureMessage("like"));
    expect(getMatchActionError(false, {}, "pass")).toContain("pass on");
  });
});
