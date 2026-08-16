import { describe, expect, test } from "bun:test";
import { resolvePhotoSrc } from "./user-photo";

describe("resolvePhotoSrc", () => {
  test("returns the trimmed src for a normal https blob URL", () => {
    expect(
      resolvePhotoSrc("https://store.public.blob.vercel-storage.com/a.jpeg", false),
    ).toBe("https://store.public.blob.vercel-storage.com/a.jpeg");
  });

  test("returns a local /uploads path (may load locally, may 404 on serverless)", () => {
    expect(resolvePhotoSrc("/uploads/4_1785009806836_g2fn.jpeg", false)).toBe(
      "/uploads/4_1785009806836_g2fn.jpeg",
    );
  });

  test("returns null for null/undefined/empty/whitespace paths", () => {
    expect(resolvePhotoSrc(null, false)).toBeNull();
    expect(resolvePhotoSrc(undefined, false)).toBeNull();
    expect(resolvePhotoSrc("", false)).toBeNull();
    expect(resolvePhotoSrc("   ", false)).toBeNull();
  });

  test("returns null once the image has errored (stale/deleted photo)", () => {
    expect(
      resolvePhotoSrc("https://store.public.blob.vercel-storage.com/gone.jpeg", true),
    ).toBeNull();
  });
});
