import { describe, expect, test } from "bun:test";
import {
  photoFromUploadResponse,
  photoFileTooLarge,
  PHOTO_TOO_LARGE_MESSAGE,
  MAX_PHOTO_FILE_BYTES,
} from "./photo-upload";

describe("photoFromUploadResponse", () => {
  test("returns the photo from authenticated { photos: [...] } responses", () => {
    const photo = photoFromUploadResponse({
      photos: [
        { id: 7, photo_path: "/uploads/7.jpg", sort_order: 0, is_primary: true },
      ],
    });
    expect(photo).toEqual({
      id: 7,
      photo_path: "/uploads/7.jpg",
      sort_order: 0,
      is_primary: true,
    });
  });

  test("returns the first photo when multiple are returned", () => {
    const photo = photoFromUploadResponse({
      photos: [
        { id: 1, photo_path: "/uploads/1.jpg" },
        { id: 2, photo_path: "/uploads/2.jpg" },
      ],
    });
    expect(photo?.id).toBe(1);
  });

  test("falls back to the legacy single-photo { photo } shape", () => {
    const photo = photoFromUploadResponse({
      photo: { id: 3, photo_path: "/uploads/3.jpg", sort_order: 0, is_primary: true },
    });
    expect(photo?.photo_path).toBe("/uploads/3.jpg");
    expect(photo?.id).toBe(3);
  });

  test("returns null when no photo data is present", () => {
    expect(photoFromUploadResponse({ error: "Upload failed" })).toBeNull();
    expect(photoFromUploadResponse({ photos: [] })).toBeNull();
    expect(photoFromUploadResponse({})).toBeNull();
  });
});

describe("photoFileTooLarge (client-side 4 MB cap)", () => {
  test("rejects files over the 4 MB cap", () => {
    expect(photoFileTooLarge({ size: MAX_PHOTO_FILE_BYTES + 1 })).toBe(true);
    expect(photoFileTooLarge({ size: 5 * 1024 * 1024 })).toBe(true);
  });

  test("accepts files at or under 4 MB", () => {
    expect(photoFileTooLarge({ size: MAX_PHOTO_FILE_BYTES })).toBe(false);
    expect(photoFileTooLarge({ size: 1024 })).toBe(false);
  });

  test("the cap sits under Vercel's ~4.5 MB function-payload ceiling", () => {
    expect(MAX_PHOTO_FILE_BYTES).toBe(4 * 1024 * 1024);
    expect(MAX_PHOTO_FILE_BYTES).toBeLessThan(4.5 * 1024 * 1024);
  });

  test("the message is friendly and names the limit", () => {
    expect(PHOTO_TOO_LARGE_MESSAGE).toContain("4 MB");
    expect(PHOTO_TOO_LARGE_MESSAGE.length).toBeGreaterThan(10);
  });
});
