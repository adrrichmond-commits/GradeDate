import { afterEach, describe, expect, test } from "bun:test";
import { setLogLevel, setLogSink, type LogSink } from "./observability";
import { isVercelBlob, deletePhoto } from "./blob-store";
import { sendPasswordResetEmail } from "./email";
import {
  sweepBlobAnonUploads,
  type BlobSweepBackend,
} from "./anon-upload-retention";

/**
 * Representative business-event coverage: exercises the converted log sites in
 * blob-store, email, and anon-upload-retention (no database or network needed)
 * and asserts the emitted JSON uses the stable EVENTS names. DB-backed events
 * (grade/stripe/match/chat) are covered by code review + the events registry
 * test in observability.test.ts.
 */

let captured: string[] = [];
const sink: LogSink = (line) => captured.push(line);

afterEach(() => {
  setLogSink(null);
  setLogLevel("info");
});

function capture() {
  captured = [];
  setLogSink(sink);
  setLogLevel("debug");
}

function emittedEvents(): string[] {
  return captured.map((line) => (JSON.parse(line) as { event: string }).event);
}

describe("blob-store events", () => {
  test("emits blob_store.token_missing when blob token is unset", () => {
    capture();
    const prev = process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    try {
      isVercelBlob();
    } finally {
      if (prev !== undefined) process.env.BLOB_READ_WRITE_TOKEN = prev;
    }
    expect(emittedEvents()).toContain("blob_store.token_missing");
  });

  test("emits blob_store.delete_failed for a missing local file", async () => {
    capture();
    await deletePhoto("/uploads/definitely-not-there-12345.jpg");
    expect(emittedEvents()).toContain("blob_store.delete_failed");
  });
});

describe("email events", () => {
  test("emits email.provider_unconfigured when RESEND_API_KEY is unset", async () => {
    capture();
    const prev = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    try {
      await sendPasswordResetEmail("someone@example.com", "https://x.test/r");
    } finally {
      if (prev !== undefined) process.env.RESEND_API_KEY = prev;
    }
    expect(emittedEvents()).toContain("email.provider_unconfigured");
  });
});

describe("anon-upload-retention events", () => {
  test("emits anon_retention.list_failed when list throws", async () => {
    capture();
    const backend: BlobSweepBackend = {
      list: async () => {
        throw new Error("list boom");
      },
      del: async () => {},
    };
    await sweepBlobAnonUploads(24 * 60 * 60 * 1000, Date.now(), backend);
    expect(emittedEvents()).toContain("anon_retention.list_failed");
  });

  test("emits anon_retention.delete_failed when del throws", async () => {
    capture();
    const backend: BlobSweepBackend = {
      list: async () => [
        { url: "https://blob.example/anon_old.jpg", uploadedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
      ],
      del: async () => {
        throw new Error("del boom");
      },
    };
    await sweepBlobAnonUploads(24 * 60 * 60 * 1000, Date.now(), backend);
    expect(emittedEvents()).toContain("anon_retention.delete_failed");
  });

  test("sweepBlobAnonUploads returns the deleted count", async () => {
    const backend: BlobSweepBackend = {
      list: async () => [
        { url: "https://blob.example/anon_expired.jpg", uploadedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
        { url: "https://blob.example/anon_fresh.jpg", uploadedAt: new Date(Date.now() - 60 * 1000) },
      ],
      del: async () => {},
    };
    const count = await sweepBlobAnonUploads(24 * 60 * 60 * 1000, Date.now(), backend);
    expect(count).toBe(1);
  });

  test("logged URLs never contain blob filenames or tokens", async () => {
    capture();
    const backend: BlobSweepBackend = {
      list: async () => [
        { url: "https://blob.example/anon_123e4567-e89b-12d3-a456-426614174000.jpg", uploadedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
      ],
      del: async () => {
        throw new Error("del boom");
      },
    };
    await sweepBlobAnonUploads(24 * 60 * 60 * 1000, Date.now(), backend);
    expect(emittedEvents()).toContain("anon_retention.delete_failed");
    const blob = captured.join(" ");
    expect(blob).not.toContain("123e4567-e89b-12d3-a456-426614174000");
    expect(blob).not.toContain(".jpg");
  });
});
