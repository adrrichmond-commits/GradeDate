import { describe, expect, test } from "bun:test";
import { resolveGradePhotoSrc } from "./grade-photo-source";

describe("resolveGradePhotoSrc", () => {
  test("prefers the durable data URL over the blob preview and server path", () => {
    expect(
      resolveGradePhotoSrc(
        "data:image/png;base64,AAA",
        "blob:https://example.com/1",
        "/uploads/anon_a.png"
      )
    ).toBe("data:image/png;base64,AAA");
  });

  test("falls back to the blob preview URL when no data URL is ready yet", () => {
    expect(
      resolveGradePhotoSrc("", "blob:https://example.com/1", "/uploads/anon_a.png")
    ).toBe("blob:https://example.com/1");
    expect(
      resolveGradePhotoSrc(undefined, "blob:https://example.com/1", "/uploads/anon_a.png")
    ).toBe("blob:https://example.com/1");
  });

  test("falls back to the server photo path when no client-side source exists", () => {
    expect(resolveGradePhotoSrc("", "", "/uploads/anon_a.png")).toBe(
      "/uploads/anon_a.png"
    );
  });

  test("returns an empty string when nothing is available", () => {
    expect(resolveGradePhotoSrc("", "", "")).toBe("");
    expect(resolveGradePhotoSrc(undefined, undefined, undefined)).toBe("");
    expect(resolveGradePhotoSrc(null, null, null)).toBe("");
  });
});
