/**
 * Utility to route photo URLs through the private-blob proxy when needed.
 *
 * - Local paths (`/uploads/...`) and object URLs (`blob:...`) pass through unchanged.
 * - External URLs (https://...) are proxied through `/api/photo?url=...`
 *   so the server can fetch private Vercel Blob images with the token.
 */

const BLOB_URL_PATTERN = /^https:\/\/[a-zA-Z0-9]+\.blob\.vercel-storage\.com\//;

export function isBlobUrl(url: string): boolean {
  return BLOB_URL_PATTERN.test(url);
}

/**
 * Returns the correct src for an <img> tag.
 * External URLs (blob storage) are proxied through /api/photo so private blobs
 * are served with the server's credentials.
 */
export function getPhotoUrl(photoPath: string | null | undefined): string {
  if (!photoPath) return "";
  if (photoPath.startsWith("blob:") || photoPath.startsWith("/")) {
    return photoPath;
  }
  if (photoPath.startsWith("https://") || photoPath.startsWith("http://")) {
    return `/api/photo?url=${encodeURIComponent(photoPath)}`;
  }
  return photoPath;
}
