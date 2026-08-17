/**
 * Pure policy helpers for the /admin operations UI.
 *
 * These mirror the server-side transition tables in photo-quarantine.ts,
 * report-queue.ts, suspensions.ts and message-moderation.ts so the UI only
 * offers actions the API will accept. The server remains authoritative — this
 * module is presentation logic only, and every shape here matches the JSON
 * the admin endpoints actually return.
 */

/* ── Role guard ─────────────────────────────────────────────────── */

/** Roles that may open /admin at all (server enforces the same set). */
export function isPrivilegedRole(role: string | null | undefined): boolean {
  return isOwnerAdminRole(role);
}

/** Roles that may grant appeals / revoke suspensions / issue invites. */
export function isOwnerAdminRole(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

/* ── Photo moderation (photo-quarantine.ts) ────────────────────── */

export type QuarantineStatus =
  | "pending"
  | "quarantined"
  | "approved"
  | "removed"
  | "restored";

export interface PhotoModerationCase {
  id: string | number;
  photo_id: number;
  user_id: number;
  status: QuarantineStatus;
  source?: string | null;
  result?: string | null;
  reason?: string | null;
  actor_user_id?: number | null;
  created_at: string;
  updated_at?: string | null;
  reviewed_at?: string | null;
  retention_until?: string | null;
  private_content_type?: string | null;
  legal_hold?: boolean;
}

export interface ModerationFlag {
  id: number | string;
  photo_id?: number | null;
  user_id?: number | null;
  flag_type: string;
  confidence?: number | null;
  provider_ref?: string | null;
  status?: string;
  created_at?: string;
  reviewed_at?: string | null;
  reviewed_by?: number | null;
}

export const QUARANTINE_LABELS: Record<QuarantineStatus, string> = {
  pending: "Pending",
  quarantined: "Quarantined",
  approved: "Approved",
  removed: "Removed",
  restored: "Restored",
};

export const QUARANTINE_ACTIONS: Record<
  QuarantineStatus,
  readonly { status: QuarantineStatus; label: string }[]
> = {
  pending: [
    { status: "quarantined", label: "Quarantine" },
    { status: "approved", label: "Approve" },
  ],
  quarantined: [
    { status: "approved", label: "Approve" },
    { status: "removed", label: "Remove" },
    { status: "restored", label: "Restore" },
  ],
  approved: [{ status: "quarantined", label: "Re-quarantine" }],
  removed: [{ status: "restored", label: "Restore" }],
  restored: [{ status: "quarantined", label: "Quarantine" }],
};

/** Actions the API accepts for a given photo case status (empty = terminal). */
export function quarantineActionsFor(status: string): { status: string; label: string }[] {
  return QUARANTINE_ACTIONS[status as QuarantineStatus] ?? [];
}

export function quarantineStatusLabel(status: string): string {
  return QUARANTINE_LABELS[status as QuarantineStatus] ?? status;
}

/* ── Message moderation (message-moderation.ts) ────────────────── */

export type MessageFlagAction = "dismiss" | "keep_hidden" | "release" | "lock_account";

export interface MessageFlag {
  id: number | string;
  message_id: number;
  flag_type: string;
  source?: string | null;
  confidence?: number | null;
  status: string;
  action?: string | null;
  created_at: string;
  matched_rules?: unknown;
  match_id?: string | number | null;
  sender_display?: string | null;
}

export interface MessageFlagContext extends MessageFlag {
  flag_id: number | string;
  content: string;
  match_id: string | number | null;
  sender_id: number;
  message_created_at?: string | null;
}

export const MESSAGE_FLAG_ACTIONS: readonly {
  action: MessageFlagAction;
  label: string;
  danger: boolean;
  hint: string;
}[] = [
  { action: "release", label: "Release message", danger: false, hint: "Un-hide the message and mark reviewed." },
  { action: "keep_hidden", label: "Keep hidden", danger: false, hint: "Leave the message hidden from the match." },
  { action: "dismiss", label: "Dismiss flag", danger: false, hint: "Mark reviewed without changing the message." },
  { action: "lock_account", label: "Lock account", danger: true, hint: "Issues an indefinite suspension to the sender." },
];

export const MESSAGE_FLAG_LABELS: Record<string, string> = {
  new: "New",
  reviewed: "Reviewed",
  dismissed: "Dismissed",
  actioned: "Actioned",
};

export function messageFlagStatusLabel(status: string): string {
  return MESSAGE_FLAG_LABELS[status] ?? status;
}

/* ── Reports (report-queue.ts) ─────────────────────────────────── */

export type ReportStatus = "open" | "triaged" | "actioned" | "dismissed" | "closed";

export interface ReportRow {
  id: string | number;
  reported_id: number;
  reason: string;
  target_photo_id?: number | null;
  target_message_id?: number | null;
  status: ReportStatus;
  priority: string;
  assignee_id?: number | null;
  created_at: string;
  triaged_at?: string | null;
  actioned_at?: string | null;
  resolved_at?: string | null;
}

export interface ReportDetail extends ReportRow {
  details?: string | null;
  resolution_notes?: string | null;
}

export const REPORT_ACTION_LABELS: Record<ReportStatus, string> = {
  open: "Open",
  triaged: "Triaged",
  actioned: "Actioned",
  dismissed: "Dismissed",
  closed: "Closed",
};

export const REPORT_PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export const REPORT_REASON_LABELS: Record<string, string> = {
  inappropriate_photo: "Inappropriate photo",
  harassment: "Harassment",
  underage: "Underage",
  fake_profile: "Fake profile",
  spam: "Spam",
  other: "Other",
};

/** Report status transitions the API accepts (mirrors canTransition). */
export function reportActionsFor(status: string): ReportStatus[] {
  switch (status) {
    case "open":
      return ["triaged", "dismissed"];
    case "triaged":
      return ["actioned", "dismissed", "closed"];
    case "actioned":
      return ["closed"];
    case "dismissed":
      return ["closed"];
    default:
      return [];
  }
}

export function reportStatusLabel(status: string): string {
  return REPORT_ACTION_LABELS[status as ReportStatus] ?? status;
}

export function reportPriorityLabel(priority: string): string {
  return REPORT_PRIORITY_LABELS[priority] ?? priority;
}

export function reportReasonLabel(reason: string): string {
  return REPORT_REASON_LABELS[reason] ?? reason;
}

/* ── Appeals & suspensions (suspensions.ts) ────────────────────── */

export interface AppealRow {
  id: number | string;
  suspension_id: string;
  user_id: number;
  status: "pending" | "granted" | "denied";
  created_at: string;
  reviewed_at?: string | null;
}

export const SUSPENSION_REASONS = [
  "warning",
  "harassment",
  "underage",
  "inappropriate_photo",
  "fake_profile",
  "spam",
  "other",
] as const;

export const SUSPENSION_DURATIONS = [
  "warning",
  "24h",
  "7d",
  "30d",
  "indefinite",
] as const;

export const SUSPENSION_REASON_LABELS: Record<string, string> = {
  warning: "Warning",
  harassment: "Harassment",
  underage: "Underage",
  inappropriate_photo: "Inappropriate photo",
  fake_profile: "Fake profile",
  spam: "Spam",
  other: "Other",
};

export const SUSPENSION_DURATION_LABELS: Record<string, string> = {
  warning: "Warning (no lock)",
  "24h": "24 hours",
  "7d": "7 days",
  "30d": "30 days",
  indefinite: "Indefinite",
};

export function appealStatusLabel(status: string): string {
  return status === "granted" ? "Granted" : status === "denied" ? "Denied" : "Pending";
}

export function suspensionReasonLabel(reason: string): string {
  return SUSPENSION_REASON_LABELS[reason] ?? reason;
}

export function suspensionDurationLabel(duration: string): string {
  return SUSPENSION_DURATION_LABELS[duration] ?? duration;
}

/* ── Beta ops ──────────────────────────────────────────────────── */

export interface CohortStats {
  cap: number;
  redeemed: number;
  remaining: number;
}

export interface BetaInviteStats {
  cohort: CohortStats;
  issued: number;
  waitlist: { total: number };
}

export interface WaitlistEntry {
  id: number;
  email: string;
  zip_code: string | null;
  created_at: string;
}

export interface WaitlistResponse {
  total: number;
  limit: number;
  offset: number;
  entries: WaitlistEntry[];
}

export interface IssueInvitesResponse {
  codes?: string[];
  cohort?: CohortStats;
  emailed?: number;
  clamped?: boolean;
}

/* ── Misc formatting ───────────────────────────────────────────── */

/** Compact local date-time; safe for "no date" inputs. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Human-readable moderation confidence (0–1 → %), "—" when unknown. */
export function formatConfidence(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${Math.round(value * 100)}%`;
}

/** Distinguish the two privileged-denial codes the admin APIs return. */
export function isMfaRequiredError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "PRIVILEGED_MFA_REQUIRED"
  );
}

export function isRecentMfaError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string" &&
    ((error as { message: string }).message.includes("Recent MFA") ||
      (error as { message: string }).message.includes("reauthentication"))
  );
}

/**
 * Admin console tabs, ordered as rendered. Hash deep links resolve against
 * this list (e.g. "#messages" selects the Message flags tab).
 */
export const ADMIN_TAB_KEYS = ["photos", "messages", "reports", "appeals", "suspensions", "beta"] as const;
export type AdminTabKey = (typeof ADMIN_TAB_KEYS)[number];

/**
 * Map a location hash to the tab it selects. Empty/invalid hashes resolve to
 * the default "photos" tab; known hashes map 1:1 ("#messages" → "messages").
 * Used for deep links such as the safety-reviewer notification emails.
 */
export function tabKeyFromHash(hash: string): AdminTabKey {
  const key = hash.replace(/^#/, "").trim().toLowerCase();
  return (ADMIN_TAB_KEYS as readonly string[]).includes(key) ? (key as AdminTabKey) : "photos";
}
