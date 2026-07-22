import { webcrypto } from "node:crypto";

export const CSRF_COOKIE = "csrf_token";
const CSRF_HEADER = "X-CSRF-Token";

/**
 * Generate a cryptographically random CSRF token.
 */
export function generateCsrfToken(): string {
  const bytes = webcrypto.getRandomValues(new Uint8Array(32));
  return Buffer.from(bytes).toString("hex");
}

/**
 * Set the CSRF token cookie on a response.
 * This cookie is NOT HttpOnly so JavaScript can read it for fetch requests.
 */
export function setCsrfCookie(response: Response, token: string): Response {
  const headers = new Headers(response.headers);
  headers.set(
    "Set-Cookie",
    `${CSRF_COOKIE}=${token}; Secure; SameSite=Lax; Path=/; Max-Age=604800`,
  );
  return new Response(response.body, {
    status: response.status,
    headers,
  });
}

/**
 * Verify that the X-CSRF-Token header matches the csrf_token cookie.
 * Returns true if valid, false if invalid or missing.
 */
export function verifyCsrfToken(req: Request): boolean {
  const cookie = req.headers.get("cookie");
  if (!cookie) return false;

  const csrfMatch = cookie.match(
    new RegExp(`${CSRF_COOKIE}=([^;]+)`),
  );
  const cookieToken = csrfMatch ? csrfMatch[1] : null;
  if (!cookieToken) return false;

  const headerToken = req.headers.get(CSRF_HEADER);
  if (!headerToken) return false;

  // Constant-time comparison
  if (cookieToken.length !== headerToken.length) return false;
  let equal = true;
  for (let i = 0; i < cookieToken.length; i++) {
    if (cookieToken[i] !== headerToken[i]) equal = false;
  }
  return equal;
}

/**
 * Extract the CSRF token from headers or cookies for use in forms.
 */
export function getCsrfTokenFromRequest(req: Request): string | null {
  const cookie = req.headers.get("cookie");
  if (!cookie) return null;
  const match = cookie.match(new RegExp(`${CSRF_COOKIE}=([^;]+)`));
  return match ? match[1] : null;
}
