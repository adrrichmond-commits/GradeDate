/**
 * Owner safety-reviewer notifications.
 *
 * When a new flag lands in the review queue (photo moderation case or message
 * moderation flag), the owner is emailed a case summary with a link to the
 * review queue. At most one notification per case (dedupe by case id), and the
 * whole thing is fire-and-forget — a notification failure never blocks the
 * upload/message path that triggered it.
 *
 * Recipient: SAFETY_REVIEWER_EMAIL (default admin@gradedate.app — the owner's
 * owner-role account). Disable entirely with SAFETY_REVIEWER_NOTIFY_DISABLED=true.
 */
import { sendSafetyReviewerEmail } from "./email";
import { logInfo } from "./observability";

export type SafetyReviewerNotification = {
  kind: "photo" | "message";
  caseId: string;
  flagType: string;
  source: string;
  confidence: number | null;
  reason: string;
};

/** In-process dedupe: at most one notification per (kind, caseId). */
const NOTIFIED_KEYS = new Set<string>();
const MAX_NOTIFIED_KEYS = 2000;

export function safetyReviewerRecipient(env: Record<string, string | undefined> = process.env): string {
  const configured = env.SAFETY_REVIEWER_EMAIL?.trim();
  return configured || "admin@gradedate.app";
}

export function reviewerQueueUrl(kind: "photo" | "message", env: Record<string, string | undefined> = process.env): string {
  const origin = (env.PUBLIC_SITE_ORIGIN ?? "https://gradedate.app").replace(/\/+$/, "");
  return kind === "photo" ? `${origin}/api/admin/photo-moderation` : `${origin}/api/admin/message-moderation`;
}

export function clearSafetyReviewerNotificationsForTest(): void {
  NOTIFIED_KEYS.clear();
}

/**
 * Send (once per case) the owner-reviewer notification email.
 * Returns true when an email was dispatched, false when skipped/deduped/disabled.
 */
export async function notifySafetyReviewer(
  input: SafetyReviewerNotification,
  env: Record<string, string | undefined> = process.env,
  deps: { sendEmail?: typeof sendSafetyReviewerEmail; now?: () => number } = {},
): Promise<boolean> {
  if (env.SAFETY_REVIEWER_NOTIFY_DISABLED === "true") return false;
  const key = `${input.kind}:${input.caseId}`;
  if (NOTIFIED_KEYS.has(key)) return false;
  NOTIFIED_KEYS.add(key);
  // Bounded dedupe memory: evict the oldest entry once the cap is reached.
  if (NOTIFIED_KEYS.size > MAX_NOTIFIED_KEYS) {
    const oldest = NOTIFIED_KEYS.values().next().value;
    if (oldest !== undefined) NOTIFIED_KEYS.delete(oldest);
  }
  const sendEmail = deps.sendEmail ?? sendSafetyReviewerEmail;
  const sent = await sendEmail({
    to: safetyReviewerRecipient(env),
    kind: input.kind,
    caseId: input.caseId,
    flagType: input.flagType,
    source: input.source,
    confidence: input.confidence,
    reason: input.reason,
    queueUrl: reviewerQueueUrl(input.kind, env),
  });
  logInfo("safety_reviewer.notified", { kind: input.kind, caseId: input.caseId, flagType: input.flagType, sent });
  return sent;
}
