import { Resend } from "resend";
import { EVENTS, logInfo, logWarn } from "./observability";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

type EmailPayload = {
  from: string;
  to: string;
  subject: string;
  html: string;
  reply_to?: string;
};

/** Minimal provider contract keeps operational failures testable without sending mail. */
export type EmailProvider = {
  emails: { send(payload: EmailPayload): Promise<unknown> };
};

function sendFailureReason(error: unknown): "provider_error" | "unknown" {
  // Do not record provider messages, response bodies, recipient addresses, or URLs.
  // A coarse reason is enough to distinguish a provider rejection from an odd throw.
  return error instanceof Error ? "provider_error" : "unknown";
}

async function deliver(
  purpose: "password_reset" | "waitlist" | "contact" | "beta_invite" | "safety_reviewer",
  payload: EmailPayload,
  provider: EmailProvider | null = resend,
): Promise<boolean> {
  if (!provider) {
    logWarn(EVENTS.EMAIL_PROVIDER_UNCONFIGURED, { purpose, provider: "resend" });
    return false;
  }
  try {
    await provider.emails.send(payload);
    return true;
  } catch (error) {
    logWarn(EVENTS.EMAIL_SEND_FAILED, {
      purpose,
      provider: "resend",
      reason: sendFailureReason(error),
    });
    return false;
  }
}

export function sendPasswordResetEmail(
  email: string,
  resetUrl: string,
  provider?: EmailProvider | null,
): Promise<boolean> {
  return deliver(
    "password_reset",
    {
      from: "GradeDate <noreply@gradedate.app>",
      to: email,
      subject: "Reset your GradeDate password",
      html: `<p>You requested a password reset.</p><p><a href="${resetUrl}">Click here to reset your password</a></p><p>This link expires in 1 hour.</p><p>If you didn't request this, ignore this email.</p>`,
    },
    provider,
  );
}

export function sendWaitlistConfirmation(
  email: string,
  siteOrigin?: string | null,
  provider?: EmailProvider | null,
): Promise<boolean> {
  // CTA link is built from the origin the signup request came from (never a
  // hardcoded domain); if no origin is available, omit the link rather than
  // point at the wrong host.
  const cta = siteOrigin
    ? `<p>In the meantime, get your free grade at <a href="${siteOrigin}/grade">${siteOrigin}/grade</a>.</p>`
    : "";
  return deliver(
    "waitlist",
    {
      from: "GradeDate <noreply@gradedate.app>",
      to: email,
      subject: "You're on the list — GradeDate",
      html: `<p>Thanks for joining the GradeDate waitlist! We'll let you know when new singles join your area.</p>${cta}`,
    },
    provider,
  );
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}
/**
 * Personal closed-beta invite email. One recipient, one unique invite link —
 * never a shared list of codes. The waitlist fallback link is derived from the
 * invite link's origin so it always points at the site the invite came from.
 */
export function sendBetaInviteEmail(
  input: { email: string; inviteUrl: string },
  provider?: EmailProvider | null,
): Promise<boolean> {
  const url = escapeHtml(input.inviteUrl);
  let waitlistOrigin: string | null = null;
  try {
    waitlistOrigin = new URL(input.inviteUrl).origin;
  } catch { /* fall back to no link */ }
  const fallback = waitlistOrigin
    ? `<p>If you're outside the Austin metro area — or the cohort fills up before you sign up — join the waitlist at <a href="${escapeHtml(waitlistOrigin)}">${escapeHtml(waitlistOrigin)}</a> and we'll invite you in a future wave.</p>`
    : `<p>If you're outside the Austin metro area, join the waitlist at gradedate.app and we'll invite you in a future wave.</p>`;
  return deliver(
    "beta_invite",
    {
      from: "GradeDate <noreply@gradedate.app>",
      to: input.email,
      subject: "Your invite to the GradeDate Austin beta",
      html: `<p>You're in — your personal invite to the GradeDate Austin beta is ready.</p>
<p><a href="${url}">${url}</a></p>
<p>Your invite link is personal to you, so please don't share it.</p>
<h3>What to expect when you sign up</h3>
<ul>
  <li><strong>14 days of Premium free.</strong> Every beta invite includes a free 14-day Premium trial from signup.</li>
  <li><strong>Age verification is required.</strong> For everyone's safety, you'll need to verify your age with a government ID and a selfie before you can like or message.</li>
  <li><strong>Austin metro only.</strong> The beta is open to people in the Austin, TX area, and signup checks your location.</li>
</ul>
${fallback}
<p>See you inside,<br>The GradeDate team</p>`,
    },
    provider,
  );
}

export function sendContactMessage(
  input: { name?: string; email: string; topic: string; message: string },
  provider?: EmailProvider | null,
): Promise<boolean> {
  const name = input.name?.trim() || "Not provided";
  const topic = input.topic.trim();
  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(input.email);
  const safeTopic = escapeHtml(topic);
  const safeMessage = escapeHtml(input.message).replace(/\n/g, "<br>");
  const label = name !== "Not provided" ? name : input.email;
  return deliver("contact", {
    from: "GradeDate <noreply@gradedate.app>",
    to: "gradedate-3339f828@ctomail.io",
    subject: `[Contact] ${topic} — ${label.slice(0, 80)}`,
    reply_to: input.email,
    html: `<h2>GradeDate contact message</h2><p><strong>Topic:</strong> ${safeTopic}</p><p><strong>Name:</strong> ${safeName}</p><p><strong>Email:</strong> ${safeEmail}</p><p><strong>Message:</strong><br>${safeMessage}</p>`,
  }, provider);
}

/**
 * Owner safety-reviewer notification for a new flag in the review queue
 * (photo moderation case or message moderation flag). One email per case —
 * dedupe lives in the caller (safety-review-notify.ts).
 */
export function sendSafetyReviewerEmail(
  input: {
    to: string;
    kind: "photo" | "message";
    caseId: string;
    flagType: string;
    source: string;
    confidence: number | null;
    reason: string;
    queueUrl: string;
  },
  provider?: EmailProvider | null,
): Promise<boolean> {
  const kindLabel = input.kind === "photo" ? "Photo" : "Message";
  const safeQueueUrl = escapeHtml(input.queueUrl);
  const confidence = input.confidence == null ? "n/a" : `${Math.round(input.confidence * 100)}%`;
  const safeReason = escapeHtml(input.reason);
  const safeCaseId = escapeHtml(input.caseId);
  return deliver("safety_reviewer", {
    from: "GradeDate <noreply@gradedate.app>",
    to: input.to,
    subject: `[Safety Review] ${kindLabel} flagged — ${input.flagType}`,
    html: `<h2>GradeDate safety review</h2>
<p>A new <strong>${kindLabel.toLowerCase()}</strong> flag landed in the review queue.</p>
<ul>
  <li><strong>Case:</strong> ${safeCaseId}</li>
  <li><strong>Type:</strong> ${kindLabel}</li>
  <li><strong>Reason:</strong> ${safeReason}</li>
  <li><strong>Flag:</strong> ${input.flagType}</li>
  <li><strong>Source:</strong> ${input.source}</li>
  <li><strong>Confidence:</strong> ${confidence}</li>
</ul>
<p><a href="${safeQueueUrl}">Open the review queue</a></p>`,
  }, provider);
}
