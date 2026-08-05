/**
 * Pure swipe-gesture math for the matches deck.
 *
 * Kept free of React/DOM so it can be unit-tested directly with `bun test`.
 * The matches route feeds pointer deltas in and applies the returned frame to
 * the card, then resolves a like/pass/cancel decision on release.
 */

export type SwipeDirection = "like" | "pass";
export type SwipeDecision = SwipeDirection | "cancel";
export type SwipeAction = SwipeDecision | "blocked";

export interface SwipeFrame {
  /** Horizontal offset in px (mirrors the pointer delta). */
  x: number;
  /** Vertical offset in px (damped so the card never flies off vertically). */
  y: number;
  /** Rotation in degrees, proportional to x but capped. */
  rotation: number;
  /** Card opacity, fading once the drag passes the threshold. */
  opacity: number;
  /** Intended action once the drag is far enough, null below the threshold. */
  direction: SwipeDirection | null;
}

/** Threshold is a fraction of the card width, never below a usable minimum. */
export const SWIPE_THRESHOLD_RATIO = 0.25;
export const SWIPE_MIN_THRESHOLD_PX = 72;

/** A release faster than this commits even when the drag is below the threshold. */
export const SWIPE_FLING_VELOCITY_PX_MS = 0.4;
/** Minimum drag distance a fling still counts (avoids tap-velocity commits). */
export const SWIPE_FLING_MIN_DISTANCE_PX = 24;

export const SWIPE_VERTICAL_DAMPING = 0.35;
export const SWIPE_ROTATION_DEG_PER_PX = 0.06;
export const SWIPE_MAX_ROTATION_DEG = 14;
/** Max extra fade (from 1) once the drag is far past the threshold. */
export const SWIPE_MAX_FADE = 0.35;
/** Cap vertical drift so a diagonal swipe never moves the card off-screen. */
export const SWIPE_MAX_VERTICAL_PX = 120;

export function swipeThreshold(widthPx: number): number {
  return Math.max(SWIPE_MIN_THRESHOLD_PX, widthPx * SWIPE_THRESHOLD_RATIO);
}

export function computeSwipeFrame(dx: number, dy: number, threshold: number): SwipeFrame {
  const clampedDy = Math.max(-SWIPE_MAX_VERTICAL_PX, Math.min(SWIPE_MAX_VERTICAL_PX, dy));
  const y = clampedDy * SWIPE_VERTICAL_DAMPING;
  const rotation = Math.max(
    -SWIPE_MAX_ROTATION_DEG,
    Math.min(SWIPE_MAX_ROTATION_DEG, dx * SWIPE_ROTATION_DEG_PER_PX),
  );
  const distance = Math.abs(dx);
  const fade =
    distance > threshold
      ? Math.min(SWIPE_MAX_FADE, ((distance - threshold) / threshold) * SWIPE_MAX_FADE)
      : 0;
  return {
    x: dx,
    y,
    rotation,
    opacity: 1 - fade,
    direction: distance >= threshold ? (dx >= 0 ? "like" : "pass") : null,
  };
}

export function getSwipeDecision(dx: number, threshold: number, velocityX: number): SwipeDecision {
  const beyondThreshold = Math.abs(dx) >= threshold;
  const isFling =
    Math.abs(velocityX) >= SWIPE_FLING_VELOCITY_PX_MS && Math.abs(dx) >= SWIPE_FLING_MIN_DISTANCE_PX;
  if (!beyondThreshold && !isFling) return "cancel";
  return dx >= 0 ? "like" : "pass";
}

export function resolveSwipeAction(input: {
  dx: number;
  threshold: number;
  velocityX: number;
  canAct: boolean;
}): SwipeAction {
  if (!input.canAct) return "blocked";
  return getSwipeDecision(input.dx, input.threshold, input.velocityX);
}
