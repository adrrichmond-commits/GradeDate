/**
 * Server-side page gate for the /admin console (closes launch-gate GAP-1).
 *
 * The admin console is strictly owner/admin only. This gate runs in the SSR
 * entry (vercel-entry.ts) BEFORE TanStack renders anything, so anonymous
 * visitors and non-owner/admin accounts (including legacy moderators and
 * regular users) never receive console markup at all — just a minimal block
 * page with standard security headers and nothing clickable.
 *
 * MFA state is deliberately NOT part of the page gate: an authenticated
 * owner/admin always gets the page (200) and the existing client-side passkey
 * step-up UI enforces the privileged session. The /api/admin/* endpoints keep
 * their own stricter owner/admin + MFA wire gates — this module never weakens
 * them.
 */

import { SECURITY_HEADERS } from "./csp";

/** True for the console page itself and any console subpath. */
export function isAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

/**
 * Page-level access decision. Role-only by design (see module doc).
 * Returns the HTTP status the page should carry: 200 (serve console),
 * 401 (no authenticated user), or 403 (authenticated but not owner/admin).
 */
export function adminPageAccessStatus(
  role: string | null | undefined,
): 200 | 401 | 403 {
  if (!role) return 401;
  return role === "owner" || role === "admin" ? 200 : 403;
}

/**
 * Minimal block page: no console markup, no sign-in prompt, no links —
 * nothing clickable that implies access.
 */
export function adminBlockPageHtml(status: 401 | 403): string {
  const heading = status === 401 ? "Unauthorized" : "Forbidden";
  const detail =
    status === 401
      ? "You are not signed in."
      : "You don't have permission to view this page.";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${heading}</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;background:#0b0b0f;color:#e5e5e5;display:grid;place-items:center;min-height:100vh;margin:0}
  main{text-align:center;padding:2rem}
  h1{font-size:1.25rem;margin:0 0 0.5rem}
  p{color:#9ca3af;font-size:0.875rem;margin:0}
</style>
</head>
<body>
<main>
  <h1>${heading}</h1>
  <p>${detail}</p>
</main>
</body>
</html>
`;
}

/** Block response carrying the standard security headers (never a console page). */
export function adminBlockResponse(status: 401 | 403, requestId: string): Response {
  return new Response(adminBlockPageHtml(status), {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow",
      ...SECURITY_HEADERS,
    },
  });
}
