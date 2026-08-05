#!/usr/bin/env bun
/**
 * Manual anonymous-upload retention sweep.
 *
 * Deletes anonymous free-preview uploads (`anon_*`) older than the TTL from
 * both local storage and Vercel Blob. Safe to run any time — authenticated
 * profile photos are named `<userId>_...` and are never touched.
 *
 * Usage:
 *   bun run scripts/cleanup-anon-uploads.ts            # default 24h TTL
 *   ANON_UPLOAD_TTL_HOURS=48 bun run scripts/cleanup-anon-uploads.ts
 *
 * Can be wired to a cron/external scheduler (e.g. on Vercel) for environments
 * without a long-running process. The local dev server (serve.ts) already runs
 * this on startup and every 6 hours, and /api/upload runs a throttled sweep.
 */
import { sweepExpiredAnonUploads } from "../src/anon-upload-retention";

const ttlHours = Number(process.env.ANON_UPLOAD_TTL_HOURS) || 24;
const maxAgeMs = ttlHours * 60 * 60 * 1000;

const result = await sweepExpiredAnonUploads(maxAgeMs);
console.log(
  `[cleanup-anon-uploads] Deleted ${result.local} local + ${result.blob} blob ` +
    `anonymous upload(s) older than ${ttlHours}h.`,
);
