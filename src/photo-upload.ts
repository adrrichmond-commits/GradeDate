/**
 * Normalize the /api/upload JSON response into the photo record(s) that were
 * added. Authenticated uploads return `{ photos: [{ id, photo_path,
 * sort_order, is_primary }] }`; the legacy single-photo shape `{ photo }` is
 * also accepted for backward compatibility.
 *
 * Returns the first uploaded photo, or null when the response contains no
 * photo data (e.g. an error payload).
 */
export interface UploadedPhoto {
  id?: number;
  photo_path: string;
  sort_order?: number;
  is_primary?: boolean;
}

/**
 * Client-side photo size cap. 4 MB sits comfortably under Vercel's ~4.5 MB
 * function-payload ceiling, so oversize photos are rejected here with a
 * friendly message instead of an opaque platform 413 that never reaches app
 * code. Mirrors the server's MAX_FILE_SIZE in the upload route.
 */
export const MAX_PHOTO_FILE_BYTES = 4 * 1024 * 1024; // 4 MB

export const PHOTO_TOO_LARGE_MESSAGE =
  "That photo is too big — keep photos under 4 MB so they upload without a hitch.";

/** Returns true when the selected file exceeds the 4 MB photo cap. */
export function photoFileTooLarge(file: { size: number }): boolean {
  return file.size > MAX_PHOTO_FILE_BYTES;
}

export function photoFromUploadResponse(data: Record<string, unknown>): UploadedPhoto | null {
  if (Array.isArray(data.photos) && data.photos.length > 0) {
    return data.photos[0] as UploadedPhoto;
  }
  if (data.photo && typeof data.photo === "object") {
    return data.photo as UploadedPhoto;
  }
  return null;
}
