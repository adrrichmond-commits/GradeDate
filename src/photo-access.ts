/**
 * Photo-path access control for grading.
 *
 * These are the pure validation helpers that back the P0 hardening: grading
 * (and its NSFW cleanup) may only ever touch (a) photos the current user owns
 * in the database, or (b) anonymous upload handles issued by our own upload
 * flow. Arbitrary client-supplied paths — other users' photos, internal
 * hosts, or any external URL — are rejected before any read, AI request, or
 * deletion happens.
 */
import { isServerIssuedAnonPhotoPath } from "./anon-upload-retention";

/** Maximum photos a single grading request may grade. */
export const MAX_GRADE_PHOTOS = 5;

export interface PhotoPathResolutionSuccess {
  ok: true;
  /** Submitted paths, all verified owned by the current user. */
  paths: string[];
}
export interface PhotoPathResolutionRejection {
  ok: false;
  error: string;
  code?: string;
}
export type PhotoPathResolutionResult =
  | PhotoPathResolutionSuccess
  | PhotoPathResolutionRejection;

/**
 * Resolve submitted multi-photo grade paths to photos the CURRENT user owns.
 * Every submitted path must exactly match a path in the user's own photo
 * gallery (`user_photos.photo_path`). Any cross-user, deleted, or fabricated
 * path rejects the whole request, so grading and NSFW cleanup can never read
 * or delete another user's photo through this endpoint.
 */
export function resolveOwnedPhotoPaths(
  submitted: unknown,
  ownedPaths: readonly string[],
): PhotoPathResolutionResult {
  if (!Array.isArray(submitted)) {
    return { ok: false, error: "photo_paths array is required (1-5 photos)" };
  }
  if (submitted.length < 1 || submitted.length > MAX_GRADE_PHOTOS) {
    return { ok: false, error: "Provide 1-5 photo paths" };
  }
  if (!submitted.every((p) => typeof p === "string" && p.length > 0)) {
    return { ok: false, error: "photo_paths must be non-empty strings" };
  }
  const owned = new Set(ownedPaths);
  if (!submitted.every((p) => owned.has(p))) {
    return {
      ok: false,
      code: "PHOTO_NOT_OWNED",
      error: "One or more photos do not belong to your account",
    };
  }
  return { ok: true, paths: submitted as string[] };
}

/**
 * Validate the photo path submitted to anonymous grading. Only server-issued
 * anonymous upload handles are accepted (see isServerIssuedAnonPhotoPath) —
 * never arbitrary external URLs, internal hosts, or other users' photos.
 */
export function validateAnonymousGradePath(
  photoPath: unknown,
): { ok: true; path: string } | { ok: false; error: string; code?: string } {
  if (typeof photoPath !== "string" || photoPath.length === 0) {
    return {
      ok: false,
      error: "photo_path is required for anonymous grading",
    };
  }
  if (!isServerIssuedAnonPhotoPath(photoPath)) {
    return {
      ok: false,
      code: "INVALID_PHOTO_PATH",
      error: "photo_path must reference a photo uploaded in this session",
    };
  }
  return { ok: true, path: photoPath };
}
