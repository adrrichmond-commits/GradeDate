/** Crawlability policy and machine-readable SEO endpoints. */

export const PUBLIC_INDEXABLE_PATHS = [
  "/",
  "/legal",
  "/terms",
  "/privacy",
  "/privacy-geo",
  "/cookies",
  "/safety",
  "/rules",
  "/accessibility",
  "/dmca",
  "/refund",
  "/data",
] as const;

const PRIVATE_PREFIXES = [
  "/api/",
  "/uploads/",
  "/matches",
  "/connections",
  "/chat/",
  "/profile",
  "/grade",
  "/store",
  "/subscribe",
  "/logout",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
];

/** Private and user-specific surfaces must never be indexed. */
export function shouldNoIndex(pathname: string): boolean {
  const path = pathname === "/" ? pathname : pathname.replace(/\/+$/, "");
  return PRIVATE_PREFIXES.some((prefix) => path === prefix.replace(/\/$/, "") || path.startsWith(prefix));
}

/** Resolve only the origin supplied by the current request; never invent a host. */
export function requestOrigin(requestUrl: string): string | null {
  try {
    const url = new URL(requestUrl);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

export function robotsResponse(origin: string | null): Response {
  const sitemap = origin ? `\nSitemap: ${origin}/sitemap.xml\n` : "";
  return new Response(
    `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /uploads/\nDisallow: /matches\nDisallow: /connections\nDisallow: /chat/\nDisallow: /profile\nDisallow: /grade\nDisallow: /store\nDisallow: /subscribe\nDisallow: /login\nDisallow: /signup\nDisallow: /forgot-password\nDisallow: /reset-password\n${sitemap}`,
    { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } },
  );
}

export function sitemapResponse(origin: string | null): Response {
  if (!origin) return new Response("Unable to resolve site origin", { status: 400 });
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
