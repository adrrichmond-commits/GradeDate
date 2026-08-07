import { describe, expect, test } from "bun:test";
process.env.PUBLIC_SITE_ORIGIN = "https://gradedate.app";

import { PUBLIC_INDEXABLE_PATHS, requestOrigin, robotsResponse, seoResponse, shouldNoIndex, sitemapResponse } from "./seo";

describe("crawlability policy", () => {
  test("keeps private and API surfaces out of indexes", () => {
    expect(shouldNoIndex("/api/profile")).toBe(true);
    expect(shouldNoIndex("/matches")).toBe(true);
    expect(shouldNoIndex("/chat/abc")).toBe(true);
    expect(shouldNoIndex("/profile/123")).toBe(true);
    expect(shouldNoIndex("/")).toBe(false);
    expect(shouldNoIndex("/terms")).toBe(false);
  });

  test("robots allows public pages and disallows private paths", async () => {
    const body = await robotsResponse("https://example.test").text();
    expect(body).toContain("Allow: /");
    expect(body).toContain("Disallow: /api/");
    expect(body).toContain("Disallow: /matches");
    expect(body).toContain("Sitemap: https://example.test/sitemap.xml");
  });

  test("sitemap uses the request origin and only public routes", async () => {
    const response = sitemapResponse("https://preview.example");
    expect(response.headers.get("content-type")).toContain("application/xml");
    const body = await response.text();
    for (const path of PUBLIC_INDEXABLE_PATHS) expect(body).toContain(`https://preview.example${path}`);
    expect(body).not.toContain("/api/");
    expect(body).not.toContain("/matches");
  });

  test("machine endpoints derive origin from current request", () => {
    expect(requestOrigin("http://private.proxy/robots.txt?x=1")).toBe("https://gradedate.app");
    expect(seoResponse(new Request("https://site.example/sitemap.xml"))).not.toBeNull();
    expect(seoResponse(new Request("https://site.example/"))).toBeNull();
  });
});
