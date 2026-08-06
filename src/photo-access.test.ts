import { afterAll, describe, expect, test } from "bun:test";
import {
  deletePhoto,
  isAllowedStorageUrl,
  isStoragePhotoPath,
  readPhotoBuffer,
} from "./blob-store";
import { isServerIssuedAnonPhotoPath } from "./anon-upload-retention";
import {
  MAX_GRADE_PHOTOS,
  resolveOwnedPhotoPaths,
  validateAnonymousGradePath,
} from "./photo-access";

/**
 * P0 photo-path security regression tests.
 *
 * These cover the three audit findings:
 * 1. Authenticated grading must resolve photo paths ONLY to records owned by
 *    the current user (cross-user paths rejected → no unauthorized read or
 *    deletion of other users' photos).
 * 2. Anonymous grading must accept ONLY server-issued upload handles (no
 *    arbitrary external URLs → no SSRF).
 * 3. readPhotoBuffer/deletePhoto must never fetch or delete an arbitrary
 *    external URL — only GradeDate's own storage.
 */

const BLOB_URL = "https://my-store.public.blob.vercel-storage.com";
const ORIGINAL_BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const ORIGINAL_STORAGE_ORIGINS = process.env.GRADEDATE_STORAGE_ORIGINS;

function withBlobToken(enabled: boolean): void {
  if (enabled) {
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_00000000_testtoken";
  } else {
    delete process.env.BLOB_READ_WRITE_TOKEN;
  }
}

afterAll(() => {
  if (ORIGINAL_BLOB_TOKEN === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
  else process.env.BLOB_READ_WRITE_TOKEN = ORIGINAL_BLOB_TOKEN;
  if (ORIGINAL_STORAGE_ORIGINS === undefined) delete process.env.GRADEDATE_STORAGE_ORIGINS;
  else process.env.GRADEDATE_STORAGE_ORIGINS = ORIGINAL_STORAGE_ORIGINS;
  globalThis.fetch = (globalThis as any).__origFetch || globalThis.fetch;
});

// ── 1. Authenticated grading: ownership-scoped resolution ─────

describe("resolveOwnedPhotoPaths", () => {
  const owned = [
    "/uploads/42_1784575934617_a1.jpg",
    "/uploads/42_1784575934618_b2.png",
    `${BLOB_URL}/42_1784575934619_c3.webp`,
  ];

  test("accepts paths the user owns", () => {
    const result = resolveOwnedPhotoPaths(owned.slice(0, 2), owned);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.paths).toEqual(owned.slice(0, 2));
  });

  test("rejects a cross-user path (other user's photo)", () => {
    const result = resolveOwnedPhotoPaths(
      ["/uploads/42_1784575934617_a1.jpg", "/uploads/99_1784575934617_z9.jpg"],
      owned,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("PHOTO_NOT_OWNED");
      expect(result.error).toContain("do not belong to your account");
    }
  });

  test("rejects fabricated / unowned paths and mixed lists", () => {
    expect(resolveOwnedPhotoPaths(["/uploads/42_1784575934617_a1.jpg", "/uploads/not-owned.jpg"], owned).ok).toBe(false);
    expect(resolveOwnedPhotoPaths([`${BLOB_URL}/42_1784575934619_c3.webp`, "https://evil.example/photo.jpg"], owned).ok).toBe(false);
    expect(resolveOwnedPhotoPaths(["https://169.254.169.254/latest/meta-data/"], owned).ok).toBe(false);
  });

  test("rejects malformed payloads before any ownership check", () => {
    expect(resolveOwnedPhotoPaths(undefined, owned).ok).toBe(false);
    expect(resolveOwnedPhotoPaths(null, owned).ok).toBe(false);
    expect(resolveOwnedPhotoPaths("not-an-array", owned).ok).toBe(false);
    expect(resolveOwnedPhotoPaths([], owned).ok).toBe(false);
    expect(resolveOwnedPhotoPaths([123, 456], owned).ok).toBe(false);
    expect(resolveOwnedPhotoPaths([""], owned).ok).toBe(false);
    expect(resolveOwnedPhotoPaths(Array(MAX_GRADE_PHOTOS + 1).fill(owned[0]), owned).ok).toBe(false);
  });

  test("exactly MAX_GRADE_PHOTOS is allowed", () => {
    const many = Array(MAX_GRADE_PHOTOS).fill(owned[0]);
    const result = resolveOwnedPhotoPaths(many, [owned[0]]);
    expect(result.ok).toBe(true);
  });
});

