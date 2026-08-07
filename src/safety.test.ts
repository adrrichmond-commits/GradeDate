import { describe, expect, test } from "bun:test";
import { hasPermission, isSuspended, isSuspensionException, privilegedMfaReady } from "./safety";

describe("Phase 1 safety policy", () => {
  test("allowlisted roles fail closed", () => {
    expect(hasPermission({ id: 1, role: "admin" }, ["admin", "owner"])).toBe(true);
    expect(hasPermission({ id: 1, role: "superuser" }, ["admin", "owner"])).toBe(false);
    expect(hasPermission({ id: 1, role: null }, ["admin"])).toBe(false);
  });
  test("active and malformed suspensions block immediately", () => {
    expect(isSuspended({ suspended_until: new Date(Date.now() + 10000).toISOString() })).toBe(true);
    expect(isSuspended({ suspended_until: "not-a-date" })).toBe(true);
    expect(isSuspended({ suspended_until: new Date(Date.now() - 10000).toISOString() })).toBe(false);
  });
  test("appeal path is narrowly scoped", () => {
    expect(isSuspensionException("/api/suspension/appeal-status", "GET")).toBe(true);
    expect(isSuspensionException("/api/suspension/appeal-status", "POST")).toBe(true);
    expect(isSuspensionException("/api/admin/users", "GET")).toBe(false);
  });
  test("production MFA gate fails closed", () => {
    expect(privilegedMfaReady({ NODE_ENV: "production" })).toBe(false);
    expect(privilegedMfaReady({ NODE_ENV: "production", MFA_PROVIDER: "configured", MFA_REQUIRED: "true" })).toBe(true);
  });
});
