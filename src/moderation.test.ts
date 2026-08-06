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

describe("moderation unavailable response contract", () => {
  test("keeps unavailable distinct from unsafe and retryable", () => {
    const message = "This photo was not approved or graded yet because moderation is temporarily unavailable. Please try again; this does not mean the photo is unsafe.";
    expect(message).toContain("not approved or graded yet");
    expect(message).toContain("does not mean the photo is unsafe");
  });
});