// ── 2. Anonymous grading: only server-issued upload handles ────

describe("isServerIssuedAnonPhotoPath", () => {
  test("accepts server-issued local anon upload paths", () => {
    expect(isServerIssuedAnonPhotoPath("/uploads/anon_3f2a9c1e-8b7d-4a2c-9e1f-0a1b2c3d4e5f.jpg")).toBe(true);
    expect(isServerIssuedAnonPhotoPath("/uploads/anon_abc123.png")).toBe(true);
    expect(isServerIssuedAnonPhotoPath("/uploads/anon_uuid.webp")).toBe(true);
  });

  test("accepts anon uploads on GradeDate's own blob storage (blob configured)", () => {
    withBlobToken(true);
    try {
      expect(isServerIssuedAnonPhotoPath(`${BLOB_URL}/anon_3f2a9c1e-8b7d.jpg`)).toBe(true);
    } finally {
      withBlobToken(false);
    }
  });

  test("rejects arbitrary external URLs (SSRF) — never accepted", () => {
    withBlobToken(true);
    try {
      expect(isServerIssuedAnonPhotoPath("https://169.254.169.254/latest/meta-data/")).toBe(false);
      expect(isServerIssuedAnonPhotoPath("http://169.254.169.254/latest/meta-data/")).toBe(false);
      expect(isServerIssuedAnonPhotoPath("https://internal.example/health")).toBe(false);
      expect(isServerIssuedAnonPhotoPath("https://evil.example/anon_x.jpg")).toBe(false);
      expect(isServerIssuedAnonPhotoPath(`${BLOB_URL}/42_1784575934617.png`)).toBe(false); // not anon
      expect(isServerIssuedAnonPhotoPath("https://example.com/photo.jpg")).toBe(false);
    } finally {
      withBlobToken(false);
    }
  });

  test("rejects external URLs entirely when blob is not configured", () => {
    withBlobToken(false);
    expect(isServerIssuedAnonPhotoPath(`${BLOB_URL}/anon_x.jpg`)).toBe(false);
    expect(isServerIssuedAnonPhotoPath("https://example.com/anon_x.jpg")).toBe(false);
  });

  test("rejects other users' photos, traversal, and non-path inputs", () => {
    expect(isServerIssuedAnonPhotoPath("/uploads/42_1784575934617.png")).toBe(false);
    expect(isServerIssuedAnonPhotoPath("/uploads/../etc/passwd")).toBe(false);
    expect(isServerIssuedAnonPhotoPath("/etc/passwd")).toBe(false);
    expect(isServerIssuedAnonPhotoPath("anon_x.jpg")).toBe(false); // bare filename, not a path
    expect(isServerIssuedAnonPhotoPath("file:///etc/passwd")).toBe(false);
    expect(isServerIssuedAnonPhotoPath("data:image/png;base64,AAAA")).toBe(false);
    expect(isServerIssuedAnonPhotoPath("")).toBe(false);
    expect(isServerIssuedAnonPhotoPath("https://")).toBe(false);
  });
});

describe("validateAnonymousGradePath", () => {
  test("accepts a server-issued anon path", () => {
    const result = validateAnonymousGradePath("/uploads/anon_3f2a9c1e.jpg");
    expect(result.ok).toBe(true);
  });

  test("rejects missing or non-string photo_path", () => {
    expect(validateAnonymousGradePath(undefined).ok).toBe(false);
    expect(validateAnonymousGradePath(null).ok).toBe(false);
    expect(validateAnonymousGradePath(123).ok).toBe(false);
    expect(validateAnonymousGradePath("").ok).toBe(false);
  });

  test("rejects arbitrary external URLs with INVALID_PHOTO_PATH", () => {
    const result = validateAnonymousGradePath("https://169.254.169.254/latest/meta-data/");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("INVALID_PHOTO_PATH");
    }
  });

  test("rejects another user's photo path", () => {
    expect(validateAnonymousGradePath("/uploads/42_1784575934617.png").ok).toBe(false);
  });
});

