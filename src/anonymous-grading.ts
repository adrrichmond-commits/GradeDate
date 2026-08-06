/**
 * Anonymous multi-photo grading.
 *
 * Anonymous visitors can upload up to ANON_MAX_PHOTOS photos and get each one
 * graded. There is no account and no persistence, so we safely reuse the
 * existing per-photo anonymous endpoint (/api/grade) once per photo and compose
 * the results into the same shape the authenticated /api/grade-photos response
 * uses. The server-side /api/grade rate limit (5 per 15 min) matches
 * ANON_MAX_PHOTOS, so one full preview session fits exactly inside the
 * anonymous budget.
 */

import type { CoachingTip } from "./coaching";
import { deriveCoachingTips } from "./coaching";
import {
  aggregateGradingMethod,
  FALLBACK_FEEDBACK,
  type GradingMethod,
} from "./grading-method";

/** Maximum photos an anonymous visitor can grade in one session. */
export const ANON_MAX_PHOTOS = 5;

/** A single per-photo result returned by the anonymous /api/grade endpoint. */
export interface AnonymousPerPhotoGrade {
  photo_path: string;
  grade: number;
  /** The one-line actionable tip from the single-photo grading prompt. */
  analysis: string | null;
  /** "ai" when AI graded this photo, "mock" when it fell back to simulated. */
  grading_method: string | null;
}

/** One composed per-photo result, shaped like /api/grade-photos `grades`. */
export interface AnonymousPhotoGrade {
  photo_path: string;
  grade: number;
  feedback: string;
  is_best: boolean;
}

export interface AnonymousGradingSuccess {
  ok: true;
  grades: AnonymousPhotoGrade[];
  grading_method: GradingMethod;
  coaching: CoachingTip[];
}

export interface AnonymousGradingFailure {
  ok: false;
  kind: "nsfw" | "moderation_unavailable" | "error";
  message: string;
}

export type AnonymousGradingResult = AnonymousGradingSuccess | AnonymousGradingFailure;

/**
 * Compose per-photo /api/grade responses into the multi-photo response shape:
 * clamp grades, carry the analysis over as feedback (falling back to the
 * honest simulated-grade copy), and mark the highest grade as best.
 */
export function composeAnonymousGrades(
  results: AnonymousPerPhotoGrade[]
): AnonymousPhotoGrade[] {
  let highestGrade = -1;
  let bestIndex = -1;

  const grades = results.map((r, i) => {
    const grade = Math.max(1, Math.min(10, Math.round(Number(r.grade) || 5)));
    if (grade > highestGrade) {
      highestGrade = grade;
      bestIndex = i;
    }
    return {
      photo_path: r.photo_path,
      grade,
      feedback: r.analysis || FALLBACK_FEEDBACK,
      is_best: false,
    };
  });

  if (bestIndex >= 0) {
    grades[bestIndex].is_best = true;
  }

  return grades;
}

/**
 * Aggregate per-photo grading methods ("ai" | "mock") into one response-level
 * method, matching the server's aggregateGradingMethod semantics.
 */
export function composeAnonymousGradingMethod(
  methods: (string | null | undefined)[]
): GradingMethod {
  const aiCount = methods.filter((m) => m === "ai").length;
  return aggregateGradingMethod(aiCount, methods.length);
}

/**
 * Grade an anonymous visitor's uploaded photos by calling /api/grade once per
 * photo (sequential, so we stop at the first NSFW or error, exactly like the
 * authenticated multi-photo flow). Never grades more than ANON_MAX_PHOTOS.
 *
 * `fetchFn` is injectable for tests; it defaults to the global fetch.
 */
export async function gradeAnonymousPhotos(
  photoPaths: string[],
  csrfToken: string,
  fetchFn: typeof fetch = fetch
): Promise<AnonymousGradingResult> {
  const paths = photoPaths.slice(0, ANON_MAX_PHOTOS);
  if (paths.length === 0) {
    return { ok: false, kind: "error", message: "No photos to grade." };
  }

  const results: AnonymousPerPhotoGrade[] = [];

  for (const photoPath of paths) {
    let res: Response;
    try {
      res = await fetchFn("/api/grade", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({ photo_path: photoPath }),
      });
    } catch {
      return {
        ok: false,
        kind: "error",
        message: "Network error. Please check your connection and try again.",
      };
    }

    let data: { code?: string; error?: string; grade?: number; analysis?: string; grading_method?: string } | null = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    if (!res.ok) {
      if (data?.code === "MODERATION_UNAVAILABLE") {
        return { ok: false, kind: "moderation_unavailable", message: data.error || "This photo was not approved or graded yet because moderation is temporarily unavailable. Please try again; this does not mean the photo is unsafe." };
      }
      if (data?.code === "NSFW") {
        return {
          ok: false,
          kind: "nsfw",
          message: data.error || "This photo appears to contain inappropriate content.",
        };
      }
      const retryAfter = res.headers.get("Retry-After") || (typeof data?.retry_after_sec === "number" ? String(data.retry_after_sec) : null);
      return {
        ok: false,
        kind: "error",
        message: res.status === 429
          ? `Grading is temporarily rate-limited. Please try again in ${retryAfter ? `${retryAfter} seconds` : "a few minutes"}.`
          : (data?.error || "Grading failed. Please try again."),
      };
    }

    results.push({
      photo_path: photoPath,
      grade: Number(data?.grade) || 5,
      analysis: typeof data?.analysis === "string" ? data.analysis : null,
      grading_method: typeof data?.grading_method === "string" ? data.grading_method : null,
    });
  }

  const grades = composeAnonymousGrades(results);
  const grading_method = composeAnonymousGradingMethod(
    results.map((r) => r.grading_method)
  );
  const coaching = deriveCoachingTips(
    grades.map((g) => g.feedback),
    paths.length
  );

  return { ok: true, grades, grading_method, coaching };
}
