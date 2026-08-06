import { describe, expect, test } from "bun:test";
import { parseModerationContent } from "./moderation";
describe("moderation parser", () => {
  test("fails closed for unavailable or malformed provider output", () => {
    expect(parseModerationContent(undefined)).toBe("UNKNOWN");
    expect(parseModerationContent("SAFE-ish")).toBe("UNKNOWN");
    expect(parseModerationContent("provider error")).toBe("UNKNOWN");
  });
  test("accepts only exact SAFE or NSFW", () => {
    expect(parseModerationContent(" SAFE ")).toBe("SAFE");
    expect(parseModerationContent("nsfw")).toBe("NSFW");
  });
});
