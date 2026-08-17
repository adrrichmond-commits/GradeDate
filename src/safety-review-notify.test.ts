import { describe, expect, test } from "bun:test";
import { clearSafetyReviewerNotificationsForTest, notifySafetyReviewer, reviewerQueueUrl, safetyReviewerRecipient } from "./safety-review-notify";

const baseInput = {
  kind: "photo" as const,
  caseId: "case-123",
  flagType: "nsfw",
  source: "automated_photo_scan",
  confidence: 0.91,
  reason: "nsfw",
};

describe("safety reviewer notification", () => {
  test("sends email with case summary and queue link", async () => {
    clearSafetyReviewerNotificationsForTest();
    let sent: Record<string, unknown> | null = null;
    const result = await notifySafetyReviewer(baseInput, { SAFETY_REVIEWER_EMAIL: "reviewer@example.com" }, {
      sendEmail: async (payload) => {
        sent = payload as unknown as Record<string, unknown>;
        return true;
      },
    });
    expect(result).toBe(true);
    expect(sent?.to).toBe("reviewer@example.com");
    expect(sent?.kind).toBe("photo");
    expect(sent?.caseId).toBe("case-123");
    expect(sent?.flagType).toBe("nsfw");
    expect(sent?.queueUrl).toBe("https://gradedate.app/admin");
  });

  test("dedupes by case id (at most one notification per case)", async () => {
    clearSafetyReviewerNotificationsForTest();
    let calls = 0;
    const sendEmail = async () => { calls++; return true; };
    const first = await notifySafetyReviewer(baseInput, {}, { sendEmail });
    const second = await notifySafetyReviewer({ ...baseInput, flagType: "csam_or_underage" }, {}, { sendEmail });
    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(calls).toBe(1);
  });

  test("message kind links to the admin console messages tab", async () => {
    clearSafetyReviewerNotificationsForTest();
    let sent: Record<string, unknown> | null = null;
    await notifySafetyReviewer(
      { ...baseInput, kind: "message", caseId: "flag-9" },
      { PUBLIC_SITE_ORIGIN: "https://gradedate.app" },
      { sendEmail: async (payload) => { sent = payload as unknown as Record<string, unknown>; return true; } },
    );
    expect(sent?.queueUrl).toBe("https://gradedate.app/admin#messages");
  });
  test("photo and message queue URLs deep-link into the admin console, not the JSON API", () => {
    expect(reviewerQueueUrl("photo", { PUBLIC_SITE_ORIGIN: "https://gradedate.app" })).toBe("https://gradedate.app/admin");
    expect(reviewerQueueUrl("message", { PUBLIC_SITE_ORIGIN: "https://gradedate.app" })).toBe("https://gradedate.app/admin#messages");
    expect(reviewerQueueUrl("photo", { PUBLIC_SITE_ORIGIN: "https://gradedate.app/" })).toBe("https://gradedate.app/admin");
  });

  test("default recipient is the owner account", () => {
    expect(safetyReviewerRecipient({})).toBe("admin@gradedate.app");
    expect(safetyReviewerRecipient({ SAFETY_REVIEWER_EMAIL: "  owner@example.com  " })).toBe("owner@example.com");
  });

  test("can be disabled via env", async () => {
    clearSafetyReviewerNotificationsForTest();
    let calls = 0;
    const result = await notifySafetyReviewer(baseInput, { SAFETY_REVIEWER_NOTIFY_DISABLED: "true" }, { sendEmail: async () => { calls++; return true; } });
    expect(result).toBe(false);
    expect(calls).toBe(0);
  });

  test("queue url falls back to gradedate.app origin", () => {
    expect(reviewerQueueUrl("photo", {})).toBe("https://gradedate.app/admin");
    expect(reviewerQueueUrl("message", {})).toBe("https://gradedate.app/admin#messages");
  });
});
