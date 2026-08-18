/**
 * Audit A2 — page head de-duplication + distinct titles for legal/static pages.
 *
 * Guarantees:
 *   - The root default head (home title/description/OG/Twitter) lives ONLY in
 *     the root route head(); RootDocument no longer hardcodes a <title>/meta
 *     block, so every page emits exactly one <title> (the route's own when it
 *     provides one, the root default otherwise).
 *   - Every legal/static page carries its own distinct "GradeDate — <Page>"
 *     title plus an honest one-line description and matching OG/Twitter meta,
 *     built through the shared staticPageHead helper.
 *   - The per-pathname canonical + og:url stay runtime-origin resolved in
 *     RootDocument (never a hardcoded host).
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const SRC = path.join(import.meta.dir);
const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf8");

const HOME_DEFAULT_TITLE = "GradeDate — Austin, TX Goes First. Join the Waitlist.";

// Route file -> expected distinct title. Takedown is included for consistency
// (it is a legal/static page linked from the footer).
const LEGAL_PAGES: Record<string, string> = {
  "acceptable-use": "GradeDate — Acceptable Use Policy",
  accessibility: "GradeDate — Accessibility",
  cookies: "GradeDate — Cookie Policy",
  contact: "GradeDate — Contact Us",
  data: "GradeDate — Data Rights",
  dmca: "GradeDate — DMCA Policy",
  legal: "GradeDate — Law Enforcement Guidelines",
  privacy: "GradeDate — Privacy Policy",
  "privacy-geo": "GradeDate — Geolocation Privacy",
  refund: "GradeDate — Refund Policy",
  rules: "GradeDate — Photo & Content Rules",
  safety: "GradeDate — Safety Tips",
  terms: "GradeDate — Terms of Service",
  takedown: "GradeDate — Takedown Process",
};

describe("audit A2: page head de-duplication", () => {
  test("RootDocument no longer hardcodes a <title> or home-default meta block", () => {
    const root = read("routes/__root.tsx");
    // The home default title may only appear inside the root head() meta
    // (single source of truth) — never as a literal <title> element. Scope the
    // check to the rendered <head> block so code comments don't false-positive.
    const headBlock = root.match(/<HeadContent \/>[\s\S]*?<\/head>/)?.[0] ?? "";
    expect(headBlock).not.toContain("<title>");
    expect(headBlock).not.toMatch(/<meta name="description" content=/);
    expect(headBlock).not.toMatch(/<meta property="og:title" content=/);
    // HeadContent renders the merged route heads; the per-pathname canonical
    // and og:url remain in RootDocument, runtime-origin resolved.
    expect(root).toContain("<HeadContent />");
    expect(root).toContain('<meta property="og:url" content={siteUrl} />');
    expect(root).toContain('<link rel="canonical" href={siteUrl} />');
    // The home default title still exists as the root head() default.
    const headMetaCount = (root.match(new RegExp(`"${HOME_DEFAULT_TITLE.replace(/"/g, '\\"')}"`, "g")) ?? []).length;
    expect(headMetaCount).toBeGreaterThanOrEqual(3); // title + og:title + twitter:title
  });

  test("homepage default title lives only in the root head(), not in page heads", () => {
    // index.tsx must not set its own conflicting title (root default applies).
    expect(read("routes/index.tsx")).not.toContain("head:");
    expect(read("routes/index.tsx")).not.toContain(HOME_DEFAULT_TITLE);
  });

  test("every legal/static page carries its own distinct head via staticPageHead", () => {
    for (const [file, title] of Object.entries(LEGAL_PAGES)) {
      const route = read(`routes/${file}.tsx`);
      expect(route).toContain('import { staticPageHead } from "~/route-heads";');
      expect(route).toContain(`head: () => staticPageHead(`);
      expect(route).toContain(`"${title}"`);
      // Never the home default title on a legal page.
      expect(route).not.toContain(HOME_DEFAULT_TITLE);
    }
    // Titles are all distinct.
    const titles = Object.values(LEGAL_PAGES);
    expect(new Set(titles).size).toBe(titles.length);
  });

  test("each legal head carries a non-empty honest description and OG/Twitter meta", () => {
    const helper = read("route-heads.ts");
    expect(helper).toContain('{ title }');
    expect(helper).toContain('{ name: "description", content: description }');
    expect(helper).toContain('{ property: "og:title", content: title }');
    expect(helper).toContain('{ property: "og:description", content: description }');
    expect(helper).toContain('{ name: "twitter:title", content: title }');
    expect(helper).toContain('{ name: "twitter:description", content: description }');
    for (const file of Object.keys(LEGAL_PAGES)) {
      const route = read(`routes/${file}.tsx`);
      const descMatch = route.match(/staticPageHead\("[^"]+", "([^"]+)"\)/);
      expect(descMatch, `${file} must carry a description`).not.toBeNull();
      const desc = descMatch![1];
      expect(desc.length).toBeGreaterThan(20);
      expect(desc).not.toContain("TODO");
      expect(desc).not.toContain("Austin, TX Goes First");
    }
  });

  test("pricing keeps its own head and RootDocument still auto-resolves its canonical", () => {
    const pricing = read("routes/pricing.tsx");
    expect(pricing).toContain('{ title: "GradeDate — Pricing" }');
    expect(pricing).toMatch(/name: "description",/);
    const root = read("routes/__root.tsx");
    expect(root).toContain("const siteUrl = resolveCanonicalSiteUrl(pathname) ?? pathname;");
    expect(root).toContain('<link rel="canonical" href={siteUrl} />');
    expect(root).toContain('{ property: "og:image", content: "https://gradedate.app/og-image.png" }');
  });
});
