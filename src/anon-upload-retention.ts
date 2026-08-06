/**
 * Anonymous upload retention.
 *
 * Anonymous free-preview photos are stored under the `anon_` filename prefix
 * with NO database record (see /api/upload), so they have no natural
 * lifecycle. This module implements two complementary cleanup mechanisms:
 *
 * 1. Deletion after grading — once the anonymous grade response is built the
 *    client only renders from local object URLs, so the server-side copy is
 *    deleted immediately (best-effort).
 * 2. TTL sweep — a safety net for uploads that never reach grading (abandoned
 *    sessions). Only files whose basename starts with `anon_` are ever
 *    touched; authenticated/profile uploads are named `<userId>_...` and are
 *    recorded in the database, so they are never matched here.
 */
import { readdirSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";
import {
  deletePhoto,
  isAllowedStorageUrl,
  isStoragePhotoPath,
  listBlobs,
  uploadsDir,
} from "./blob-store";
import { EVENTS, logError, logInfo, logWarn } from "./observability";

/** Filename prefix that identifies an anonymous free-preview upload. */
export const ANON_UPLOAD_PREFIX = "anon_";
/** Default TTL for anonymous uploads that never get graded. */
export const ANON_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
/** Minimum gap between opportunistic sweeps (throttles serverless instances). */
export const ANON_SWEEP_MIN_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

let _lastSweepAt = 0;

/**
 * True when a photo path refers to an anonymous upload. Works for both local
 * paths (`/uploads/anon_<uuid>.jpg`) and blob URLs (querystrings ignored).
 * Authenticated uploads are named `<userId>_<timestamp>_...` and never match.
 */
export function isAnonUploadPath(photoPath: string): boolean {
  if (!photoPath) return false;
  const withoutQuery = photoPath.split("?")[0] ?? photoPath;
  return path.basename(withoutQuery).startsWith(ANON_UPLOAD_PREFIX);
}

/**
 * STRICT validation for a photo path submitted to anonymous grading. Only
 * server-issued anonymous upload handles are accepted:
 *
 * - Local: `/uploads/anon_<id>.<ext>` — a safe uploads-dir filename whose
 *   basename starts with `anon_` (rejects path traversal, other users' photos,
 *   and any file outside the uploads directory).
 * - External: an https URL on GradeDate's OWN storage (Vercel Blob public
 *   domain when Blob is configured, or an explicitly configured origin) whose
 *   pathname basename starts with `anon_`.
 *
 * Everything else — arbitrary external URLs (SSRF), internal/cloud-metadata
 * hosts, `file:`/`data:` schemes, authenticated user photos, fabricated
 * paths — is rejected. Anonymous uploads intentionally have no database
 * record, so the naming convention plus the storage-origin allowlist is the
 * enforcement boundary.
 */
export function isServerIssuedAnonPhotoPath(photoPath: string): boolean {
  if (
    typeof photoPath !== "string" ||
    photoPath.length === 0 ||
    photoPath.length > 1024
  ) {
    return false;
  }
  if (photoPath.startsWith("http://") || photoPath.startsWith("https://")) {
    if (!isAllowedStorageUrl(photoPath)) return false;
    let pathname = "";
    try {
      pathname = new URL(photoPath).pathname;
    } catch {
      return false;
    }
    return path.basename(pathname).startsWith(ANON_UPLOAD_PREFIX);
  }
  if (!isStoragePhotoPath(photoPath)) return false;
  return path.basename(photoPath).startsWith(ANON_UPLOAD_PREFIX);
}

/**
 * Delete an anonymous upload. Strictly a no-op for anything that is not an
 * anonymous upload — authenticated/profile photos are never deleted through
 * this path. Best-effort: swallow errors like deletePhoto already does.
 */
export async function deleteAnonUpload(photoPath: string): Promise<void> {
  if (!isAnonUploadPath(photoPath)) return;
  await deletePhoto(photoPath);
}

/**
 * Purge anonymous upload files older than `maxAgeMs` from a local directory.
 * Only entries whose basename starts with `anon_` are candidates. Returns the
 * number of files deleted. `now` is injectable for tests.
 */
export function sweepLocalAnonUploads(dir: string, maxAgeMs: number, now: number = Date.now()): number {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return 0; // Directory missing or unreadable — nothing to sweep
  }
  let deleted = 0;
  for (const entry of entries) {
    if (!entry.startsWith(ANON_UPLOAD_PREFIX)) continue;
    const filePath = path.join(dir, entry);
    let mtimeMs: number;
    try {
      mtimeMs = statSync(filePath).mtimeMs;
    } catch {
      continue; // Gone already or unreadable — nothing to do
    }
    if (now - mtimeMs > maxAgeMs) {
      try {
        unlinkSync(filePath);
        deleted++;
      } catch (err) {
        logWarn(EVENTS.ANON_RETENTION_DELETE_FAILED, { err, store: "local" });
      }
    }
  }
  return deleted;
}

