/**
 * Single source of truth for building absolute app URLs: referral share links,
 * share text/URLs, and canonical + Open Graph metadata.
 *
 * Resolution order — chosen so no hardcoded domain is ever needed:
 *   1. Server request URL origin, when the caller has the Request (or its URL)
 *      — the origin the visitor actually used. Same pattern as the Stripe
 *      checkout redirect helpers in `stripe-redirects.ts`.
 *   2. SSR request origin — the real request URL of the page being server-
 *      rendered (read from TanStack Start's SSR event scope).
 *   3. Client runtime origin — `window.location` once JS is running.
 *   4. `null` — callers degrade to a relative URL or omit the tag.
 *
 * Only http(s) origins are ever accepted, and always derived from a full
 * request URL — a bare or untrusted `Host` header is never used on its own.
 */
const SSR_EVENT_STORAGE_KEY = Symbol.for("tanstack-start:event-storage");

/** Parse a full URL and return its http(s) origin, or null if unusable. */
export function originFromUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  try {
    const url = new URL(input);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    // `URL.origin` never carries a path, query, or trailing slash.
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Origin of the page currently being server-rendered, read from TanStack
 * Start's SSR event scope (the same storage `getRequest()` uses). Returns null
 * outside SSR (client renders, unit tests, non-TanStack runtimes).
 */
export function ssrRequestOrigin(): string | null {
  try {
    const storage = (
      globalThis as Record<symbol, unknown>
    )[SSR_EVENT_STORAGE_KEY] as
      | { getStore?: () => { h3Event?: { req?: { url?: string } } | undefined } | undefined }
      | undefined;
    const url = storage?.getStore?.()?.h3Event?.req?.url;
    return typeof url === "string" ? originFromUrl(url) : null;
  } catch {
    return null;
  }
}

/** Origin of the browser context the app is running in, or null server-side. */
export function clientSiteOrigin(): string | null {
  if (typeof window === "undefined") return null;
  return originFromUrl(window.location.href);
}

/**
 * Resolve the app origin: explicit request URL first, then the SSR request,
 * then the client runtime origin.
 */
export function resolveSiteOrigin(reqUrl?: string | null): string | null {
  return originFromUrl(reqUrl) ?? ssrRequestOrigin() ?? clientSiteOrigin();
}

/**
 * Resolve an absolute app URL for the given path. Returns null when no origin
 * can be determined — callers decide how to degrade (relative URL, omit tag).
 */
/** Normalize a pathname for canonical URLs; never carry query/hash into metadata. */
export function normalizeSitePath(path: string | null | undefined): string {
  if (!path) return "/";
  try {
    // URL parsing also safely handles callers that accidentally provide a full URL.
    const parsed = new URL(path, "https://canonical.invalid");
    const pathname = parsed.pathname || "/";
    return pathname === "/" ? "/" : `/${pathname.replace(/^\/+|\/+$/g, "")}`;
  } catch {
    const pathname = path.split(/[?#]/, 1)[0] || "/";
    return pathname === "/" ? "/" : `/${pathname.replace(/^\/+|\/+$/g, "")}`;
  }
}

export function resolveSiteUrl(path: string, reqUrl?: string | null): string | null {
  const origin = resolveSiteOrigin(reqUrl);
  if (!origin) return null;
  const joined = path.startsWith("/") ? path : `/${path}`;
  return `${origin}${joined}`;
}

/** Build a canonical URL from a pathname, excluding query strings and fragments. */
export function resolveCanonicalSiteUrl(path: string, reqUrl?: string | null): string | null {
  const origin = resolveSiteOrigin(reqUrl);
  if (!origin) return null;
  return `${origin}${normalizeSitePath(path)}`;
}
