import { describe, expect, test } from "bun:test";
import { classifyAuthResponse } from "./auth-context";

describe("auth response classification", () => {
  test("accepts authenticated and anonymous responses", () => {
    expect(classifyAuthResponse(200, { user: { id: 1 } })).toBe("authenticated");
    expect(classifyAuthResponse(401, null)).toBe("anonymous");
    expect(classifyAuthResponse(200, { user: null })).toBe("anonymous");
  });
  test("keeps outages and malformed responses recoverable", () => {
    expect(classifyAuthResponse(500, null)).toBe("error");
    expect(classifyAuthResponse(200, {})).toBe("error");
    expect(classifyAuthResponse(200, { user: "bad" })).toBe("error");
  });
});
