/**
 * Trusted public origin resolution for absolute URLs and SEO metadata.
 *
 * A reverse proxy may expose its private HTTP host in the request URL. Never
 * reflect that value into public metadata. Production must explicitly provide
 * PUBLIC_SITE_ORIGIN (an HTTPS origin); callers fail closed when it is absent.
 */
const SSR_EVENT_STORAGE_KEY = Symbol.for("tanstack-start:event-storage");

/** Parse a full URL and return its http(s) origin, or null if unusable. */
export function originFromUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  try {
    const url = new URL(input);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** Only an explicitly configured, public HTTPS origin is trusted for metadata. */
export function configuredPublicOrigin(value = process.env.PUBLIC_SITE_ORIGIN): string | null {
  const origin = originFromUrl(value);
  if (!origin || !origin.startsWith("https://")) return null;
  try {
    const { hostname } = new URL(origin);
    if (
      hostname === "localhost" ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal") ||
      /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) ||
      hostname.includes("beamlit")
    ) return null;
  } catch {
    return null;
  }
  return origin;
}

export function ssrRequestOrigin(): string | null {
  try {
    const storage = (globalThis as Record<symbol, unknown>)[SSR_EVENT_STORAGE_KEY] as
      | { getStore?: () => { h3Event?: { req?: { url?: string } } | undefined } | undefined }
      | undefined;
    const url = storage?.getStore?.()?.h3Event?.req?.url;
    return typeof url === "string" ? originFromUrl(url) : null;
  } catch {
    return null;
  }
}

export function clientSiteOrigin(): string | null {
  if (typeof window === "undefined") return null;
  return originFromUrl(window.location.href);
}

/** Resolve only the configured public origin; request/runtime origins are untrusted. */
export function resolveSiteOrigin(_reqUrl?: string | null): string | null {
  return configuredPublicOrigin();
}

export function normalizeSitePath(path: string | null | undefined): string {
  if (!path) return "/";
  try {
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

export function resolveCanonicalSiteUrl(path: string, reqUrl?: string | null): string | null {
  const origin = resolveSiteOrigin(reqUrl);
  if (!origin) return null;
  return `${origin}${normalizeSitePath(path)}`;
}
