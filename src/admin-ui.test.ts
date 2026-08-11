import { describe, expect, test } from "bun:test";
import {
  appealStatusLabel,
  formatConfidence,
  formatDate,
  isMfaRequiredError,
  isOwnerAdminRole,
  isPrivilegedRole,
  isRecentMfaError,
  messageFlagStatusLabel,
  quarantineActionsFor,
  quarantineStatusLabel,
  reportActionsFor,
  reportPriorityLabel,
  reportReasonLabel,
  reportStatusLabel,
  suspensionDurationLabel,
  suspensionReasonLabel,
} from "./admin-ui";

describe("admin-ui role guard", () => {
  test("admits only owner/admin/moderator", () => {
    expect(isPrivilegedRole("owner")).toBe(true);
    expect(isPrivilegedRole("admin")).toBe(true);
    expect(isPrivilegedRole("moderator")).toBe(true);
    expect(isPrivilegedRole("user")).toBe(false);
    expect(isPrivilegedRole(null)).toBe(false);
    expect(isPrivilegedRole(undefined)).toBe(false);
  });
  test("owner/admin can take owner-level actions, moderators cannot", () => {
    expect(isOwnerAdminRole("owner")).toBe(true);
    expect(isOwnerAdminRole("admin")).toBe(true);
    expect(isOwnerAdminRole("moderator")).toBe(false);
    expect(isOwnerAdminRole("user")).toBe(false);
  });
});

describe("admin-ui photo moderation transitions", () => {
  test("mirrors canTransitionQuarantine from photo-quarantine.ts", () => {
    expect(quarantineActionsFor("pending").map((a) => a.status)).toEqual(["quarantined", "approved"]);
    expect(quarantineActionsFor("quarantined").map((a) => a.status)).toEqual(["approved", "removed", "restored"]);
    expect(quarantineActionsFor("approved").map((a) => a.status)).toEqual(["quarantined"]);
    expect(quarantineActionsFor("removed").map((a) => a.status)).toEqual(["restored"]);
    expect(quarantineActionsFor("restored").map((a) => a.status)).toEqual(["quarantined"]);
    expect(quarantineActionsFor("bogus")).toEqual([]);
  });
  test("labels every status", () => {
    expect(quarantineStatusLabel("quarantined")).toBe("Quarantined");
    expect(quarantineStatusLabel("pending")).toBe("Pending");
    expect(quarantineStatusLabel("nope")).toBe("nope");
  });
});

describe("admin-ui report transitions", () => {
  test("mirrors canTransition from report-queue.ts", () => {
    expect(reportActionsFor("open")).toEqual(["triaged", "dismissed"]);
    expect(reportActionsFor("triaged")).toEqual(["actioned", "dismissed", "closed"]);
    expect(reportActionsFor("actioned")).toEqual(["closed"]);
    expect(reportActionsFor("dismissed")).toEqual(["closed"]);
    expect(reportActionsFor("closed")).toEqual([]);
    expect(reportActionsFor("bogus")).toEqual([]);
  });
  test("labels statuses, priorities and reasons", () => {
    expect(reportStatusLabel("actioned")).toBe("Actioned");
    expect(reportStatusLabel("wat")).toBe("wat");
    expect(reportPriorityLabel("urgent")).toBe("Urgent");
    expect(reportReasonLabel("inappropriate_photo")).toBe("Inappropriate photo");
    expect(reportReasonLabel("underage")).toBe("Underage");
    expect(reportReasonLabel("unknown_reason")).toBe("unknown_reason");
  });
});

describe("admin-ui message flags", () => {
  test("labels queue statuses", () => {
    expect(messageFlagStatusLabel("new")).toBe("New");
    expect(messageFlagStatusLabel("actioned")).toBe("Actioned");
    expect(messageFlagStatusLabel("wat")).toBe("wat");
  });
});

describe("admin-ui suspensions and appeals", () => {
  test("labels reasons and durations", () => {
    expect(suspensionReasonLabel("harassment")).toBe("Harassment");
    expect(suspensionReasonLabel("underage")).toBe("Underage");
    expect(suspensionDurationLabel("24h")).toBe("24 hours");
    expect(suspensionDurationLabel("indefinite")).toBe("Indefinite");
    expect(suspensionDurationLabel("7d")).toBe("7 days");
    expect(appealStatusLabel("pending")).toBe("Pending");
    expect(appealStatusLabel("granted")).toBe("Granted");
    expect(appealStatusLabel("denied")).toBe("Denied");
  });
});

describe("admin-ui formatting", () => {
  test("formatConfidence renders percentages", () => {
    expect(formatConfidence(0.873)).toBe("87%");
    expect(formatConfidence(1)).toBe("100%");
    expect(formatConfidence(null)).toBe("—");
    expect(formatConfidence(undefined)).toBe("—");
  });
  test("formatDate handles null and garbage", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
    expect(formatDate("not-a-date")).toBe("—");
    expect(formatDate("2026-08-11T12:00:00Z")).toContain("2026");
  });
});

describe("admin-ui error classification", () => {
  test("recognises the privileged-MFA gate code", () => {
    expect(isMfaRequiredError({ error: "MFA-verified privileged session required", code: "PRIVILEGED_MFA_REQUIRED" })).toBe(true);
    expect(isMfaRequiredError({ error: "Forbidden" })).toBe(false);
    expect(isMfaRequiredError(null)).toBe(false);
  });
  test("recognises the 5-minute reauthentication notice", () => {
    expect(isRecentMfaError({ message: "Recent MFA reauthentication required" })).toBe(true);
    expect(isRecentMfaError({ message: "Forbidden" })).toBe(false);
  });
});
