// Blob store abstraction: uses Vercel Blob on Vercel (when BLOB_READ_WRITE_TOKEN is set),
// falls back to local filesystem for local dev.
// NOTE: @vercel/blob is dynamically imported at runtime — never statically imported,
// because it fails to load in Vercel's bundled serverless function.
import { mkdirSync, writeFileSync, readFileSync, unlinkSync } from "node:fs";
import path from "node:path";

let _blobClient: { put: typeof import("@vercel/blob").put; del: typeof import("@vercel/blob").del } | null | undefined;

async function getBlobClient() {
  if (_blobClient !== undefined) return _blobClient;
  try {
    const { put, del } = await import("@vercel/blob");
    _blobClient = { put, del };
    return _blobClient;
  } catch {
    console.warn("[blob-store] @vercel/blob package could not be loaded");
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
      console.warn("[blob-store] BLOB_READ_WRITE_TOKEN is not set. Falling back to local filesystem.");
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
function uploadsDir(): string {
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
        access: "private",
        contentType,
      });
      return blob.url;
    }
    console.warn("[blob-store] Blob client unavailable; falling back to local filesystem.");
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
    const fetchHeaders: Record<string, string> = {};
    if (isVercelBlob() && process.env.BLOB_READ_WRITE_TOKEN) {
      fetchHeaders["Authorization"] = `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`;
    }
    const response = await fetch(photoPath, { headers: fetchHeaders });
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
 */
export async function deletePhoto(photoPath: string): Promise<void> {
  if (isExternalUrl(photoPath)) {
    if (isVercelBlob()) {
      const client = await getBlobClient();
      if (client) {
        try {
          await client.del(photoPath);
        } catch (err) {
          console.error("[blob-store] Failed to delete blob:", err);
        }
      }
    }
    // If not using blob but path is external, it's not stored by us — nothing to delete
    return;
  }

  // Local filesystem
  try {
    const dir = uploadsDir();
    const filename = path.basename(photoPath);
    unlinkSync(path.join(dir, filename));
  } catch (err) {
    console.error("[blob-store] Failed to delete local file:", err);
  }
}
