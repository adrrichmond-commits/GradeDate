/**
 * /pricing route guards (owner ask, "FIT"):
 *   - The route file exists and resolves to "/pricing" with REAL pricing
 *     content (NOT a redirect to /#pricing) so the URL stays measurable as a
 *     landing page and works for direct links/ads.
 *   - The shared pricing-sections module (single source for the homepage AND
 *     the /pricing route) exports both sections and carries the real offer:
 *     Free $0 + Premium $5.99/month + Founders Club. No copy drift.
 *   - The route carries its own head() (title/description/OG) — the canonical
 *     link is auto-resolved per pathname by RootDocument
 *     (resolveCanonicalSiteUrl), so /pricing needs no hardcoded canonical.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const SRC = path.join(import.meta.dir);
const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf8");

describe("pricing route", () => {
  test("shared module exports the pricing and founders sections", () => {
    const sections = read("pricing-sections.tsx");
    expect(sections).toContain("export { PricingSection, FoundersClubSection };");
    expect(sections).toContain("function PricingSection()");
    expect(sections).toContain("function FoundersClubSection(");
    // The real tiers render from the module: Free $0, Premium $5.99 monthly.
    expect(sections).toContain("$0");
    expect(sections).toContain("$5.99");
    expect(sections).toContain("/month");
    expect(sections).not.toMatch(/annual/i);
    expect(sections).toContain("Founders Club");
  });

  test("route file exists and renders the shared sections at /pricing", () => {
    const route = read("routes/pricing.tsx");
    expect(route).toContain('createFileRoute("/pricing")');
    expect(route).toContain(
      'import { PricingSection, FoundersClubSection } from "~/pricing-sections";'
    );
    expect(route).toContain("<PricingSection />");
    expect(route).toContain("<FoundersClubSection");
    // Real rendered content — never a redirect or a hash-fragment hand-off.
    expect(route).not.toMatch(/redirect/i);
    expect(route).not.toContain('href="/#pricing"');
  });

  test("route carries a head() with title and description meta", () => {
    const route = read("routes/pricing.tsx");
    expect(route).toContain("head: () => ({");
    expect(route).toMatch(/{ title: "GradeDate — Pricing" }/);
    expect(route).toMatch(/name: "description",/);
    expect(route).toMatch(/property: "og:title",/);
    expect(route).toMatch(/name: "twitter:title",/);
  });

  test("canonical for /pricing is auto-resolved per pathname by RootDocument", () => {
    const root = read("routes/__root.tsx");
    expect(root).toContain("const siteUrl = resolveCanonicalSiteUrl(pathname) ?? pathname;");
    expect(root).toContain('<link rel="canonical" href={siteUrl} />');
  });

  test("homepage still renders the same shared sections (no drift)", () => {
    const index = read("routes/index.tsx");
    expect(index).toContain("import { PricingSection, FoundersClubSection } from \"~/pricing-sections\";");
    expect(index).toContain('<section id="pricing" className="scroll-mt-24 px-4 py-24">');
    expect(index).toContain("<PricingSection />");
    expect(index).toContain("<FoundersClubSection");
    // The nav "Pricing" entry points at the real /pricing route (audit A1) —
    // the homepage section still renders the same shared sections.
    expect(read("nav-anchors.tsx")).toContain('{ label: "Pricing", sectionId: "pricing", href: "/pricing" }');
  });
});
