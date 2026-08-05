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

describe("result source retention", () => {
  test("keeps each result card tied to its own durable source", () => {
    const results = [
      { dataUrl: "data:image/jpeg;base64,ONE", previewUrl: "blob:one", photo_path: "/uploads/one" },
      { dataUrl: "data:image/jpeg;base64,TWO", previewUrl: "blob:two", photo_path: "/uploads/two" },
    ];
    expect(results.map((result) =>
      resolveGradePhotoSrc(result.dataUrl, result.previewUrl, result.photo_path)
    )).toEqual(["data:image/jpeg;base64,ONE", "data:image/jpeg;base64,TWO"]);
  });

  test("does not replace a durable result source when the preview state is stale", () => {
    expect(resolveGradePhotoSrc("data:image/png;base64,RESULT", "", "/uploads/deleted")).toBe(
      "data:image/png;base64,RESULT"
    );
  });
});
