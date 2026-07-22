/**
 * Read the CSRF token from the csrf_token cookie.
 * Returns null if not found.
 */
export function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return match ? match[1] : null;
}

/**
 * Fetch wrapper that automatically includes the CSRF token header
 * for state-changing requests (POST, PUT, DELETE, PATCH).
 */
export async function csrfFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const method = (options.method || "GET").toUpperCase();
  const csrfToken = getCsrfToken();

  const headers = new Headers(options.headers);
  if (csrfToken && ["POST", "PUT", "DELETE", "PATCH"].includes(method)) {
    headers.set("X-CSRF-Token", csrfToken);
  }

  return fetch(url, { ...options, headers });
}
