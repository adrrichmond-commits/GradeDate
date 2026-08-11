/**
 * Direct tests for the beta invite email template (sendBetaInviteEmail):
 * personal link only, 14-day trial mention, age-verification note, Austin-only
 * note, and the join-the-waitlist fallback for ineligible recipients.
 */
import { describe, expect, test } from "bun:test";
import { sendBetaInviteEmail, type EmailProvider } from "./email";

function capturingProvider(): { provider: EmailProvider; payloads: Array<Record<string, string>> } {
  const payloads: Array<Record<string, string>> = [];
  const provider: EmailProvider = {
    emails: {
      send: async (payload: Record<string, string>) => {
        payloads.push(payload);
        return { id: "provider-id" };
      },
    },
  };
  return { provider, payloads };
}

describe("sendBetaInviteEmail", () => {
  test("sends one personal message with the recipient's own link and nothing else", async () => {
    const { provider, payloads } = capturingProvider();
    const ok = await sendBetaInviteEmail(
      { email: "wl1@example.test", inviteUrl: "https://gradedate.app/signup?ref=ABCD1234" },
      provider,
    );
    expect(ok).toBe(true);
    expect(payloads).toHaveLength(1);
    const mail = payloads[0];
    expect(mail.to).toBe("wl1@example.test");
    expect(mail.from).toContain("gradedate.app");
    expect(mail.subject).toContain("Austin beta");
    // Only this recipient's code appears; no other code/list is present.
    expect(mail.html).toContain("https://gradedate.app/signup?ref=ABCD1234");
    expect(mail.html).not.toContain("signup?ref=OTHER");
  });
  test("mentions the 14-day Premium trial, mandatory age verification, and Austin-only rule", async () => {
    const { provider, payloads } = capturingProvider();
    await sendBetaInviteEmail({ email: "wl1@example.test", inviteUrl: "https://gradedate.app/signup?ref=ABCD1234" }, provider);
    const html = payloads[0].html;
    expect(html).toContain("14 days of Premium");
    expect(html).toContain("Age verification");
    expect(html).toContain("government ID and a selfie");
    expect(html).toContain("Austin metro");
    expect(html).toContain("join the waitlist");
  });
  test("escapes the invite URL so a hostile code cannot inject HTML", async () => {
    const { provider, payloads } = capturingProvider();
    await sendBetaInviteEmail(
      { email: "wl1@example.test", inviteUrl: "https://gradedate.app/signup?ref=ABC<script>bad</script>" },
      provider,
    );
    const html = payloads[0].html;
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
  test("falls back to a plain-text waitlist mention when the origin is unusable", async () => {
    const { provider, payloads } = capturingProvider();
    await sendBetaInviteEmail({ email: "wl1@example.test", inviteUrl: "not-a-url" }, provider);
    const html = payloads[0].html;
    expect(html).toContain("gradedate.app");
    expect(html).toContain("future wave");
  });
});
