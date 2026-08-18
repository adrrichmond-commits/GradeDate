/** Crawlability policy and machine-readable SEO endpoints. */
import { configuredPublicOrigin } from "./site-url";

export const PUBLIC_INDEXABLE_PATHS = [
  "/", "/about", "/legal", "/terms", "/privacy", "/privacy-geo", "/cookies", "/safety", "/rules", "/accessibility", "/dmca", "/refund", "/data", "/pricing",
] as const;

const PRIVATE_PREFIXES = [
  "/api/", "/uploads/", "/admin", "/matches", "/connections", "/chat/", "/profile", "/grade", "/store", "/subscribe", "/logout", "/login", "/signup", "/forgot-password", "/reset-password",
];

export function shouldNoIndex(pathname: string): boolean {
  const path = pathname === "/" ? pathname : pathname.replace(/\/+$/, "");
  return PRIVATE_PREFIXES.some((prefix) => path === prefix.replace(/\/$/, "") || path.startsWith(prefix));
}

/** Request URL is intentionally ignored: reverse proxies can provide private HTTP hosts. */
export function requestOrigin(_requestUrl: string): string | null {
  return configuredPublicOrigin();
}

export function robotsResponse(origin: string | null): Response {
  const sitemap = origin ? `\nSitemap: ${origin}/sitemap.xml\n` : "";
  return new Response(
    `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /uploads/\nDisallow: /matches\nDisallow: /connections\nDisallow: /chat/\nDisallow: /profile\nDisallow: /grade\nDisallow: /store\nDisallow: /subscribe\nDisallow: /login\nDisallow: /signup\nDisallow: /forgot-password\nDisallow: /reset-password\n${sitemap}`,
    { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } },
  );
}

export function sitemapResponse(origin: string | null): Response {
  if (!origin) return new Response("Unable to resolve trusted site origin", { status: 404 });
  const urls = PUBLIC_INDEXABLE_PATHS.map((path) => `  <url><loc>${origin}${path}</loc></url>`).join("\n");
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } },
  );
}

export function seoResponse(request: Request): Response | null {
  const { pathname } = new URL(request.url);
  const origin = requestOrigin(request.url);
  if (pathname === "/robots.txt") return robotsResponse(origin);
  if (pathname === "/sitemap.xml") return sitemapResponse(origin);
  return null;
}