// ── 3. Storage reference validation ─────────────────────────────

describe("isStoragePhotoPath / isAllowedStorageUrl", () => {
  test("accepts local uploads paths (anon and user photos)", () => {
    expect(isStoragePhotoPath("/uploads/42_1784575934617.png")).toBe(true);
    expect(isStoragePhotoPath("/uploads/anon_abc.jpg")).toBe(true);
  });

  test("rejects non-uploads local paths and traversal", () => {
    expect(isStoragePhotoPath("/etc/passwd")).toBe(false);
    expect(isStoragePhotoPath("/uploads/../etc/passwd")).toBe(false);
    expect(isStoragePhotoPath("../etc/passwd")).toBe(false);
    expect(isStoragePhotoPath("passwd")).toBe(false);
    expect(isStoragePhotoPath("")).toBe(false);
  });

  test("accepts blob URLs only on the configured blob domain when blob is enabled", () => {
    withBlobToken(true);
    try {
      expect(isAllowedStorageUrl(`${BLOB_URL}/42_x.jpg`)).toBe(true);
      expect(isStoragePhotoPath(`${BLOB_URL}/42_x.jpg`)).toBe(true);
    } finally {
      withBlobToken(false);
    }
  });

  test("rejects all external URLs when blob is not configured", () => {
    withBlobToken(false);
    expect(isAllowedStorageUrl("https://example.com/photo.jpg")).toBe(false);
    expect(isAllowedStorageUrl("http://example.com/photo.jpg")).toBe(false);
    expect(isAllowedStorageUrl(`${BLOB_URL}/42_x.jpg`)).toBe(false);
  });

  test("honors explicitly configured storage origins", () => {
    withBlobToken(false);
    process.env.GRADEDATE_STORAGE_ORIGINS = "https://cdn.gradedate.app";
    try {
      expect(isAllowedStorageUrl("https://cdn.gradedate.app/42_x.jpg")).toBe(true);
      expect(isStoragePhotoPath("https://cdn.gradedate.app/42_x.jpg")).toBe(true);
      expect(isAllowedStorageUrl("https://cdn.gradedate.app.evil.example/42_x.jpg")).toBe(false);
      expect(isAllowedStorageUrl("https://other.example/42_x.jpg")).toBe(false);
    } finally {
      delete process.env.GRADEDATE_STORAGE_ORIGINS;
    }
  });

  test("rejects non-https schemes and malformed URLs", () => {
    withBlobToken(true);
    try {
      expect(isAllowedStorageUrl("http://my-store.public.blob.vercel-storage.com/x.jpg")).toBe(false);
      expect(isAllowedStorageUrl("file:///etc/passwd")).toBe(false);
      expect(isAllowedStorageUrl("data:image/png;base64,AAAA")).toBe(false);
      expect(isAllowedStorageUrl("not a url")).toBe(false);
      expect(isAllowedStorageUrl("")).toBe(false);
    } finally {
      withBlobToken(false);
    }
  });
});

// ── 4. readPhotoBuffer: no arbitrary external fetches ──────────

