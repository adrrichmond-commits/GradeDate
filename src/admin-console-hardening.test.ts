import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  adminBlockPageHtml,
  adminBlockResponse,
  adminPageAccessStatus,
  isAdminPath,
} from "./admin-page-gate";
import { SECURITY_HEADERS } from "./csp";
import { shouldNoIndex } from "./seo";

describe("admin console page gate (owner/admin only, GAP-1)", () => {
  test("path matcher covers the page and its subpaths only", () => {
    expect(isAdminPath("/admin")).toBe(true);
    expect(isAdminPath("/admin/")).toBe(true);
    expect(isAdminPath("/admin/photo-review")).toBe(true);
    expect(isAdminPath("/administrative")).toBe(false);
    expect(isAdminPath("/administer")).toBe(false);
    expect(isAdminPath("/")).toBe(false);
    expect(isAdminPath("/api/admin/photo-moderation")).toBe(false);
  });

  test("anonymous -> 401, regular/moderator -> 403, owner/admin -> 200", () => {
    expect(adminPageAccessStatus(undefined)).toBe(401);
    expect(adminPageAccessStatus(null)).toBe(401);
    expect(adminPageAccessStatus("user")).toBe(403);
    expect(adminPageAccessStatus("moderator")).toBe(403);
    expect(adminPageAccessStatus("owner")).toBe(200);
    expect(adminPageAccessStatus("admin")).toBe(200);
  });

  test("block page is minimal: no console markup, no sign-in prompt, nothing clickable", () => {
    for (const status of [401, 403] as const) {
      const html = adminBlockPageHtml(status);
      expect(html).toContain(status === 401 ? "Unauthorized" : "Forbidden");
      expect(html).not.toMatch(/<a\s/i);
      expect(html).not.toMatch(/sign in|log in|login|console|dashboard/i);
      expect(html).toContain('name="robots" content="noindex, nofollow"');
    }
  });

  test("block response carries the status and standard security headers", () => {
    const res = adminBlockResponse(403, "req-1");
    expect(res.status).toBe(403);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    for (const [key] of Object.entries(SECURITY_HEADERS)) {
      expect(res.headers.get(key), `missing header ${key}`).toBeTruthy();
    }
    const anon = adminBlockResponse(401, "req-2");
    expect(anon.status).toBe(401);
  });
});

describe("admin console page gate wiring (source regression)", () => {
  const entry = readFileSync(join(import.meta.dir, "..", "vercel-entry.ts"), "utf8");
  const root = readFileSync(join(import.meta.dir, "routes", "__root.tsx"), "utf8");
  const seo = readFileSync(join(import.meta.dir, "seo.ts"), "utf8");

  test("vercel-entry.ts applies the gate before SSR for /admin paths", () => {
    expect(entry).toContain('import { getCurrentUser, handleApiRoute } from "./src/api-handler.ts";');
    expect(entry).toContain('from "./src/admin-page-gate.ts"');
    expect(entry).toContain("if (isAdminPath(pathname)) {");
    expect(entry).toContain("const access = adminPageAccessStatus(user?.role);");
    expect(entry).toContain("if (access !== 200) {");
    expect(entry).toContain("adminBlockResponse(access, requestId)");
    // The gate must run before the SSR fetch handler serves the page.
    expect(entry.indexOf("isAdminPath(pathname)")).toBeLessThan(entry.indexOf("fetchHandler.fetch(webReq)"));
    // The gate must NOT block on MFA — the page loads and the client step-up enforces it.
    expect(entry.slice(entry.indexOf("1b. Server-side hard gate"), entry.indexOf("// 2. SSR handler"))).not.toContain("mfa_verified");
  });

  test("nav Admin link is guarded by the shared isPrivilegedRole helper (no moderator branch)", () => {
    expect(root).toContain('import { isPrivilegedRole } from "~/admin-ui";');
    // Both desktop and mobile conditions must use the helper.
    const adminNav = root.match(/(isPrivilegedRole\(user\.role\)\s*&&\s*\(\s*\n\s*<NavLink to="\/admin">Admin<\/NavLink>)/g);
    const adminMobile = root.match(/(isPrivilegedRole\(user\.role\)\s*&&\s*\(\s*\n\s*<Link\s*\n\s*to="\/admin")/g);
    expect(adminNav).not.toBeNull();
    expect(adminMobile).not.toBeNull();
    // No inline owner/admin/moderator literal may gate the Admin link anymore.
    expect(root).not.toContain('user.role === "moderator"');
    expect(root).not.toContain('"owner", "admin", "moderator"');
  });

  test("the /admin page is excluded from search indexing", () => {
    expect(seo).toContain('"/admin"');
    expect(shouldNoIndex("/admin")).toBe(true);
    expect(shouldNoIndex("/admin/")).toBe(true);
    expect(shouldNoIndex("/admin/photo-review")).toBe(true);
  });
});
