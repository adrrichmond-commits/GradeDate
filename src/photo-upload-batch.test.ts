import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { InMemoryPrivateReviewProvider, configurePrivateReviewProvider } from "./private-review-provider";
import type { PrivateReviewProvider } from "./private-review-storage";
import type { PhotoScanResult } from "./photo-moderation";

/**
 * Multi-file photo upload correctness (QA session 5b4848bb, step 7 findings):
 * (b) sort_order double-counted on multi-file batches (0,2,4,6,8 instead of
 *     0..4) because the loop used `photoCount + uploadResults.length` while
 *     re-fetching the count every iteration;
 * (c) users.photo_path ended up pointing at the LAST photo of a batch instead
 *     of the primary/first, because the loop reused a stale `user` object
 *     (!user.photo_path was true for every file), and the response reported
 *     stale is_primary:false for the just-primed photo.
 *
 * Fixed: the pre-batch photo count is snapshotted once; sort_order =
 * baseCount + per-iteration index; the primary is set only for the first photo
 * of a batch that starts a photo-less profile (setPrimaryPhoto also syncs
 * users.photo_path to it) and its return value feeds the response's is_primary
 * flag. The server size cap is now 4 MB (matching the client cap and staying
 * under Vercel's ~4.5 MB function-payload ceiling).
 */
const apiSource = readFileSync(new URL("./api-handler.ts", import.meta.url), "utf8");
const dbImportMatch = apiSource.match(/import \{([^}]*)\} from "\.\.\/src\/db\.ts"/);
if (!dbImportMatch) throw new Error("could not locate db import block in api-handler.ts");
const DB_IMPORT_NAMES = dbImportMatch[1]
  .split(",")
  .map((s) => s.trim().replace(/^type\s+/, ""))
  .filter(Boolean);

// ── Shared mutable state the mocks read/write ─────────────────
const USER_ID = 900;
interface MockPhoto {
  id: number;
  user_id: number;
  photo_path: string;
  sort_order: number;
  is_primary: boolean;
}
const photosByUser = new Map<number, MockPhoto[]>();
const usersById = new Map<number, Record<string, unknown>>();
const sessions = new Map<string, { id: string; user_id: number; revoked_at: string | null }>();
let photoSeq = 1;
let addPhotoCalls: Array<{ sortOrder: number; path: string }> = [];
// Durable-moderation harness: records the moderation DB calls made by the
// upload path (see the "durable post-upload photo moderation" describe below).
let moderationCalls: Array<{ fn: string; args: unknown[] }> = [];
let profileUpdates: Array<{ fields: Record<string, unknown> }> = [];

function baseUser(photoPath: string | null): Record<string, unknown> {
  return {
    id: USER_ID,
    email: "upload@gradedate.test",
    password_hash: "hash",
    display_name: "Tester",
    age: 25,
    gender: "woman",
    looking_for: "everyone",
    bio: "hi",
    photo_path: photoPath,
    grade: null,
    subscription_status: "active",
    subscription_updated_at: null,
    subscription_expires_at: "2099-01-01T00:00:00Z",
    stripe_customer_id: null,
    stripe_subscription_id: "sub_x",
    verification_status: "verified",
    verification_session_id: null,
    verification_verified_at: null,
    verification_session_created_at: null,
    regrades_available: 0,
    boost_until: null,
    date_of_birth: "2000-01-01",
    latitude: null,
    longitude: null,
    max_distance: 50,
    location_city: null,
    location_state: null,
    daily_likes_remaining: 3,
    daily_likes_reset_at: null,
    last_free_regrade_at: null,
    percentile: null,
    percentile_city: null,
    like_packs: 0,
    role: "user",
    suspended_until: null,
    suspension_reason: null,
    is_founder: false,
    founder_number: null,
    founder_price_lock_price_id: null,
  };
}

function seedPhotos(count: number): void {
  const list: MockPhoto[] = [];
  for (let i = 0; i < count; i++) {
    list.push({
      id: photoSeq++,
      user_id: USER_ID,
      photo_path: `/blobs/existing-${i}.jpg`,
      sort_order: i,
      is_primary: i === 0,
    });
  }
  photosByUser.set(USER_ID, list);
  usersById.set(USER_ID, baseUser(count > 0 ? list[0].photo_path : null));
}

