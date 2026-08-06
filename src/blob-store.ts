// Blob store abstraction: uses Vercel Blob on Vercel (when BLOB_READ_WRITE_TOKEN is set),
// falls back to local filesystem for local dev.
// NOTE: @vercel/blob is dynamically imported at runtime — never statically imported,
// because it fails to load in Vercel's bundled serverless function.
import { mkdirSync, writeFileSync, readFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { EVENTS, logWarn } from "./observability";

let _blobClient: { put: typeof import("@vercel/blob").put; del: typeof import("@vercel/blob").del } | null | undefined;

async function getBlobClient() {
  if (_blobClient !== undefined) return _blobClient;
  try {
    const { put, del } = await import("@vercel/blob");
    _blobClient = { put, del };
    return _blobClient;
  } catch {
    logWarn(EVENTS.BLOB_STORE_PROVIDER_MISSING, {});
    _blobClient = null;
    return null;
  }
}

let _warnedMissingToken = false;

/**
 * Returns true if we should use Vercel Blob storage.
 * Requires BLOB_READ_WRITE_TOKEN env var.
 */
export function isVercelBlob(): boolean {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    if (!_warnedMissingToken) {
      logWarn(EVENTS.BLOB_STORE_TOKEN_MISSING, {});
      _warnedMissingToken = true;
    }
    return false;
  }
  return true;
}

/**
 * Check if a photo_path is an external URL (blob URL, etc.), not a local path.
 */
export function isExternalUrl(photoPath: string): boolean {
  return photoPath.startsWith("https://") || photoPath.startsWith("http://");
}

/**
 * Get the local uploads directory.
 */
function getUploadsDir(): string {
  if (typeof (globalThis as any).Bun === "undefined") {
    return "/tmp/uploads";
  }
  return path.join(import.meta.dir, "..", "uploads");
}

let _uploadsDir: string | null = null;
/** Get the local uploads directory, creating it if needed. */
export function uploadsDir(): string {
  if (_uploadsDir) return _uploadsDir;
  _uploadsDir = getUploadsDir();
  try {
    mkdirSync(_uploadsDir, { recursive: true });
  } catch {
    // Ignore — may not be writable in serverless
  }
  return _uploadsDir;
}

/**
 * Store a file. On Vercel with blob, returns the public blob URL.
 * Locally, returns the `/uploads/...` path.
 */
export async function storePhoto(
  filename: string,
  buffer: ArrayBuffer,
  contentType: string,
): Promise<string> {
  if (isVercelBlob()) {
    const client = await getBlobClient();
    if (client) {
      const blob = await client.put(filename, buffer, {
        access: "public",
        contentType,
      });
      return blob.url;
    }
    logWarn(EVENTS.BLOB_STORE_CLIENT_UNAVAILABLE, {});
  }

  // Local filesystem
  const filePath = path.join(uploadsDir(), filename);
  writeFileSync(filePath, new Uint8Array(buffer));
  return `/uploads/${filename}`;
}

/**
 * Read a photo as a Buffer, whether it's stored locally or on Vercel Blob.
 */
export async function readPhotoBuffer(photoPath: string): Promise<Buffer> {
  if (isExternalUrl(photoPath)) {
    const response = await fetch(photoPath);
    if (!response.ok) {
      throw new Error(`Failed to fetch photo from URL: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  // Local filesystem
  const dir = uploadsDir();
  const filename = path.basename(photoPath);
  const filePath = path.join(dir, filename);
  return readFileSync(filePath);
}

/**
 * Delete a photo. Handles both blob URLs and local paths.
 * Best-effort: failures are logged via BLOB_STORE_DELETE_FAILED and reported
 * to the caller through the boolean return so cleanup outcomes are observable
 * (e.g. account deletion can count successes vs failures).
 *
 * Returns true when the file no longer exists (deleted, or external URL that
 * is not stored by us), false when deletion was attempted but failed.
 */
export async function deletePhoto(photoPath: string): Promise<boolean> {
  if (isExternalUrl(photoPath)) {
    if (isVercelBlob()) {
      const client = await getBlobClient();
      if (!client) {
        logWarn(EVENTS.BLOB_STORE_CLIENT_UNAVAILABLE, {});
        return false;
      }
      try {
        await client.del(photoPath);
        return true;
      } catch (err) {
        logWarn(EVENTS.BLOB_STORE_DELETE_FAILED, { err, target: "blob" });
        return false;
      }
    }
    // If not using blob but path is external, it's not stored by us — nothing to delete
    return true;
  }

  // Local filesystem
  try {
    const dir = uploadsDir();
    const filename = path.basename(photoPath);
    unlinkSync(path.join(dir, filename));
    return true;
  } catch (err) {
    logWarn(EVENTS.BLOB_STORE_DELETE_FAILED, { err, target: "local" });
    return false;
  }
}

/**
 * List blobs whose pathname starts with `prefix` (e.g. "anon_"), returning
 * their URL and upload time. Uses @vercel/blob's list() with pagination;
 * returns [] when blob storage is not configured. Used by the anonymous
 * upload TTL sweep — callers must still double-check the name prefix before
 * deleting, because list() matches by pathname prefix only.
 */
export async function listBlobs(prefix: string): Promise<{ url: string; uploadedAt: Date }[]> {
  if (!isVercelBlob()) return [];
  let listFn: ((opts: { prefix: string; limit?: number; cursor?: string }) => Promise<{
    blobs: { url: string; pathname: string; uploadedAt: string | Date }[];
    hasMore: boolean;
    cursor?: string;
  }>) | null = null;
  try {
    const mod = await import("@vercel/blob");
    listFn = mod.list as typeof listFn;
  } catch {
    logWarn(EVENTS.BLOB_STORE_PROVIDER_MISSING, {});
    return [];
  }
  if (!listFn) return [];
  const results: { url: string; uploadedAt: Date }[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await listFn({ prefix, limit: 1000, ...(cursor ? { cursor } : {}) });
    for (const blob of page.blobs) {
      results.push({
        url: blob.url,
        uploadedAt: blob.uploadedAt instanceof Date ? blob.uploadedAt : new Date(blob.uploadedAt),
      });
    }
    if (!page.hasMore) break;
    cursor = page.cursor;
    if (!cursor) break;
  }
  return results;
}
