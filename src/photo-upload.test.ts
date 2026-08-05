import { describe, expect, test } from "bun:test";
import { photoFromUploadResponse } from "./photo-upload";

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