describe("readPhotoBuffer SSRF guard", () => {
  function stubFetch(calls: string[]): void {
    (globalThis as any).__origFetch = globalThis.fetch;
    globalThis.fetch = (async (input: any) => {
      calls.push(String(input));
      return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
        status: 200,
        headers: { "Content-Type": "image/png" },
      });
    }) as typeof fetch;
  }

  test("rejects an arbitrary external URL without touching the network", async () => {
    withBlobToken(true);
    const calls: string[] = [];
    stubFetch(calls);
    try {
      await expect(
        readPhotoBuffer("https://169.254.169.254/latest/meta-data/iam/security-credentials/"),
      ).rejects.toThrow(/external URL/i);
      await expect(
        readPhotoBuffer("https://internal.example/secret.jpg"),
      ).rejects.toThrow(/external URL/i);
      expect(calls).toHaveLength(0); // fetch must never be called
    } finally {
      withBlobToken(false);
    }
  });

  test("rejects external URLs when blob is not configured (nothing we issue is external)", async () => {
    withBlobToken(false);
    const calls: string[] = [];
    stubFetch(calls);
    try {
      await expect(readPhotoBuffer(`${BLOB_URL}/42_x.jpg`)).rejects.toThrow(/external URL/i);
      expect(calls).toHaveLength(0);
    } finally {
      withBlobToken(false);
    }
  });

  test("fetches ONLY URLs on GradeDate's own storage", async () => {
    withBlobToken(true);
    const calls: string[] = [];
    stubFetch(calls);
    try {
      const buf = await readPhotoBuffer(`${BLOB_URL}/anon_3f2a9c1e.jpg`);
      expect(buf.length).toBe(4);
      expect(calls).toHaveLength(1);
      expect(calls[0]).toBe(`${BLOB_URL}/anon_3f2a9c1e.jpg`);
    } finally {
      withBlobToken(false);
    }
  });

  test("rejects local reads outside the uploads directory", async () => {
    const calls: string[] = [];
    stubFetch(calls);
    try {
      await expect(readPhotoBuffer("/etc/passwd")).rejects.toThrow(/uploads directory/i);
      await expect(readPhotoBuffer("/uploads/../etc/passwd")).rejects.toThrow(/uploads directory/i);
      expect(calls).toHaveLength(0);
    } finally {
      withBlobToken(false);
    }
  });
});

// ── 5. deletePhoto: ownership/URL scoping ───────────────────────

describe("deletePhoto scoping", () => {
  test("refuses to delete arbitrary external URLs even when blob is configured", async () => {
    withBlobToken(true);
    try {
      await expect(deletePhoto("https://evil.example/other.jpg")).resolves.toBe(false);
      await expect(deletePhoto("https://169.254.169.254/latest/meta-data/")).resolves.toBe(false);
    } finally {
      withBlobToken(false);
    }
  });

  test("refuses to delete external URLs when blob is not configured", async () => {
    withBlobToken(false);
    await expect(deletePhoto("https://example.com/photo.jpg")).resolves.toBe(false);
    await expect(deletePhoto(`${BLOB_URL}/42_x.jpg`)).resolves.toBe(false);
  });

  test("refuses local paths outside the uploads directory", async () => {
    await expect(deletePhoto("/etc/passwd")).resolves.toBe(false);
    await expect(deletePhoto("/tmp/something.jpg")).resolves.toBe(false);
  });

  test("missing local uploads file reports failure without deleting anything else", async () => {
    await expect(deletePhoto("/uploads/definitely-not-a-real-file-12345.jpg")).resolves.toBe(false);
  });
});

// ── 6. NSFW deletion is ownership-scoped by construction ────────

describe("ownership-scoped NSFW cleanup", () => {
  test("a cross-user path never produces a deletable target", () => {
    const owned = ["/uploads/42_1784575934617_a1.jpg"];
    const submitted = ["/uploads/99_1784575934617_z9.jpg"];
    const resolution = resolveOwnedPhotoPaths(submitted, owned);
    // The request is rejected wholesale: no path list exists for the NSFW
    // loop to delete from, so cleanup can only ever see owned paths.
    expect(resolution.ok).toBe(false);
    if (!resolution.ok) {
      expect(resolution.code).toBe("PHOTO_NOT_OWNED");
    }
  });

  test("the only deletable paths for a valid request are the user's own", () => {
    const owned = ["/uploads/42_a.jpg", "/uploads/42_b.jpg"];
    const resolution = resolveOwnedPhotoPaths(["/uploads/42_a.jpg"], owned);
    expect(resolution.ok).toBe(true);
    if (resolution.ok) {
      for (const p of resolution.paths) expect(owned).toContain(p);
    }
  });
});