/** A minimal list/del abstraction so the blob sweep is unit-testable. */
export interface BlobSweepBackend {
  list: (prefix: string) => Promise<{ url: string; uploadedAt: Date }[]>;
  del: (url: string) => Promise<void>;
}

const defaultBlobBackend: BlobSweepBackend = {
  list: (prefix) => listBlobs(prefix),
  del: async (url) => {
    await deletePhoto(url);
  },
};

/**
 * Purge anonymous blobs older than `maxAgeMs`. Only blob pathnames whose
 * basename starts with `anon_` are candidates (defense in depth: list() is
 * prefix-matched, but we re-verify each pathname). Returns the number deleted.
 */
export async function sweepBlobAnonUploads(
  maxAgeMs: number,
  now: number = Date.now(),
  backend: BlobSweepBackend = defaultBlobBackend,
): Promise<number> {
  let blobs: { url: string; uploadedAt: Date }[];
  try {
    blobs = await backend.list(ANON_UPLOAD_PREFIX);
  } catch (err) {
    logWarn(EVENTS.ANON_RETENTION_LIST_FAILED, { err });
    return 0;
  }
  let deleted = 0;
  for (const blob of blobs) {
    if (!isAnonUploadPath(blob.url)) continue;
    const ageMs = now - blob.uploadedAt.getTime();
    if (ageMs <= maxAgeMs) continue;
    try {
      await backend.del(blob.url);
      deleted++;
    } catch (err) {
      logWarn(EVENTS.ANON_RETENTION_DELETE_FAILED, { err, store: "blob" });
    }
  }
  return deleted;
}

/**
 * Sweep expired anonymous uploads across both local storage and Vercel Blob.
 * Returns the number of files deleted from each store. Safe to call any time;
 * never touches authenticated/profile uploads.
 */
export async function sweepExpiredAnonUploads(
  maxAgeMs: number = ANON_UPLOAD_TTL_MS,
  now: number = Date.now(),
): Promise<{ local: number; blob: number }> {
  const local = sweepLocalAnonUploads(uploadsDir(), maxAgeMs, now);
  const blob = await sweepBlobAnonUploads(maxAgeMs, now);
  if (local > 0 || blob > 0) {
    logInfo(EVENTS.ANON_RETENTION_SWEEP_COMPLETE, { local, blob });
  }
  return { local, blob };
}

/**
 * Throttled sweep for serverless contexts: call on anonymous upload/grade
 * traffic, and it runs at most once per ANON_SWEEP_MIN_INTERVAL_MS per
 * process. Returns true when a sweep actually ran.
 */
export async function maybeSweepExpiredAnonUploads(now: number = Date.now()): Promise<boolean> {
  if (now - _lastSweepAt < ANON_SWEEP_MIN_INTERVAL_MS) return false;
  _lastSweepAt = now;
  try {
    await sweepExpiredAnonUploads();
  } catch (err) {
    logError(EVENTS.ANON_RETENTION_SWEEP_FAILED, { err });
  }
  return true;
}
