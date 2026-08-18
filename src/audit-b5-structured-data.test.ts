/**
 * Content guards for the site-audit Delegation B, part 3 (PR):
 *   B5 — JSON-LD structured data (Organization + Product/Offer + FAQPage) on
 *        the homepage and /pricing, and /llms.txt at the site root (audit
 *        D5.5, backlog 3d07d6e3).
 *
 * Guarantees:
 *   - FAQ_ITEMS (src/structured-data.ts) is the single source for the visible
 *     homepage FAQ AND the FAQPage schema: exactly the five B1 questions,
 *     honest answers, no invented features.
 *   - The Organization schema uses real facts: name/url/logo and the real X +
 *     TikTok social URLs rendered in the footer/homepage socials section.
 *   - The Product/Offer schema derives every price from
 *     canonical-entitlements.ts (Premium $5.99/mo, Free tier) — nothing
 *     invented.
 *   - RootDocument emits the JSON-LD for exactly "/" and "/pricing" (the same
 *     per-pathname pattern as canonical/og:url) so it is present on both pages
 *     and duplicated on no other route; index.tsx stays head-free.
 *   - public/llms.txt exists (serves at site root via the static build) and
 *     contains the real prices and key URLs — no invented numbers.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  FAQ_ITEMS,
  FOUNDER_CAP,
  GRADE_DATE_SOCIALS,
  PREMIUM_MONTHLY_PRICE,
  STRUCTURED_DATA_LD_JSON,
  STRUCTURED_DATA_PATHS,
  faqLdJson,
  organizationLdJson,
  productLdJson,
} from "./structured-data";

const SRC = path.join(import.meta.dir);
const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf8");
const llms = readFileSync(path.join(SRC, "..", "public", "llms.txt"), "utf8");

describe("FAQ single source of truth (B1 + B5 FAQPage)", () => {
  test("exactly the five B1 questions, in order", () => {
    expect(FAQ_ITEMS.map((f) => f.q)).toEqual([
      "Does AI matching actually get me dates?",
      "How does grade-level matching work?",
      "Will there be people to match with in an Austin-only beta?",
      "Is the grade private?",
      "Who is this not for?",
    ]);
  });

  test("answers are honest — no guarantees, no invented features", () => {
    const answers = FAQ_ITEMS.map((f) => f.a).join(" ");
    expect(answers).toMatch(/No guarantees/);
    expect(answers).toContain("80% people in");
    expect(answers).toContain("20% outside it");
    expect(answers).toMatch(/capped cohort/);
    expect(answers).toMatch(/private, only you see it/);
    expect(answers).toMatch(/never your grade, and never your\s+biometric data/);
    expect(answers).toMatch(/isn't for anonymous, photo-less hookups/);
  });

  test("the visible homepage FAQ renders from FAQ_ITEMS (no second copy)", () => {
    const home = read("routes/index.tsx");
    expect(home).toContain("FAQ_ITEMS.map((item) =>");
    expect(home).not.toContain("Does AI matching actually get me dates?");
  });

  test("FAQPage schema mirrors FAQ_ITEMS exactly", () => {
    const schema = faqLdJson();
    expect(schema["@type"]).toBe("FAQPage");
    const entity = schema.mainEntity as ReadonlyArray<{
      name: string;
      acceptedAnswer: { text: string };
    }>;
    expect(entity).toHaveLength(FAQ_ITEMS.length);
    entity.forEach((q, i) => {
      expect(q.name).toBe(FAQ_ITEMS[i].q);
      expect(q.acceptedAnswer.text).toBe(FAQ_ITEMS[i].a);
    });
  });
});

describe("Organization + Product JSON-LD (B5)", () => {
  test("Organization uses real identity: name, url, logo, real socials", () => {
    const org = organizationLdJson();
    expect(org["@type"]).toBe("Organization");
    expect(org.name).toBe("GradeDate");
    expect(org.url).toBe("https://gradedate.app");
    expect(org.logo).toBe("https://gradedate.app/logo.svg");
    // Socials must be the REAL links rendered in the homepage socials section
    // and footer — never invented.
    expect([...org.sameAs]).toEqual([...GRADE_DATE_SOCIALS]);
    expect(GRADE_DATE_SOCIALS).toContain("https://x.com/gradedate");
    expect(GRADE_DATE_SOCIALS).toContain("https://www.tiktok.com/@gradedate");
  });

  test("Product offers: Premium $5.99/mo USD + Free tier, from canonical constants", () => {
    const product = productLdJson();
    expect(product["@type"]).toBe("Product");
    expect(product.name).toBe("GradeDate");
    const offers = product.offers as ReadonlyArray<{
      name: string;
      price: string;
      priceCurrency: string;
    }>;
    expect(offers).toHaveLength(2);
    const premium = offers.find((o) => o.name === "Premium");
    const free = offers.find((o) => o.name === "Free tier");
    expect(premium?.price).toBe(PREMIUM_MONTHLY_PRICE.toFixed(2)); // "5.99"
    expect(premium?.priceCurrency).toBe("USD");
    expect(free?.price).toBe("0");
    expect(free?.priceCurrency).toBe("USD");
    // Free-tier limits match the enforced product rules (3 likes/day,
    // 1 free regrade/week, 5 photos).
    expect(JSON.stringify(free)).toContain("3 likes per day");
    expect(JSON.stringify(free)).toContain("1 free regrade per week");
    expect(JSON.stringify(free)).toContain("up to 5 profile photos");
  });

  test("all three schemas are in the emitted set, serializable", () => {
    const types = STRUCTURED_DATA_LD_JSON.map((j) => j["@type"]);
    expect(types).toEqual(["Organization", "Product", "FAQPage"]);
    for (const json of STRUCTURED_DATA_LD_JSON) {
      // JSON.stringify must not throw and must produce parseable JSON.
      expect(JSON.parse(JSON.stringify(json))).toBeTruthy();
    }
  });
});

describe("injection points — homepage + /pricing, no duplication", () => {
  const root = read("routes/__root.tsx");
  const home = read("routes/index.tsx");
  const pricing = read("routes/pricing.tsx");

  test("RootDocument emits the schemas per-pathname for '/' and '/pricing' only", () => {
    expect(STRUCTURED_DATA_PATHS).toEqual(["/", "/pricing"]);
    expect(root).toContain("STRUCTURED_DATA_LD_JSON.map((json) =>");
    expect(root).toContain('type="application/ld+json"');
    expect(root).toContain("dangerouslySetInnerHTML");
    // Same proven per-pathname pattern as canonical/og:url.
    expect(root).toContain("const pathname = useRouterState({ select: (state) => state.location.pathname });");
  });

  test("homepage has no head() of its own (root head applies) — structured data not duplicated", () => {
    expect(home).not.toContain("head:");
    expect(home).not.toContain("application/ld+json");
    expect(home).not.toContain("script:ld+json");
  });

  test("/pricing carries no second JSON-LD emission (RootDocument is the single source)", () => {
    expect(pricing).toContain('createFileRoute("/pricing")');
    expect(pricing).toContain("head:");
    // No duplicate structured data in the route head — RootDocument emits it
    // once for both paths.
    expect(pricing).not.toContain("application/ld+json");
    expect(pricing).not.toContain("script:ld+json");
  });

  test("static/legal pages must not carry the structured data (homepage-only schemas)", () => {
    for (const file of ["terms.tsx", "safety.tsx", "acceptable-use.tsx", "about.tsx", "customers.tsx"]) {
      const route = read(`routes/${file}`);
      expect(route, file).not.toContain("application/ld+json");
      expect(route, file).not.toContain("script:ld+json");
    }
  });
});

describe("/llms.txt (B5)", () => {
  test("exists at the site root static dir with an H1 and summary line", () => {
    expect(llms.startsWith("# GradeDate")).toBe(true);
    expect(llms).toContain("> Dating for 18–35s");
  });

  test("contains the real prices — derived from canonical-entitlements, nothing invented", () => {
    expect(llms).toContain(`$${PREMIUM_MONTHLY_PRICE}/month (USD)`); // $5.99
    expect(llms).toContain("3 likes per day");
    expect(llms).toContain("1 free regrade per week");
    expect(llms).toContain("up to 5 profile photos");
    expect(llms).toContain(`first ${FOUNDER_CAP.toLocaleString("en-US")} Premium subscribers`); // 1,000
    expect(llms).toContain("$5.99/month for life");
    // One-time upsells (real store prices): re-grade $0.99, boost $2.99,
    // 5 extra likes $0.99.
    expect(llms).toContain("re-grade credit $0.99");
    expect(llms).toContain("Profile Boost $2.99");
    expect(llms).toContain("5 Extra Likes $0.99");
    // Premium upsell price derived from the same canonical constant the
    // store UI uses (BOOST_PRICE_DISPLAY is "$2.99").
    expect(llms).toContain("$2.99");
  });

  test("covers Austin-first beta and the key URLs", () => {
    expect(llms).toContain("Austin, TX first");
    for (const url of [
      "https://gradedate.app/",
      "https://gradedate.app/pricing",
      "https://gradedate.app/about",
      "https://gradedate.app/customers",
      "https://gradedate.app/safety",
      "https://gradedate.app/acceptable-use",
      "https://gradedate.app/terms",
    ]) {
      expect(llms, url).toContain(url);
    }
  });
});
