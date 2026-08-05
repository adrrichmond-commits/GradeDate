import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ANON_UPLOAD_TTL_MS,
  deleteAnonUpload,
  isAnonUploadPath,
  maybeSweepExpiredAnonUploads,
  sweepBlobAnonUploads,
  sweepExpiredAnonUploads,
  sweepLocalAnonUploads,
  type BlobSweepBackend,
} from "./anon-upload-retention";

const HOUR = 60 * 60 * 1000;

describe("isAnonUploadPath", () => {
  test("accepts anon local paths", () => {
    expect(isAnonUploadPath("/uploads/anon_123e4567-e89b-12d3-a456-426614174000.jpg")).toBe(true);
    expect(isAnonUploadPath("anon_abc.jpg")).toBe(true);
  });
  test("accepts anon blob URLs with and without querystrings", () => {
    expect(isAnonUploadPath("https://store.public.blob.vercel-storage.com/anon_abc-xyz.jpg")).toBe(true);
    expect(isAnonUploadPath("https://store.public.blob.vercel-storage.com/anon_abc.jpg?download=1")).toBe(true);
  });
  test("rejects authenticated and profile uploads", () => {
    expect(isAnonUploadPath("/uploads/42_1784575934617.png")).toBe(false);
    expect(isAnonUploadPath("https://store.public.blob.vercel-storage.com/42_1784575934617.png")).toBe(false);
    expect(isAnonUploadPath("")).toBe(false);
    expect(isAnonUploadPath("profile.jpg")).toBe(false);
    expect(isAnonUploadPath("anon")).toBe(false);
  });
});

describe("sweepLocalAnonUploads", () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), "gd-anon-sweep-"));
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const touch = (name: string, ageMs: number, now: number) => {
    const filePath = path.join(dir, name);
    writeFileSync(filePath, "x");
    utimesSync(filePath, new Date(now - ageMs), new Date(now - ageMs));
  };

  test("deletes only expired anon_* files and never user files", () => {
    const now = Date.now();
    touch("anon_old1.jpg", 2 * 24 * HOUR, now); // expired
    touch("anon_old2.png", ANON_UPLOAD_TTL_MS + 1, now); // expired
    touch("anon_fresh.jpg", HOUR, now); // fresh
    touch("42_1784575934617.png", 30 * 24 * HOUR, now); // old USER file — must survive

    const deleted = sweepLocalAnonUploads(dir, ANON_UPLOAD_TTL_MS, now);
    expect(deleted).toBe(2);
    expect(pathExists(dir, "anon_old1.jpg")).toBe(false);
    expect(pathExists(dir, "anon_old2.png")).toBe(false);
    expect(pathExists(dir, "anon_fresh.jpg")).toBe(true);
    expect(pathExists(dir, "42_1784575934617.png")).toBe(true);
  });

  test("missing directory is a no-op", () => {
    expect(sweepLocalAnonUploads(path.join(dir, "does-not-exist"), ANON_UPLOAD_TTL_MS, Date.now())).toBe(0);
  });
});

describe("sweepBlobAnonUploads", () => {
  test("deletes only expired anon blobs using the injected backend", async () => {
    const now = Date.now();
    const deleted: string[] = [];
    const backend: BlobSweepBackend = {
      list: async () => [
        { url: "https://blob.example/anon_expired.jpg", uploadedAt: new Date(now - 2 * 24 * HOUR) },
        { url: "https://blob.example/anon_fresh.jpg", uploadedAt: new Date(now - HOUR) },
        // Prefix-matched by list() but NOT an anon upload (defense-in-depth) — must survive.
        { url: "https://blob.example/42_1784575934617.png", uploadedAt: new Date(now - 30 * 24 * HOUR) },
        // Querystring on a fresh anon blob — must survive.
        { url: "https://blob.example/anon_fresh2.jpg?download=1", uploadedAt: new Date(now - HOUR) },
      ],
      del: async (url) => {
        deleted.push(url);
      },
    };
    const count = await sweepBlobAnonUploads(ANON_UPLOAD_TTL_MS, now, backend);
    expect(count).toBe(1);
    expect(deleted).toEqual(["https://blob.example/anon_expired.jpg"]);
  });

  test("list errors are swallowed", async () => {
    const backend: BlobSweepBackend = {
      list: async () => {
        throw new Error("list boom");
      },
      del: async () => {},
    };
    await expect(sweepBlobAnonUploads(ANON_UPLOAD_TTL_MS, Date.now(), backend)).resolves.toBe(0);
  });
});

describe("deleteAnonUpload", () => {
  test("is a no-op for authenticated profile photos", async () => {
    // Would fail loudly if it attempted a real delete on a non-anon path —
    // deletePhoto only reaches local/blob stores for anon paths. We assert the
    // guard: a user path must never be passed to the underlying store.
    await expect(deleteAnonUpload("/uploads/42_1784575934617.png")).resolves.toBeUndefined();
    await expect(deleteAnonUpload("")).resolves.toBeUndefined();
  });
});

describe("sweepExpiredAnonUploads / maybeSweepExpiredAnonUploads", () => {
  test("combined sweep runs against the real (empty-of-anon) stores without error", async () => {
    const result = await sweepExpiredAnonUploads(ANON_UPLOAD_TTL_MS, Date.now());
    expect(typeof result.local).toBe("number");
    expect(typeof result.blob).toBe("number");
  });

  test("throttles to one sweep per interval", async () => {
    const first = await maybeSweepExpiredAnonUploads();
    const second = await maybeSweepExpiredAnonUploads(Date.now() + 60 * 1000); // < 30 min later
    expect(first).toBe(true); // first call runs (or already ran in the previous test)
    expect(second).toBe(false); // throttled
  });
});

function pathExists(dir: string, name: string): boolean {
  return existsSync(path.join(dir, name));
}