function resetState(): void {
  photosByUser.clear();
  usersById.clear();
  sessions.clear();
  photoSeq = 1;
  addPhotoCalls = [];
  profileUpdates = [];
  moderationCalls = [];
  sessions.set("s_up", { id: "s_up", user_id: USER_ID, revoked_at: null });
}

function makeDbMock(): Record<string, unknown> {
  const mock: Record<string, unknown> = {};
  for (const name of DB_IMPORT_NAMES) mock[name] = async () => undefined;
  return {
    ...mock,
    getSessionById: async (id: string) => sessions.get(id) ?? null,
    getUserById: async (id: number) => usersById.get(id) ?? null,
    getUserPhotoCount: async (userId: number) => photosByUser.get(userId)?.length ?? 0,
    addUserPhoto: async (userId: number, photoPath: string, sortOrder: number) => {
      addPhotoCalls.push({ sortOrder, path: photoPath });
      const photo: MockPhoto = {
        id: photoSeq++,
        user_id: userId,
        photo_path: photoPath,
        sort_order: sortOrder,
        is_primary: false,
      };
      const list = photosByUser.get(userId) ?? [];
      list.push(photo);
      photosByUser.set(userId, list);
      return photo;
    },
    setPrimaryPhoto: async (userId: number, photoId: number) => {
      const list = photosByUser.get(userId) ?? [];
      for (const p of list) p.is_primary = p.id === photoId;
      const photo = list.find((p) => p.id === photoId) ?? null;
      const u = usersById.get(userId);
      if (photo && u) u.photo_path = photo.photo_path;
      return photo;
    },
    updateUserProfile: async (userId: number, fields: Record<string, unknown>) => {
      profileUpdates.push({ fields });
      const u = usersById.get(userId);
      if (u && typeof fields.photo_path === "string") u.photo_path = fields.photo_path;
      void userId;
    },
    // ── Durable-moderation harness (recording) ─────────────────────────────
    upsertModerationFlag: async (photoId: number, userId: number, flagType: string, confidence: number | null, providerRef: string | null, status = "new") => {
      moderationCalls.push({ fn: "upsertModerationFlag", args: [photoId, userId, flagType, confidence, providerRef, status] });
      return { id: "flag-1", photo_id: photoId, user_id: userId, flag_type: flagType, confidence, provider_ref: providerRef, status, created_at: "2026-08-01T00:00:00Z" };
    },
    getPhotoModerationCaseForPhoto: async () => null,
    createPhotoModerationCase: async (photoId: number, userId: number, source: string, result = "unknown", reason?: string | null) => {
      moderationCalls.push({ fn: "createPhotoModerationCase", args: [photoId, userId, source, result, reason ?? null] });
      return { id: `case-${photoId}`, photo_id: photoId, user_id: userId, status: "pending", source, result, reason: reason ?? result, private_object_key: null, retention_until: "2026-09-01T00:00:00Z" };
    },
    attachPrivatePhotoObject: async (caseId: string, objectKey: string, contentType: string) => {
      moderationCalls.push({ fn: "attachPrivatePhotoObject", args: [caseId, objectKey, contentType] });
      return { id: caseId };
    },
    transitionPhotoModerationCase: async (id: string, status: string, actorId: number, result?: string) => {
      moderationCalls.push({ fn: "transitionPhotoModerationCase", args: [id, status, actorId, result ?? null] });
      return { id, status, result: result ?? null };
    },
    createSuspension: async () => {
      moderationCalls.push({ fn: "createSuspension", args: [] });
      return { id: "susp-1" };
    },
  };
}
mock.module("../src/db.ts", () => makeDbMock());
// blob-store is mocked with every export the real module provides: other
// modules in the import chain (photo-moderation, photo-quarantine, etc.)
// import helpers like isAllowedStorageUrl from it, and bun's mock.module can
// leak into sibling test files run in the same process.
mock.module("../src/blob-store.ts", () => ({
  _resetBlobStoreWarningStateForTests: () => {},
  isVercelBlob: () => false,
  isExternalUrl: (p: string) => /^https?:\/\//.test(p),
  configuredStorageOrigins: () => [],
  isAllowedStorageUrl: () => false,
  isStoragePhotoPath: (p: string) => p.startsWith("/blobs/"),
  uploadsDir: () => "/tmp/uploads",
  storePhoto: async (filename: string) => `/blobs/${filename}`,
  readPhotoBuffer: async () => new Uint8Array(0),
  deletePhoto: async () => true,
  listBlobs: async () => [],
}));

