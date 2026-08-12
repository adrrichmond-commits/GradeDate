import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { validateNewPassword } from "./api-handler";

describe("validateNewPassword (shared signup/reset/change-password rule)", () => {
  test("rejects passwords shorter than 6 characters with the app-standard message", () => {
    expect(validateNewPassword("")).toBe("Password must be at least 6 characters");
    expect(validateNewPassword("abcde")).toBe("Password must be at least 6 characters");
  });
  test("accepts passwords of exactly 6 characters", () => {
    expect(validateNewPassword("abcdef")).toBeNull();
  });
  test("accepts longer passwords", () => {
    expect(validateNewPassword("correct-horse-battery-staple")).toBeNull();
  });
  test("rejects non-string values defensively", () => {
    expect(validateNewPassword(undefined as unknown as string)).toBe(
      "Password must be at least 6 characters",
    );
    expect(validateNewPassword(12345 as unknown as string)).toBe(
      "Password must be at least 6 characters",
    );
  });
});

describe("change-password endpoint wiring", () => {
  const source = readFileSync(new URL("./api-handler.ts", import.meta.url), "utf8");
  test("POST /api/auth/change-password is routed through CSRF", () => {
    expect(source).toContain(
      'if (pathname === "/api/auth/change-password" && method === "POST") {',
    );
    expect(source).toContain("const csrfErr = checkCsrf(req);");
    expect(source).toContain("return handleChangePassword(req);");
  });
  test("handler requires a session and verifies the current password", () => {
    expect(source).toContain("async function handleChangePassword(req: Request): Promise<Response> {");
    expect(source).toContain('json({ error: "Unauthorized" }, 401)');
    expect(source).toContain('json({ error: "Current password is incorrect" }, 401)');
  });
  test("handler audits privileged-role password changes", () => {
    expect(source).toContain('action: "password.change"');
    expect(source).toContain("actorRole: user.role");
  });
});

describe("profile page change-password section", () => {
  const source = readFileSync(
    new URL("./routes/profile.index.tsx", import.meta.url),
    "utf8",
  );
  test("renders a Change password section for all users with current/new/confirm inputs", () => {
    expect(source).toContain("Change password");
    expect(source).toContain('autoComplete="current-password"');
    expect(source).toContain('autoComplete="new-password"');
    expect(source).toContain("Password changed successfully.");
  });
  test("posts to the change-password endpoint with a CSRF token", () => {
    expect(source).toContain('fetch("/api/auth/change-password", {');
    expect(source).toContain('"X-CSRF-Token": token');
  });
});
