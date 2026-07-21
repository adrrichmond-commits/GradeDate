import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

export async function sendPasswordResetEmail(
  email: string,
  resetUrl: string,
): Promise<boolean> {
  if (!resend) {
    console.log("RESEND_API_KEY not set, cannot send email");
    return false;
  }
  try {
    await resend.emails.send({
      from: "GradeDate <noreply@gradedate.app>",
      to: email,
      subject: "Reset your GradeDate password",
      html: `<p>You requested a password reset.</p><p><a href="${resetUrl}">Click here to reset your password</a></p><p>This link expires in 1 hour.</p><p>If you didn't request this, ignore this email.</p>`,
    });
    return true;
  } catch (err) {
    console.error("Failed to send password reset email:", err);
    return false;
  }
}
