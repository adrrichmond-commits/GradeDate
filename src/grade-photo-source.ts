/**
 * Durable client-side photo sources for grading result cards.
 *
 * Why this exists: an anonymous free-preview upload is deleted server-side
 * immediately after grading (see /api/grade), so its `photo_path` (local
 * `/uploads/...` path or Vercel Blob URL) is always dead by the time the
 * result card renders. Browser object URLs (`blob:`) are the designed preview
 * source, but they are document-scoped and can be invalidated, so the result
 * card must not depend on either one alone. `dataUrl` (base64 read from the
 * local File) is the durable source; the blob preview and the server
 * photo_path are fallbacks. Nothing here adds server-side exposure: the photo
 * bytes never leave the page, anonymous-upload deletion/retention is
 * untouched, and authenticated photos are never fetched or re-served.
 */

/** Resolve the best `<img>` src for a graded photo, in order of durability. */
export function resolveGradePhotoSrc(
  dataUrl: string | undefined | null,
  previewUrl: string | undefined | null,
  photoPath: string | undefined | null
): string {
  if (dataUrl) return dataUrl;
  if (previewUrl) return previewUrl;
  if (photoPath) return photoPath;
  return "";
}

/** Read a File into a base64 data URL (durable across blob invalidation). */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () =>
      reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}