const ORIGINAL_STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
let handleApiRoute: (req: Request) => Promise<Response | null>;
// Loaded dynamically AFTER mock.module("../src/db.ts") registers, so api-handler
// binds to the mocked db module (same convention as handleApiRoute).
let setPhotoScannerForTesting: (fn: ((bytes: Uint8Array, contentType: string) => Promise<PhotoScanResult>) | null) => void;

beforeAll(async () => {
  process.env.STRIPE_SECRET_KEY = "sk_test_mock";
  ({ handleApiRoute, setPhotoScannerForTesting } = await import("./api-handler"));
  resetState();
});
afterAll(() => {
  if (ORIGINAL_STRIPE_KEY === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = ORIGINAL_STRIPE_KEY;
});

// ── Request helpers ───────────────────────────────────────────
const CSRF = "csrf-upload-batch-test";
let reqSeq = 0;
function freshIp(): string {
  reqSeq++;
  return `192.0.2.${(reqSeq % 200) + 10}`;
}

function uploadRequest(files: File[], ip?: string): Request {
  const form = new FormData();
  for (const f of files) form.append("photo", f);
  return new Request("https://gradedate.test/api/upload", {
    method: "POST",
    headers: {
      "x-forwarded-for": ip ?? freshIp(),
      cookie: `csrf_token=${CSRF}; session_id=s_up`,
      "X-CSRF-Token": CSRF,
    },
    body: form,
  });
}

function makeImageFile(bytes: number, name: string): File {
  return new File([new Uint8Array(bytes)], name, { type: "image/jpeg" });
}

// ── Tests ─────────────────────────────────────────────────────
describe("multi-file upload batches (QA step 7 findings b/c)", () => {
  beforeEach(() => resetState());

  test("a 5-photo batch on a photo-less user gets sort_order 0..4, photo_path = first new photo, accurate is_primary", async () => {
    seedPhotos(0);
    const res = await handleApiRoute(
      uploadRequest([
        makeImageFile(1024, "a.jpg"),
        makeImageFile(1024, "b.jpg"),
        makeImageFile(1024, "c.jpg"),
        makeImageFile(1024, "d.jpg"),
        makeImageFile(1024, "e.jpg"),
      ]),
    );
    expect(res!.status).toBe(200);
    const data = (await res!.json()) as {
      photos: Array<{ sort_order: number; is_primary: boolean; photo_path: string }>;
    };
    // (b) sequential sort_order, not 0,2,4,6,8
    expect(data.photos.map((p) => p.sort_order)).toEqual([0, 1, 2, 3, 4]);
    // (c) the response reports the fresh primary state, not stale false
    expect(data.photos.map((p) => p.is_primary)).toEqual([true, false, false, false, false]);
    // users.photo_path points at the FIRST (primary) new photo, not the last
    expect(usersById.get(USER_ID)!.photo_path).toBe(data.photos[0].photo_path);
    expect(data.photos[0].photo_path).not.toBe(data.photos[4].photo_path);
    // addUserPhoto saw sequential sort orders
    expect(addPhotoCalls.map((c) => c.sortOrder)).toEqual([0, 1, 2, 3, 4]);
    // No redundant photo_path write via updateUserProfile inside the loop
    expect(profileUpdates.filter((u) => u.fields.photo_path !== undefined)).toHaveLength(0);
  });

  test("a batch on a user with existing photos appends after them and keeps the existing primary", async () => {
    seedPhotos(2);
    const res = await handleApiRoute(
      uploadRequest([
        makeImageFile(1024, "f.jpg"),
        makeImageFile(1024, "g.jpg"),
        makeImageFile(1024, "h.jpg"),
      ]),
    );
    expect(res!.status).toBe(200);
    const data = (await res!.json()) as {
      photos: Array<{ sort_order: number; is_primary: boolean }>;
    };
    // New photos append after the two pre-existing ones (2,3,4), never 2,4,6.
    expect(data.photos.map((p) => p.sort_order)).toEqual([2, 3, 4]);
    expect(data.photos.every((p) => p.is_primary === false)).toBe(true);
    // Existing primary untouched; users.photo_path unchanged.
    expect(usersById.get(USER_ID)!.photo_path).toBe("/blobs/existing-0.jpg");
    expect(profileUpdates.filter((u) => u.fields.photo_path !== undefined)).toHaveLength(0);
  });

  test("single-photo upload still works and primes the profile", async () => {
    seedPhotos(0);
    const res = await handleApiRoute(uploadRequest([makeImageFile(1024, "solo.jpg")]));
    expect(res!.status).toBe(200);
    const data = (await res!.json()) as {
      photos: Array<{ sort_order: number; is_primary: boolean; photo_path: string }>;
    };
    expect(data.photos).toHaveLength(1);
    expect(data.photos[0].sort_order).toBe(0);
    expect(data.photos[0].is_primary).toBe(true);
    expect(usersById.get(USER_ID)!.photo_path).toBe(data.photos[0].photo_path);
  });

  test("the batch is rejected when it would exceed the 6-photo cap", async () => {
    seedPhotos(4);
    const res = await handleApiRoute(
      uploadRequest([
        makeImageFile(1024, "i.jpg"),
        makeImageFile(1024, "j.jpg"),
        makeImageFile(1024, "k.jpg"),
      ]),
    );
    expect(res!.status).toBe(400);
    expect(((await res!.json()) as Record<string, unknown>).error).toBe(
      "Maximum 6 photos allowed. Please delete one first.",
    );
  });
});

describe("server-side size cap stays consistent with the client cap", () => {
  beforeEach(() => resetState());

  test("a file larger than 4 MB is rejected with the truthful message", async () => {
    seedPhotos(0);
    const res = await handleApiRoute(
      uploadRequest([makeImageFile(4 * 1024 * 1024 + 1, "big.jpg")]),
    );
    expect(res!.status).toBe(400);
    expect(((await res!.json()) as Record<string, unknown>).error).toBe(
      "Photo must be under 4 MB",
    );
  });

  test("a file at exactly 4 MB is accepted", async () => {
    seedPhotos(0);
    const res = await handleApiRoute(uploadRequest([makeImageFile(4 * 1024 * 1024, "ok.jpg")]));
    expect(res!.status).toBe(200);
    expect(usersById.get(USER_ID)!.photo_path).toContain("/blobs/");
  });
});

describe("upload batch source wiring", () => {
  test("the upload handler snapshots the photo count once per batch", () => {
    expect(apiSource).toContain("const basePhotoCount = user ? await getUserPhotoCount(user.id) : 0;");
  });
  test("sort_order is derived from the base count plus a per-iteration index", () => {
    expect(apiSource).toContain("const sortOrder = basePhotoCount + index;");
  });
  test("primary is set only for the first photo of a photo-less batch", () => {
    expect(apiSource).toContain("if (basePhotoCount === 0 && index === 0) {");
  });
  test("the stale photo_path update inside the loop is gone", () => {
    const uploadBlock = apiSource.slice(
      apiSource.indexOf("async function handleUpload"),
      apiSource.indexOf("async function handleUpdateProfile"),
    );
    expect(uploadBlock).not.toContain("!user.photo_path");
    expect(uploadBlock).not.toContain("photoCount + uploadResults.length");
  });
  test("server MAX_FILE_SIZE is 4 MB with matching copy", () => {
    expect(apiSource).toContain("const MAX_FILE_SIZE = 4 * 1024 * 1024;");
    expect(apiSource).toContain('"Photo must be under 4 MB"');
    expect(apiSource).not.toContain("Photo must be under 10 MB");
  });
});
describe("durable post-upload photo moderation (serverless-freeze fix)", () => {
  // Proves the upload response is only sent AFTER the moderation chain
  // (scan -> flag -> case -> quarantine attach -> quarantined transition) has
  // durably persisted, so a serverless function freeze can no longer strand a
  // flagged photo in pending-without-key limbo. A scanner seam replaces the
  // provider round-trip (the seam is the repo's injectable-testing convention;
  // a real HTTP scan would fight other test files' global fetch stubs), and
  // the in-memory private review store stands in for the private blob store.
  const ENV_KEYS = ["GRADEDATE_PRIVATE_REVIEW_STORAGE", "GRADEDATE_REVIEW_SIGNING_KEY", "PRIVATE_BLOB_READ_WRITE_TOKEN"];
  const savedEnv: Record<string, string | undefined> = {};
  let scanClassification: PhotoScanResult = { classification: "nsfw", confidence: 0.9, providerRef: "test-scan" };
  const memProvider = new InMemoryPrivateReviewProvider();

  beforeAll(() => {
    for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
    process.env.GRADEDATE_PRIVATE_REVIEW_STORAGE = "true";
    process.env.GRADEDATE_REVIEW_SIGNING_KEY = "s".repeat(64);
    process.env.PRIVATE_BLOB_READ_WRITE_TOKEN = "t";
    setPhotoScannerForTesting(async () => scanClassification);
    configurePrivateReviewProvider(memProvider);
  });
  afterAll(() => {
    setPhotoScannerForTesting(null);
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
    configurePrivateReviewProvider(null);
  });

  beforeEach(() => {
    resetState();
    moderationCalls = [];
    scanClassification = { classification: "nsfw", confidence: 0.9, providerRef: "test-scan" };
    configurePrivateReviewProvider(memProvider);
  });

  test("upload responds only after the moderation chain is durably persisted", async () => {
    seedPhotos(0);
    const res = await handleApiRoute(uploadRequest([makeImageFile(1024, "flag.jpg")]));
    expect(res!.status).toBe(200);
    // The full chain completed BEFORE the response: flag -> case -> quarantine
    // attach -> quarantined transition, in order, with no fire-and-forget gap.
    const order = moderationCalls.map((c) => c.fn);
    expect(order).toEqual([
      "upsertModerationFlag",
      "createPhotoModerationCase",
      "attachPrivatePhotoObject",
      "transitionPhotoModerationCase",
    ]);
    const created = moderationCalls.find((c) => c.fn === "createPhotoModerationCase")!;
    expect(created.args[2]).toBe("automated_photo_scan");
    const attach = moderationCalls.find((c) => c.fn === "attachPrivatePhotoObject")!;
    // The quarantine object key is case-bound and the bytes really landed in the
    // private review store (in-memory provider), not just the DB columns.
    expect(attach.args[0]).toBe(`case-${created.args[0]}`);
    expect(String(attach.args[1])).toBe(`quarantine/case-${created.args[0]}/${created.args[0]}`);
    expect(await memProvider.get(String(attach.args[1]))).toBeDefined();
    const transition = moderationCalls.find((c) => c.fn === "transitionPhotoModerationCase")!;
    expect(transition.args[1]).toBe("quarantined");
    // nsfw flags quarantine but never auto-suspend.
    expect(moderationCalls.some((c) => c.fn === "createSuspension")).toBe(false);
  });

  test("a zero-tolerance scan quarantines AND suspends; the upload still succeeds", async () => {
    seedPhotos(0);
    scanClassification = { classification: "csam_or_underage", confidence: 0.99, providerRef: "test-scan" };
    const res = await handleApiRoute(uploadRequest([makeImageFile(1024, "csam.jpg")]));
    expect(res!.status).toBe(200);
    expect(moderationCalls.map((c) => c.fn)).toEqual([
      "upsertModerationFlag",
      "createPhotoModerationCase",
      "attachPrivatePhotoObject",
      "transitionPhotoModerationCase",
      "createSuspension",
    ]);
  });

  test("a private-store quarantine failure keeps the durable pending case and still returns 200", async () => {
    seedPhotos(0);
    const throwingProvider: PrivateReviewProvider = {
      put: async () => { throw new Error("store down"); },
      get: async () => new Uint8Array(),
      delete: async () => {},
    };
    configurePrivateReviewProvider(throwingProvider);
    const res = await handleApiRoute(uploadRequest([makeImageFile(1024, "store-down.jpg")]));
    expect(res!.status).toBe(200);
    // The durable job row (flag + case) is written; quarantine attach/transition
    // did not run, and the pending-without-key row is purge-eligible after the
    // 30-day retention window (see retention-cleanup.ts).
    expect(moderationCalls.map((c) => c.fn)).toEqual(["upsertModerationFlag", "createPhotoModerationCase"]);
  });

  test("clean scans create no moderation state and the upload is not slowed by quarantine", async () => {
    seedPhotos(0);
    scanClassification = { classification: "clean", confidence: 1, providerRef: null };
    const res = await handleApiRoute(uploadRequest([makeImageFile(1024, "clean.jpg")]));
    expect(res!.status).toBe(200);
    expect(moderationCalls).toEqual([]);
  });
});
