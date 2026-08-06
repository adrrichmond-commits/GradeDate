/**
 * Durable client-side photo sources for grading result cards.
 *
 * Why this exists: an anonymous free-preview upload is deleted server-side
 * immediately after grading (see /api/grade), so its `photo_path` (local
 * `/uploads/...` path or Vercel Blob URL) is always dead by the time the
 * result card renders. Browser object URLs (`blob:`) are also not reliably
 * renderable: the site CSP (`img-src 'self' data: https:`) blocks `blob:`
 * image loads, and blob URLs are document-scoped and can be invalidated.
 * `dataUrl` (base64 read from the local File) is therefore the ONLY durable,
 * CSP-compliant source for the page lifetime; the blob preview and the server
 * photo_path are last-resort fallbacks. Nothing here adds server-side
 * exposure: the photo bytes never leave the page, anonymous-upload
 * deletion/retention is untouched, and authenticated photos are never
 * fetched or re-served.
 */

/** A photo entry as held in grading state: the File plus its render sources. */
export interface GradePhotoEntry {
  file: File;
  /** Blob preview created at selection time (may be CSP-blocked / revoked). */
  previewUrl: string;
  /** Durable base64 source, read from the local File. Preferred by renders. */
  dataUrl?: string;
  /** Server-side path, set after upload. Dead for anonymous previews. */
  photoPath?: string;
}

/** A server grade record that result cards enrich with client-side sources. */
export interface GradeResultSource {
  photo_path: string;
  grade: number;
  feedback: string;
  is_best: boolean;
  dataUrl?: string;
  previewUrl?: string;
}

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

/**
 * Ensure every entry has its durable base64 source BEFORE the grading
 * pipeline starts. FileReader is asynchronous; if grading finishes first, the
 * result card can render after the anonymous upload has been deleted while
 * its data URL is still missing from React state. Awaiting here makes the
 * source available for the first result render instead of relying on a later
 * state update (or a now-dead blob/server URL). Applies to authenticated
 * users too: their result cards must not depend on CSP-blocked blob URLs.
 */
export async function ensurePhotoDataUrls(
  entries: GradePhotoEntry[]
): Promise<GradePhotoEntry[]> {
  return Promise.all(
    entries.map(async (entry) => {
      if (entry.dataUrl) return entry;
      try {
        return { ...entry, dataUrl: await fileToDataUrl(entry.file) };
      } catch {
        // Keep the entry as-is; renders fall back to preview/path.
        return entry;
      }
    })
  );
}

/**
 * Enrich server grade records with the client-side photo sources they will
 * render with, matched by index. `dataUrl` is retained when present so the
 * result card never depends on a deleted server path or a CSP-blocked blob
 * URL. This is the exact step that runs right before the results state is
 * committed (submit -> results transition).
 */
export function attachPhotoSources<T extends { photo_path: string }>(
  grades: T[],
  entries: GradePhotoEntry[]
): (T & { previewUrl: string; dataUrl?: string })[] {
  return grades.map((grade, i) => ({
    ...grade,
    previewUrl: entries[i]?.previewUrl || "",
    dataUrl: entries[i]?.dataUrl,
  }));
}
