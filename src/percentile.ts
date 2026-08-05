/**
 * Percentile semantics (canonical for the whole app):
 *
 * - The `percentile` value is a 0–100 number where HIGHER is BETTER.
 *   It is derived from the grade distribution: the percentage of graded
 *   users in the same city whose grade is at or below yours
 *   (i.e. users you rank at-or-above). `100` means nobody in the city
 *   has a higher grade.
 *
 * - The display label is always "Top (100 - percentile)%":
 *   percentile 80 -> "Top 20%", percentile 0 -> "Top 100%",
 *   percentile 100 -> "Top 0%".
 *
 * Percentile is a display/ranking metric only. Matching filters compare
 * users on the grade scale (1–10); percentile values must never be passed
 * as grade bounds.
 */

/**
 * Compute the 0–100 percentile from a grade distribution count.
 * `atOrBelow` = number of users whose grade is <= yours;
 * `total` = number of graded users in the comparison set.
 * Rounded to one decimal place (e.g. 33.3), clamped to [0, 100].
 */
export function computePercentile(atOrBelow: number, total: number): number {
  if (total <= 0) return 0;
  const clamped = Math.min(1, Math.max(0, atOrBelow / total));
  return Math.round(clamped * 1000) / 10;
}

/**
 * "Top N%" label for a 0–100 percentile (higher percentile -> lower "Top N%").
 * Matches the established display convention `Top ${Math.round(100 - p)}%`.
 */
export function topPercentLabel(percentile: number): string {
  return `Top ${Math.round(100 - percentile)}%`;
}
