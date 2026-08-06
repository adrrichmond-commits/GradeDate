import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  attachPhotoSources,
  ensurePhotoDataUrls,
  resolveEntryPhotoSrc,
  resolveGradePhotoSrc,
  type GradePhotoEntry,
} from "./grade-photo-source";

/**
 * Regression guard for the owner-reported bug: photos are visible after
 * selection, then instantly disappear into grey/empty boxes when "Get My
 * Grade" is clicked, and stay broken. Root cause on the live site: the
 * grading-state transition (and the single-photo result card) rendered
 * `blob:` object URLs that the site CSP (`img-src 'self' data: https:`)
 * blocks — the img never decodes (naturalWidth 0), so the box renders grey.
 * These tests pin the invariant that every photo `<img>` across the
 * click -> uploading -> analyzing -> results transition resolves to the
 * durable base64 `data:` source whenever one exists, never the blob preview.
 */

// Bun's test runtime has no FileReader (browser-only). The production code
// runs in browsers where it exists; here we install a minimal equivalent so
// ensurePhotoDataUrls' read-await behavior is exercised for real.
if (typeof globalThis.FileReader === "undefined") {
  class FileReaderPolyfill {
    result: string | ArrayBuffer | null = null;
    error: Error | null = null;
    onload: ((this: FileReader, ev: ProgressEvent) => unknown) | null = null;
    onerror: ((this: FileReader, ev: ProgressEvent) => unknown) | null = null;
    onabort: ((this: FileReader, ev: ProgressEvent) => unknown) | null = null;
    readyState = 0;
    readAsDataURL(file: File) {
      const self = this;
      file
        .arrayBuffer()
        .then((buf) => {
          self.result = `data:${file.type || "application/octet-stream"};base64,${Buffer.from(buf).toString("base64")}`;
          self.readyState = 2;
          queueMicrotask(() => self.onload?.call(self, {} as ProgressEvent));
        })
        .catch((err) => {
          self.error = err;
          self.readyState = 2;
          queueMicrotask(() => self.onerror?.call(self, {} as ProgressEvent));
        });
    }
    readAsText() {}
    readAsArrayBuffer() {}
    readAsBinaryString() {}
  }
  (globalThis as Record<string, unknown>).FileReader = FileReaderPolyfill;
}

function makePngFile(name: string): File {
  // Minimal 1x1 PNG (transparent); 8-bit RGBA, no filtering.
  const b64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new File([bytes], name, { type: "image/png" });
}

function makeEntry(name: string, withDataUrl: boolean): GradePhotoEntry {
  const entry: GradePhotoEntry = {
    file: makePngFile(name),
    previewUrl: `blob:https://gradedate.app/${name}`,
  };
  if (withDataUrl) entry.dataUrl = `data:image/png;base64,${name}-base64`;
  return entry;
}

describe("grade photo sources across the click -> results transition", () => {
  test("ensurePhotoDataUrls makes the durable data: source available before grading", async () => {
    const entries = [makeEntry("p1.png", false), makeEntry("p2.png", false)];
    expect(entries.every((e) => !e.dataUrl)).toBe(true);
    const ready = await ensurePhotoDataUrls(entries);
    for (const entry of ready) {
      expect(entry.dataUrl).toMatch(/^data:image\/png;base64,/);
      // The render path must pick the data: URL over the blob preview.
      expect(resolveGradePhotoSrc(entry.dataUrl, entry.previewUrl, entry.photoPath)).toBe(
        entry.dataUrl
      );
    }
  });

  test("idle/uploading/analyzing thumbnails render data: URLs, never blob:", () => {
    const entries = [makeEntry("p1.png", true), makeEntry("p2.png", true)];
    // Every render call site in grade.tsx uses resolveGradePhotoSrc with the
    // dataUrl first — simulate each state's render expression.
    for (const photo of entries) {
      const src = resolveGradePhotoSrc(photo.dataUrl, photo.previewUrl, photo.photoPath);
      expect(src).toBe(photo.dataUrl);
      expect(src.startsWith("blob:")).toBe(false);
      expect(src.startsWith("data:")).toBe(true);
    }
  });

  test("result cards resolve to data: URLs after attachPhotoSources", () => {
    const entries = [makeEntry("p1.png", true), makeEntry("p2.png", true)];
    const grades = [
      { photo_path: "/uploads/anon_p1.png", grade: 7, feedback: "ok", is_best: true },
      { photo_path: "/uploads/anon_p2.png", grade: 5, feedback: "meh", is_best: false },
    ];
    const withSources = attachPhotoSources(grades, entries);
    for (const card of withSources) {
      const src = resolveGradePhotoSrc(card.dataUrl, card.previewUrl, card.photo_path);
      expect(src.startsWith("data:image/png;base64,")).toBe(true);
      expect(src.startsWith("blob:")).toBe(false);
      expect(src).not.toBe(card.photo_path); // dead server path must lose
    }
  });

  test("single-photo result card uses the durable source, not the raw blob preview", () => {
    const photo = makeEntry("solo.png", true);
    // grade.tsx single-photo done card now renders resolveEntryPhotoSrc(photos[0]).
    const src = resolveEntryPhotoSrc(photo);
    expect(src).toBe(photo.dataUrl);
    expect(src.startsWith("blob:")).toBe(false);

    // Without a dataUrl it degrades to preview, but the entry resolver is what
    // renders — no direct `photos[0].previewUrl` <img> usages remain.
    expect(resolveEntryPhotoSrc(makeEntry("noblob.png", false))).toMatch(/^blob:/);
    expect(resolveEntryPhotoSrc(null)).toBe("");
  });

  test("grade.tsx has no render path that reads a photo's previewUrl directly", () => {
    const source = readFileSync(
      join(import.meta.dir, "routes", "grade.tsx"),
      "utf8"
    );
    // Direct <img src={...previewUrl} usages (blob-only) are exactly the bug
    // class that greyed out photos on CSP deployments without blob:.
    const directUsages = source.match(/src=\{[\w[\]?.]*\.previewUrl\}/g) ?? [];
    expect(directUsages).toEqual([]);
  });
});
