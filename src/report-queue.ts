export const REPORT_REASONS = ["inappropriate_photo", "harassment", "underage", "fake_profile", "spam", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export const REPORT_STATUSES = ["open", "triaged", "actioned", "dismissed", "closed"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];
export const REPORT_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type ReportPriority = (typeof REPORT_PRIORITIES)[number];
const transitions: Record<ReportStatus, readonly ReportStatus[]> = { open: ["triaged", "dismissed"], triaged: ["actioned", "dismissed", "closed"], actioned: ["closed"], dismissed: ["closed"], closed: [] };
export function isReportReason(v: unknown): v is ReportReason { return typeof v === "string" && (REPORT_REASONS as readonly string[]).includes(v); }
export function isReportStatus(v: unknown): v is ReportStatus { return typeof v === "string" && (REPORT_STATUSES as readonly string[]).includes(v); }
export function isReportPriority(v: unknown): v is ReportPriority { return typeof v === "string" && (REPORT_PRIORITIES as readonly string[]).includes(v); }
export function canTransition(from: ReportStatus, to: ReportStatus): boolean { return transitions[from]?.includes(to) ?? false; }
export function canManageReport(role: unknown): boolean { return role === "owner" || role === "admin"; }
export function canUseOwnerAction(role: unknown): boolean { return role === "owner" || role === "admin"; }
export const REPORT_DETAILS_MAX = 2000;
export const REPORT_RATE_LIMIT = 10;

// Kept as a compatibility export for moderation API consumers.
export {
  canReviewPhoto,
  canTransitionQuarantine,
  isQuarantineStatus,
  privateReviewStorageReady,
  redactPhotoCase,
} from "./photo-quarantine";
