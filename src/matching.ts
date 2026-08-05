/**
 * 80/20 matching range math (pure, unit-testable).
 *
 * Matching compares users on the GRADE scale (1–10) only. The stored
 * percentile is a 0–100 display metric derived from the grade
 * distribution; feeding percentile bounds into a grade filter (1–10)
 * mixes scales and produces empty feeds. All bounds produced here are
 * grade bounds and always partition the 1–10 scale without overlap:
 *
 *   below [1, g-2] | in-range [g-1, g+1] | above [g+2, 10]
 *
 * "above" is empty at grade 10 (min 11 > max 10), "below" is empty at
 * grade 1 (min 1 > max 0) — callers check isNonEmptyRange before
 * querying, so extreme grades never re-return in-range users as
 * out-of-range or produce empty feeds at the boundary.
 */

export interface GradeRange {
  min: number;
  max: number;
}

export interface GradeBands {
  inRange: GradeRange;
  above: GradeRange;
  below: GradeRange;
}

export interface PoolCounts {
  inRangeCount: number;
  aboveCount: number;
  belowCount: number;
}

/** In-range band: userGrade ± 1, clamped to the 1–10 scale. */
export function inRangeBand(userGrade: number): GradeRange {
  return { min: Math.max(1, userGrade - 1), max: Math.min(10, userGrade + 1) };
}

/**
 * Compute the three grade bands for the 80/20 feed.
 * above/below may be empty (min > max) at the grade extremes.
 */
export function computeGradeBands(userGrade: number): GradeBands {
  const inRange = inRangeBand(userGrade);
  return {
    inRange,
    above: { min: inRange.max + 1, max: 10 },
    below: { min: 1, max: inRange.min - 1 },
  };
}

/** A band is queryable when it contains at least one grade value. */
export function isNonEmptyRange(range: GradeRange): boolean {
  return range.min <= range.max;
}

/**
 * 80/20 pool sizing: all in-range users (80%) plus ~10% from above and
 * ~10% from below. When no in-range users exist, fall back to the full
 * out-of-range pools so the feed is never empty while any graded users
 * exist (only when every pool is empty — i.e. no graded users at all —
 * is the feed empty).
 */
export function compute8020Counts(
  totalInRange: number,
  aboveAvailable: number,
  belowAvailable: number,
): PoolCounts {
  if (totalInRange > 0) {
    const outsideBudget = Math.ceil(totalInRange * 0.125); // ~10% of the feed each side
    return {
      inRangeCount: totalInRange,
      aboveCount: Math.max(0, Math.min(aboveAvailable, outsideBudget)),
      belowCount: Math.max(0, Math.min(belowAvailable, outsideBudget)),
    };
  }
  return { inRangeCount: 0, aboveCount: aboveAvailable, belowCount: belowAvailable };
}
