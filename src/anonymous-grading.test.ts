import { describe, expect, test } from "bun:test";
import {
  ANON_MAX_PHOTOS,
  composeAnonymousGrades,
  composeAnonymousGradingMethod,
  gradeAnonymousPhotos,
  type AnonymousPerPhotoGrade,
} from "./anonymous-grading";

describe("composeAnonymousGrades", () => {
  test("marks the highest grade as best", () => {
    const results: AnonymousPerPhotoGrade[] = [
      { photo_path: "a.jpg", grade: 6, analysis: "Smile more", grading_method: "ai" },
      { photo_path: "b.jpg", grade: 8, analysis: "Better lighting", grading_method: "ai" },
      { photo_path: "c.jpg", grade: 4, analysis: "Crop closer", grading_method: "ai" },
    ];
    const grades = composeAnonymousGrades(results);
    expect(grades.map((g) => g.is_best)).toEqual([false, true, false]);
    expect(grades[1].grade).toBe(8);
  });

  test("first highest grade wins on ties", () => {
    const results: AnonymousPerPhotoGrade[] = [
      { photo_path: "a.jpg", grade: 7, analysis: null, grading_method: "ai" },
      { photo_path: "b.jpg", grade: 7, analysis: null, grading_method: "ai" },
    ];
    const grades = composeAnonymousGrades(results);
    expect(grades[0].is_best).toBe(true);
    expect(grades[1].is_best).toBe(false);
  });

  test("carries analysis over as feedback", () => {
    const results: AnonymousPerPhotoGrade[] = [
      { photo_path: "a.jpg", grade: 5, analysis: "Try outdoor lighting", grading_method: "ai" },
    ];
    const grades = composeAnonymousGrades(results);
    expect(grades[0].feedback).toBe("Try outdoor lighting");
  });

  test("falls back to the honest simulated copy when analysis is missing", () => {
    const results: AnonymousPerPhotoGrade[] = [
      { photo_path: "a.jpg", grade: 5, analysis: null, grading_method: "mock" },
    ];
    const grades = composeAnonymousGrades(results);
    expect(grades[0].feedback.toLowerCase()).toContain("simulated");
    expect(grades[0].feedback.toLowerCase()).toContain("unavailable");
  });

  test("clamps grades to 1-10", () => {
    const results: AnonymousPerPhotoGrade[] = [
      { photo_path: "a.jpg", grade: 99, analysis: null, grading_method: "ai" },
      { photo_path: "b.jpg", grade: -3, analysis: null, grading_method: "ai" },
    ];
    const grades = composeAnonymousGrades(results);
    expect(grades[0].grade).toBe(10);
    expect(grades[1].grade).toBe(1);
  });

  test("returns an empty array for no results", () => {
    expect(composeAnonymousGrades([])).toEqual([]);
  });
});

describe("composeAnonymousGradingMethod", () => {
  test("all ai reports ai", () => {
    expect(composeAnonymousGradingMethod(["ai", "ai", "ai"])).toBe("ai");
  });
  test("all mock reports mock", () => {
    expect(composeAnonymousGradingMethod(["mock", "mock"])).toBe("mock");
  });
  test("a mix reports mixed", () => {
    expect(composeAnonymousGradingMethod(["ai", "mock"])).toBe("mixed");
  });
  test("empty input reports mock", () => {
    expect(composeAnonymousGradingMethod([])).toBe("mock");
  });
});

describe("gradeAnonymousPhotos", () => {
  const okResponse = (body: unknown): Response =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  test("grades each photo via /api/grade with the photo_path body and CSRF header", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchFn = async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const body = JSON.parse(String(init.body)) as { photo_path: string };
      return okResponse({
        grade: body.photo_path === "a.jpg" ? 7 : 4,
        analysis: "Tip for " + body.photo_path,
        grading_method: "ai",
      });
    };

    const result = await gradeAnonymousPhotos(["a.jpg", "b.jpg"], "tok-123", fetchFn as typeof fetch);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe("/api/grade");
    expect(calls[1].url).toBe("/api/grade");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ photo_path: "a.jpg" });
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ photo_path: "b.jpg" });
    expect(calls.every((c) => (c.init.headers as Record<string, string>)["X-CSRF-Token"] === "tok-123")).toBe(true);

    expect(result.grades.map((g) => g.grade)).toEqual([7, 4]);
    expect(result.grades[0].is_best).toBe(true);
    expect(result.grading_method).toBe("ai");
    expect(result.grades[0].feedback).toBe("Tip for a.jpg");
  });

  test("never grades more than ANON_MAX_PHOTOS", async () => {
    let callCount = 0;
    const paths = Array.from({ length: ANON_MAX_PHOTOS + 2 }, (_, i) => `p${i}.jpg`);
    const fetchFn = async () => {
      callCount++;
      return okResponse({ grade: 5, analysis: null, grading_method: "ai" });
    };

    const result = await gradeAnonymousPhotos(paths, "", fetchFn as typeof fetch);

    expect(result.ok).toBe(true);
    expect(callCount).toBe(ANON_MAX_PHOTOS);
  });

  test("stops at the first NSFW response and reports the nsfw kind", async () => {
    const calls: string[] = [];
    const fetchFn = async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { photo_path: string };
      calls.push(body.photo_path);
      if (body.photo_path === "bad.jpg") {
        return new Response(
          JSON.stringify({ error: "Inappropriate content", code: "NSFW" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
      return okResponse({ grade: 6, analysis: "ok", grading_method: "ai" });
    };

    const result = await gradeAnonymousPhotos(["a.jpg", "bad.jpg", "c.jpg"], "tok", fetchFn as typeof fetch);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("nsfw");
    expect(result.message).toContain("Inappropriate content");
    // Stopped early: the third photo was never graded
    expect(calls).toEqual(["a.jpg", "bad.jpg"]);
  });

  test("stops at a server error and surfaces the server message", async () => {
    let callCount = 0;
    const fetchFn = async () => {
      callCount++;
      if (callCount === 2) {
        return new Response(JSON.stringify({ error: "Too many requests. Please try again later." }), {
          status: 429,
          headers: { "Content-Type": "application/json" },
        });
      }
      return okResponse({ grade: 6, analysis: "ok", grading_method: "ai" });
    };

    const result = await gradeAnonymousPhotos(["a.jpg", "b.jpg"], "tok", fetchFn as typeof fetch);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("error");
    expect(result.message).toContain("rate-limited");
    expect(result.message).toContain("few minutes");
  });

  test("returns an error for an empty photo list", async () => {
    const result = await gradeAnonymousPhotos([], "tok");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("error");
  });
});
