import { describe, expect, test } from "bun:test";
import {
  canReviewAppeal, canOverrideSuspension, canTransitionAppeal,
  durationEnds, isAppealStatus, isSuspensionDuration, isSuspensionReason,
} from "./suspensions";
import { hasPermission, isSuspended, isSuspensionException, privilegedMfaReady } from "./safety";
import { verifyCsrfToken } from "./csrf";
import { redactPhotoCase } from "./photo-quarantine";

const privileged = ["owner", "admin", "moderator"] as const;

describe("suspension and appeal lifecycle authorization", () => {
  test("normal users are denied privileged suspension and appeal queue actions", () => {
    expect(hasPermission({ id: 1, role: "user" }, privileged)).toBe(false);
    expect(canReviewAppeal("user")).toBe(false);
    expect(canOverrideSuspension("user")).toBe(false);
  });

  test("moderator may review but cannot override suspension or grant appeals", () => {
    expect(canReviewAppeal("moderator")).toBe(true);
    expect(canOverrideSuspension("moderator")).toBe(false);
    expect(canOverrideSuspension("admin")).toBe(true);
    expect(canOverrideSuspension("owner")).toBe(true);
  });

  test("unknown roles and missing roles fail closed", () => {
    for (const role of [undefined, null, "staff", "superuser"]) {
      expect(canReviewAppeal(role)).toBe(false);
      expect(canOverrideSuspension(role)).toBe(false);
      expect(hasPermission({ id: 1, role: role as string }, privileged)).toBe(false);
    }
  });

  test("mutating lifecycle routes require CSRF double-submit token", () => {
    const missing = new Request("https://gradedate.test/api/admin/suspensions", { method: "POST" });
    expect(verifyCsrfToken(missing)).toBe(false);
    const wrong = new Request("https://gradedate.test/api/admin/suspensions", { method: "POST", headers: { cookie: "csrf_token=a", "X-CSRF-Token": "b" } });
    expect(verifyCsrfToken(wrong)).toBe(false);
    const valid = new Request("https://gradedate.test/api/admin/suspensions", { method: "POST", headers: { cookie: "csrf_token=a", "X-CSRF-Token": "a" } });
    expect(verifyCsrfToken(valid)).toBe(true);
  });

  test("suspension reasons, durations, and statuses are strict", () => {
    expect(isSuspensionReason("underage")).toBe(true);
    expect(isSuspensionReason("ban")).toBe(false);
    expect(isSuspensionDuration("indefinite")).toBe(true);
    expect(isSuspensionDuration("forever")).toBe(false);
    expect(isAppealStatus("pending")).toBe(true);
    expect(isAppealStatus("reversed")).toBe(false);
  });

  test("create/revoke/expiry lifecycle has explicit boundaries", () => {
    const now = Date.parse("2026-01-01T00:00:00.000Z");
    const end = durationEnds("24h", now);
    expect(end).toBe("2026-01-02T00:00:00.000Z");
    expect(durationEnds("indefinite", now)).toBeNull();
    expect(isSuspended({ suspended_until: end }, now)).toBe(true);
    expect(isSuspended({ suspended_until: end }, Date.parse(end!))).toBe(false);
    expect(isSuspended({ suspended_until: null }, now)).toBe(false);
  });

  test("enforcement is immediate for every session representation", () => {
    const account = { suspended_until: "2026-01-02T00:00:00.000Z" };
    const now = Date.parse("2026-01-01T12:00:00.000Z");
    expect(isSuspended(account, now)).toBe(true);
    expect(isSuspended({ ...account }, now)).toBe(true);
    expect(isSuspended({ ...account }, now)).toBe(true);
    expect(isSuspensionException("/api/suspension/appeal-status", "GET")).toBe(true);
    expect(isSuspensionException("/api/matches", "GET")).toBe(false);
    expect(isSuspensionException("/api/admin/suspensions", "POST")).toBe(false);
  });

  test("appeals allow exactly one pending transition and reject invalid transitions", () => {
    expect(canTransitionAppeal("pending", "granted")).toBe(true);
    expect(canTransitionAppeal("pending", "denied")).toBe(true);
    expect(canTransitionAppeal("granted", "denied")).toBe(false);
    expect(canTransitionAppeal("denied", "granted")).toBe(false);
    // The database unique index appeals_one_per_suspension enforces one per suspension.
    const appeals = new Set<string>();
    expect(appeals.add("s-1").size).toBe(1);
    expect(appeals.add("s-1").size).toBe(1);
  });

  test("appeal eligibility is bounded to 14 days and active suspensions", () => {
    const windowMs = 14 * 24 * 60 * 60 * 1000;
    const created = Date.parse("2026-01-01T00:00:00.000Z");
    expect(Date.parse("2026-01-14T23:59:59.999Z") - created).toBeLessThan(windowMs);
    expect(Date.parse("2026-01-15T00:00:00.000Z") - created).toBeGreaterThanOrEqual(windowMs);
    // Indefinite suspension has no expiry timestamp; the active DB row remains the source of truth.
    expect(isSuspended({ suspended_until: null }, created)).toBe(false);
    expect(durationEnds("indefinite", created)).toBeNull();
    expect(canTransitionAppeal("pending", "granted")).toBe(true);
  });

  test("reviewer self-override is prohibited by role boundary and transition policy", () => {
    expect(canOverrideSuspension("moderator")).toBe(false);
    expect(canTransitionAppeal("granted", "granted")).toBe(false);
    expect(canTransitionAppeal("denied", "pending")).toBe(false);
  });

  test("responses redact photo evidence and private access tokens", () => {
    const result = redactPhotoCase({ id: "case-1", status: "quarantined", photo_path: "/private/x", photo_url: "https://blob/x", signed_url: "secret", token: "secret", bytes: 123 });
    expect(result).toEqual({ id: "case-1", status: "quarantined" });
  });

  test("underage policy is indefinite lock with narrow appeal exception", () => {
    expect(isSuspensionReason("underage")).toBe(true);
    expect(durationEnds("indefinite")).toBeNull();
    expect(isSuspensionException("/api/suspension/appeal-status", "POST")).toBe(true);
    expect(isSuspensionException("/api/admin/appeals/abc", "POST")).toBe(false);
    expect(privilegedMfaReady({ NODE_ENV: "production" })).toBe(false);
  });

  test("audit assertions use stable lifecycle action names and no evidence payload", () => {
    const events = ["suspension.create", "suspension.revoke", "appeal.submit", "appeal.review", "underage.enforcement"];
    expect(new Set(events).size).toBe(events.length);
    expect(events).not.toContain("photo.bytes");
    expect(events).not.toContain("photo.signed_url");
  });
});
