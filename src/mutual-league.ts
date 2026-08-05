/** Values used by the mutual league calculation. */
export type LeagueValue = {
  grade?: number | null;
  percentile?: number | null;
};

/**
 * Convert a user's ranking value to the canonical 0–100 league scale.
 * Percentiles already use this scale (higher is better); grades are 1–10,
 * so a grade is converted proportionally. Invalid/out-of-range values are
 * treated as unavailable rather than compared as a different unit.
 */
export function normalizeLeagueValue(value: LeagueValue): number | null {
  if (value.percentile != null && Number.isFinite(value.percentile)) {
    return Math.min(100, Math.max(0, value.percentile));
  }
  if (value.grade != null && Number.isFinite(value.grade)) {
    const grade = Math.min(10, Math.max(1, value.grade));
    return (grade / 10) * 100;
  }
  return null;
}

/**
 * Return the tolerance for values on the normalized scale. Percentile
 * matching historically used a 5-point band; grade matching historically
 * used a 1-grade band, which is 10 points after normalization. A mixed pair
 * uses the wider grade-equivalent band so fallback grade data is not made
 * artificially strict against a percentile.
 */
export function leagueRangeBand(a: LeagueValue, b: LeagueValue): number {
  return a.percentile != null && b.percentile != null ? 5 : 10;
}

export function leagueRangeScore(a: LeagueValue, b: LeagueValue): number {
  const valueA = normalizeLeagueValue(a);
  const valueB = normalizeLeagueValue(b);
  if (valueA == null || valueB == null) return 0;
  return Math.abs(valueA - valueB) <= leagueRangeBand(a, b) ? 40 : 0;
}
