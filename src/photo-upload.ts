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

export function photoFromUploadResponse(data: Record<string, unknown>): UploadedPhoto | null {
  if (Array.isArray(data.photos) && data.photos.length > 0) {
    return data.photos[0] as UploadedPhoto;
  }
  if (data.photo && typeof data.photo === "object") {
    return data.photo as UploadedPhoto;
  }
  return null;
}
