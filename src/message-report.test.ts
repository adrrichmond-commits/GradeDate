import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  messageFlagTypeForReportReason,
  userReportPolicyForClassification,
  MESSAGE_FLAG_TYPES,
} from "./message-moderation";

describe("message report classification mapping", () => {
  test("maps each user-facing reason to a stable moderation flag type", () => {
    expect(messageFlagTypeForReportReason("underage")).toBe("csam_or_underage");
    expect(messageFlagTypeForReportReason("spam")).toBe("spam_or_scam");
    expect(messageFlagTypeForReportReason("fake_profile")).toBe("impersonation");
    expect(messageFlagTypeForReportReason("harassment")).toBe("harassment_or_abuse");
    expect(messageFlagTypeForReportReason("inappropriate_photo")).toBe("inappropriate_or_explicit");
    expect(messageFlagTypeForReportReason("other")).toBe("other");
  });

  test("falls back to other for unknown reasons", () => {
    expect(messageFlagTypeForReportReason("not_a_reason")).toBe("other");
  });

  test("all mapped flag types are part of the message flag vocabulary", () => {
    for (const reason of ["underage", "spam", "fake_profile", "harassment", "inappropriate_photo", "other"]) {
      expect(MESSAGE_FLAG_TYPES).toContain(messageFlagTypeForReportReason(reason));
    }
  });
});

describe("user report protective-action policy", () => {
  test("reuses the zero-tolerance policy for underage/CSAM reports (hide + lock)", () => {
    expect(userReportPolicyForClassification("csam_or_underage")).toEqual({ hide: true, lockAccount: true, urgent: true });
  });

  test("does not auto-hide or lock for ordinary reasons", () => {
    expect(userReportPolicyForClassification("spam_or_scam")).toEqual({ hide: false, lockAccount: false, urgent: false });
    expect(userReportPolicyForClassification("harassment_or_abuse")).toEqual({ hide: false, lockAccount: false, urgent: false });
  });
});

describe("handleReport message-report path", () => {
  const source = readFileSync(join(import.meta.dir, "api-handler.ts"), "utf8");
  const handler = (name: string) =>
    source.slice(source.indexOf(`async function ${name}`), source.indexOf("\nasync function ", source.indexOf(`async function ${name}`) + 1));
  const body = handler("handleReport");

  test("accepts an optional message_id on the report request", () => {
    expect(body).toContain("const targetMessageId = body?.message_id;");
  });

  test("rejects a malformed message reference", () => {
    expect(body).toContain('return json({ error: "Invalid message reference" }, 400);');
  });

  test("requires the message to exist", () => {
    expect(body).toContain("const message = await getMessageById(targetMessageId);");
    expect(body).toContain('return json({ error: "Message not found" }, 404);');
  });

  test("requires the reporter to be a participant in the message's match", () => {
    expect(body).toContain("const match = await getMatchById(message.match_id);");
    expect(body).toContain('return json({ error: "You are not a participant in this match" }, 403);');
  });

  test("rejects self-reports (the message sender cannot report their own message)", () => {
    expect(body).toContain("if (message.sender_id === user.id) return json({ error: \"You cannot report your own message\" }, 400);");
  });

  test("rate-limits message reports like other reports", () => {
    expect(body).toContain('checkRateLimit(req, "report", { maxRequests: REPORT_RATE_LIMIT, windowMs: 15 * 60 * 1000 })');
  });

  test("dedupes repeat reports by the same user with 409", () => {
    expect(body).toContain("hasUserReportedMessage(user.id, message.id)");
    expect(body).toContain('return json({ error: "This message has already been reported" }, 409);');
  });

  test("creates the report with the message id and derives the reported user from the sender", () => {
    expect(body).toContain("reportUser(user.id, message.sender_id, reason, null, details ?? null, message.id)");
    expect(body).toContain("reportUser(user.id, targetId, reason, targetPhotoId ?? null, details ?? null)");
  });

  test("surfaces the report in the message-moderation queue with source user_report", () => {
    expect(body).toContain('upsertMessageModerationFlag(message.id, message.sender_id, message.match_id, classification, "user_report"');
  });

  test("reuses the existing policy functions and hides underage-flagged messages", () => {
    expect(body).toContain("userReportPolicyForClassification(classification)");
    expect(body).toContain("if (policy.hide) await hideMessage(message.id, `user_report:${classification}`);");
  });

  test("keeps the underage zero-tolerance flow (quarantine + suspension) for message reports", () => {
    expect(body).toContain("await quarantineUserPhotosForUnderage(message.sender_id, reportId);");
    expect(body).toContain("createSuspension({ userId: message.sender_id, reason: \"underage\"");
    expect(body).toContain('action: "underage.enforcement"');
  });

  test("does not alter the existing user/photo report behavior", () => {
    expect(body).toContain('return json({ error: "user_id is required" }, 400);');
    expect(body).toContain('return json({ error: "You cannot report yourself" }, 400);');
    expect(body).toContain("if (reason === \"inappropriate_photo\" && targetPhotoId) {");
  });
});
