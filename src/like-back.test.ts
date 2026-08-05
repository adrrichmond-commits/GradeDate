import { describe, expect, test } from "bun:test";
import { resolveLikeBackResult } from "./like-back";

describe("like back result", () => {
  test("recognizes a mutual match", () => {
    expect(resolveLikeBackResult(true, { matched: true, match_id: 42 })).toEqual({ kind: "matched", matchId: 42 });
  });
  test("recognizes a successful non-mutual like", () => {
    expect(resolveLikeBackResult(true, { matched: false })).toEqual({ kind: "liked" });
  });
  test("provides server error and fallback", () => {
    expect(resolveLikeBackResult(false, { error: "Daily limit" })).toEqual({ kind: "error", message: "Daily limit" });
    expect(resolveLikeBackResult(false, null).kind).toBe("error");
  });
});
