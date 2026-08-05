/**
 * Grading-method labeling helpers.
 *
 * These keep the "was this grade produced by AI or simulated?" bookkeeping in
 * one pure, testable place. The API uses them to report how grades were
 * produced so the UI never presents a random fallback as AI analysis.
 */

export type GradingMethod = "ai" | "mixed" | "mock";

/**
 * Feedback shown for a photo that could not be AI-graded.
 * Deliberately does NOT claim the photo was analyzed (no lighting/angle/crop
 * advice) — it says plainly that the grade is simulated.
 */
export const FALLBACK_FEEDBACK =
  "AI grading was unavailable for this photo, so this grade is simulated.";

/**
 * Aggregate per-photo AI success count into a single response-level method:
 * - all photos AI-graded      -> "ai"
 * - some photos fell back     -> "mixed"
 * - no photos AI-graded       -> "mock"
 * - empty input               -> "mock"
 */
export function aggregateGradingMethod(
  aiCount: number,
  totalCount: number
): GradingMethod {
  if (totalCount <= 0 || aiCount <= 0) return "mock";
  if (aiCount >= totalCount) return "ai";
  return "mixed";
}

/**
 * Fallback grade used when AI is unavailable (single-photo flow keeps its own
 * bell-curve fallback; this is the multi-photo 3–8 range). Preserves the
 * existing fallback formula — relocating it here only makes it testable.
 */
export function fallbackGrade(): number {
  return Math.max(1, Math.min(10, Math.round(Math.random() * 5 + 3)));
}
