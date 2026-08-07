export const SUSPENSION_REASONS = ["warning", "harassment", "underage", "inappropriate_photo", "fake_profile", "spam", "other"] as const;
export type SuspensionReason = typeof SUSPENSION_REASONS[number];
export const SUSPENSION_DURATIONS = ["warning", "24h", "7d", "30d", "indefinite"] as const;
export type SuspensionDuration = typeof SUSPENSION_DURATIONS[number];
export const SUSPENSION_STATUSES = ["active", "revoked", "expired"] as const;
export type SuspensionStatus = typeof SUSPENSION_STATUSES[number];
export const APPEAL_STATUSES = ["pending", "granted", "denied"] as const;
export type AppealStatus = typeof APPEAL_STATUSES[number];
export const APPEAL_TEXT_MAX = 2000;
export const APPEAL_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
export function isSuspensionReason(v: unknown): v is SuspensionReason { return typeof v === "string" && (SUSPENSION_REASONS as readonly string[]).includes(v); }
export function isSuspensionDuration(v: unknown): v is SuspensionDuration { return typeof v === "string" && (SUSPENSION_DURATIONS as readonly string[]).includes(v); }
export function isSuspensionStatus(v: unknown): v is SuspensionStatus { return typeof v === "string" && (SUSPENSION_STATUSES as readonly string[]).includes(v); }
export function isAppealStatus(v: unknown): v is AppealStatus { return typeof v === "string" && (APPEAL_STATUSES as readonly string[]).includes(v); }
export function canReviewAppeal(role: unknown): boolean { return role === "owner" || role === "admin" || role === "moderator"; }
export function canOverrideSuspension(role: unknown): boolean { return role === "owner" || role === "admin"; }
export function canTransitionAppeal(from: AppealStatus, to: AppealStatus): boolean { return from === "pending" && (to === "granted" || to === "denied"); }
export function durationEnds(duration: SuspensionDuration, now = Date.now()): string | null { if (duration === "indefinite" || duration === "warning") return duration === "warning" ? new Date(now).toISOString() : null; const hours = duration === "24h" ? 24 : duration === "7d" ? 168 : 720; return new Date(now + hours * 3600000).toISOString(); }
