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
  purpose: "password_reset" | "waitlist" | "contact",
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
