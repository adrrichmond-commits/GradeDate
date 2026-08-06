import { describe, expect, test } from "bun:test";
import {
  attachPhotoSources,
  ensurePhotoDataUrls,
  fileToDataUrl,
  resolveGradePhotoSrc,
} from "./grade-photo-source";

// bun's test runtime has no FileReader global; provide a minimal polyfill so
// fileToDataUrl (and therefore the submit->results transition) is exercised.
if (typeof FileReader === "undefined") {
  (globalThis as unknown as Record<string, unknown>).FileReader = class {
    result: string | ArrayBuffer | null = null;
    error: Error | null = null;
    onload: (() => void) | null = null;
    onerror: ((err: unknown) => void) | null = null;
    readAsDataURL(file: File) {
      file
        .arrayBuffer()
        .then((buf) => {
          const bytes = new Uint8Array(buf);
          let bin = "";
          bytes.forEach((b) => {
            bin += String.fromCharCode(b);
          });
          this.result = `data:image/jpeg;base64,${btoa(bin)}`;
          this.onload?.();
        })
        .catch((err: unknown) => {
          this.error = err instanceof Error ? err : new Error(String(err));
          this.onerror?.(this.error);
        });
    }
  };
}

describe("resolveGradePhotoSrc", () => {
  test("prefers the durable data URL over the blob preview and server path", () => {
    expect(
      resolveGradePhotoSrc(
        "data:image/png;base64,AAA",
        "blob:https://example.com/1",
        "/uploads/anon_a.png"
      )
    ).toBe("data:image/png;base64,AAA");
  });

  test("falls back to the blob preview URL when no data URL is ready yet", () => {
    expect(
      resolveGradePhotoSrc("", "blob:https://example.com/1", "/uploads/anon_a.png")
    ).toBe("blob:https://example.com/1");
    expect(
      resolveGradePhotoSrc(undefined, "blob:https://example.com/1", "/uploads/anon_a.png")
    ).toBe("blob:https://example.com/1");
  });

  test("falls back to the server photo path when no client-side source exists", () => {
    expect(resolveGradePhotoSrc("", "", "/uploads/anon_a.png")).toBe(
      "/uploads/anon_a.png"
    );
  });

  test("returns an empty string when nothing is available", () => {
    expect(resolveGradePhotoSrc("", "", "")).toBe("");
    expect(resolveGradePhotoSrc(undefined, undefined, undefined)).toBe("");
    expect(resolveGradePhotoSrc(null, null, null)).toBe("");
  });
});

describe("result source retention", () => {
  test("keeps each result card tied to its own durable source", () => {
    const results = [
      { dataUrl: "data:image/jpeg;base64,ONE", previewUrl: "blob:one", photo_path: "/uploads/one" },
      { dataUrl: "data:image/jpeg;base64,TWO", previewUrl: "blob:two", photo_path: "/uploads/two" },
    ];
    expect(results.map((result) =>
      resolveGradePhotoSrc(result.dataUrl, result.previewUrl, result.photo_path)
    )).toEqual(["data:image/jpeg;base64,ONE", "data:image/jpeg;base64,TWO"]);
  });

  test("does not replace a durable result source when the preview state is stale", () => {
    expect(resolveGradePhotoSrc("data:image/png;base64,RESULT", "", "/uploads/deleted")).toBe(
      "data:image/png;base64,RESULT"
    );
  });
});

describe("submit -> results transition (regression)", () => {
  // Models the exact grade.tsx submit flow: snapshot durable sources before
  // upload, then attach them to the server grade records right before the
  // results state is committed. The result card must end up with a data URL
  // even when its blob preview is CSP-blocked and its server path is deleted.
  function makeFile(name: string, marker: string): File {
    // A valid-enough image payload for FileReader -> data: URL purposes.
    const bytes = new TextEncoder().encode(marker);
    return new File([bytes], name, { type: "image/jpeg" });
  }

  test("anonymous flow: dataUrl survives into the result card", async () => {
    const photos = [
      { file: makeFile("a.jpg", "AAA"), previewUrl: "blob:https://x/1" },
      { file: makeFile("b.jpg", "BBB"), previewUrl: "blob:https://x/2" },
    ];
    // submit: snapshot durable sources BEFORE grading starts
    const photosForGrade = await ensurePhotoDataUrls(photos);
    expect(photosForGrade[0].dataUrl).toMatch(/^data:image\/jpeg;base64,/);
    expect(photosForGrade[1].dataUrl).toMatch(/^data:image\/jpeg;base64,/);
    // server grades come back with dead /uploads paths (upload deleted)
    const grades = [
      { photo_path: "/uploads/anon_a.jpg", grade: 7, feedback: "ok", is_best: true },
      { photo_path: "/uploads/anon_b.jpg", grade: 5, feedback: "ok", is_best: false },
    ];
    // results commit
    const results = attachPhotoSources(grades, photosForGrade);
    results.forEach((r, i) => {
      // CSP blocks blob: and the server path is dead; the data URL must win
      expect(resolveGradePhotoSrc(r.dataUrl, r.previewUrl, r.photo_path)).toBe(
        photosForGrade[i].dataUrl
      );
      expect(r.dataUrl).toMatch(/^data:image\/jpeg;base64,/);
    });
  });

  test("authenticated flow: dataUrl is attached too (no blob dependency)", async () => {
    const photos = [
      { file: makeFile("a.jpg", "AAA"), previewUrl: "blob:https://x/1" },
    ];
    const photosForGrade = await ensurePhotoDataUrls(photos);
    const grades = [
      { photo_path: "/uploads/user_a.jpg", grade: 8, feedback: "ok", is_best: true },
    ];
    const results = attachPhotoSources(grades, photosForGrade);
    expect(results[0].dataUrl).toMatch(/^data:image\/jpeg;base64,/);
    expect(resolveGradePhotoSrc(results[0].dataUrl, results[0].previewUrl, results[0].photo_path))
      .toMatch(/^data:image\/jpeg;base64,/);
  });

  test("reuses an already-snapped dataUrl without re-reading the file", async () => {
    const entry = {
      file: makeFile("a.jpg", "AAA"),
      previewUrl: "blob:https://x/1",
      dataUrl: "data:image/jpeg;base64,EXISTING",
    };
    const out = await ensurePhotoDataUrls([entry]);
    expect(out[0].dataUrl).toBe("data:image/jpeg;base64,EXISTING");
  });

  test("graceful when FileReader fails: falls back to preview/path, never crashes", async () => {
    const photos = [{ file: makeFile("a.jpg", "AAA"), previewUrl: "blob:https://x/1" }];
    const results = attachPhotoSources(
      [{ photo_path: "/uploads/deleted.jpg", grade: 6, feedback: "ok", is_best: true }],
      photos // no dataUrl available
    );
    expect(resolveGradePhotoSrc(results[0].dataUrl, results[0].previewUrl, results[0].photo_path))
      .toBe("blob:https://x/1");
  });
});
