/**
 * Content guards for the site-audit Delegation B, part 1 (PR):
 *   B1 — honest FAQ block on the homepage (audit D1.4)
 *   B2 — concrete "Example result" grade card in the demo section (D1.5/D5.5)
 *   B4 — /about stub + footer founder credit (D3.3)
 *
 * These are honest-copy guards: they pin the FAQ to the real product (no
 * invented features or guarantees), keep the demo mock clearly labeled and
 * synthetic, and keep the /about founder block honest — the owner-supplied
 * name and story are pinned as-is, the photo slot is a monogram avatar (never
 * a fake/stock person image), and the pending owner slots (photo, LinkedIn/X)
 * stay marked TODO(owner) with no dead or fake links.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const SRC = path.join(import.meta.dir);
const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf8");

describe("homepage FAQ block (audit B1)", () => {
  const home = read("routes/index.tsx");
  // The Q&A strings live in src/structured-data.ts (single source of truth,
  // audit B5): the visible FAQ block AND the FAQPage JSON-LD render from the
  // same FAQ_ITEMS array, so guards pin the shared module.
  const sd = read("structured-data.ts");

  test("sits between How It Works and the pricing section", () => {
    expect(home.indexOf('id="how-it-works"')).toBeGreaterThan(-1);
    expect(home.indexOf("<PricingSection />")).toBeGreaterThan(
      home.indexOf("Questions, answered")
    );
    expect(home.indexOf("Questions, answered")).toBeGreaterThan(
      home.indexOf('id="how-it-works"')
    );
  });

  test("covers all five audit questions in the audience's words", () => {
    expect(sd).toContain("Does AI matching actually get me dates?");
    expect(sd).toContain("How does grade-level matching work?");
    expect(sd).toContain("Will there be people to match with in an Austin-only beta?");
    expect(sd).toContain("Is the grade private?");
    expect(sd).toContain("Who is this not for?");
  });

  test("homepage FAQ renders from the shared FAQ_ITEMS source (no duplicated copy)", () => {
    // index.tsx maps the shared array; the Q&A text itself lives only in
    // structured-data.ts so visible copy and FAQPage schema can't drift.
    expect(home).toContain("FAQ_ITEMS.map((item) =>");
    expect(home).not.toContain("Does AI matching actually get me dates?");
    expect(home).not.toContain("How does grade-level matching work?");
  });

  test("answers are honest — no guarantees, no invented features", () => {
    // Honesty markers required by the audit brief.
    expect(sd).toMatch(/No guarantees/);
    expect(sd).toContain("80% people in");
    expect(sd).toContain("20% outside it");
    expect(sd).toMatch(/capped cohort/);
    // Privacy answer stays consistent with the real product/privacy page:
    // grade + percentile are "private, only you see it" (profile.index.tsx),
    // biometric data is not shared with other users (privacy.tsx §4).
    expect(sd).toMatch(/private, only you see it/);
    expect(sd).toMatch(/never your grade, and never your\s+biometric data/);
    // Negation line mirrors the footer (audit A6 / D2.B).
    expect(sd).toMatch(/isn'?t for anonymous, photo-less hookups/);
  });
});

describe("demo section example grade card (audit B2)", () => {
  const card = read("example-grade-card.tsx");

  test("is a static, clearly-labeled example — not a real member", () => {
    expect(card).toContain("EXAMPLE RESULT");
    expect(card).toContain("not a real member");
    expect(card).toContain("Example — synthetic illustration");
  });

  test("shows a grade badge, best-pic ribbon, tips, and percentile line", () => {
    expect(card).toContain("7.8");
    expect(card).toContain("/ 10");
    expect(card).toContain("Best pic");
    expect(card).toContain("Top 22% in Austin");
    // 2-3 actionable tips, plain language.
    const tips = ["Face the light", "Crop in tighter", "Lose the sunglasses"];
    for (const tip of tips) expect(card).toContain(tip);
  });

  test("carries meaningful alt text and no real person (D5.5)", () => {
    expect(card).toContain("aria-label=");
    expect(card).toContain("synthetic illustration");
    expect(card).toContain("not a real person");
    // No fake photo of a person anywhere in the mock.
    expect(card).not.toContain("og-image.png");
  });

  test("is rendered beside the interactive DemoGrader on the homepage", () => {
    const home = read("routes/index.tsx");
    expect(home).toContain("<DemoGrader />");
    expect(home).toContain("<ExampleGradeCard />");
  });
});

describe("/about stub + footer credit (audit B4)", () => {
  const about = read("routes/about.tsx");
  const root = read("routes/__root.tsx");

  test("route exists with its own title/description via the shared head helper", () => {
    expect(about).toContain('createFileRoute("/about")');
    expect(about).toContain('staticPageHead("GradeDate — About"');
    expect(about).toMatch(/head: \(\) =>\s*staticPageHead/);
  });

  test("founder block carries the owner-supplied name + story, nothing invented", () => {
    // Real founder name as supplied by the owner.
    expect(about).toMatch(/<h3[^>]*>Austin<\/h3>/);
    // The owner's first-person story (approved copy). Source wraps lines, so
    // match with whitespace-tolerant regexes.
    expect(about).toMatch(/GradeDate started as just an idea/);
    expect(about).toMatch(/dating apps just never\s+worked for me/);
    expect(about).toMatch(/make\s+honest connections with others/);
    // No invented name, link, or story claims. X is still pending (no x.com
    // link), but LinkedIn is a real owner-supplied profile and IS linked.
    expect(about).not.toMatch(/founder of GradeDate[,.]? (is|was) [A-Z]/);
    expect(about).not.toContain('href="https://x.com');
    expect(about).toContain('href="https://www.linkedin.com/in/austin-richmond-3723b7226"');
  });

  test("photo slot is a monogram avatar — no fake/stock person image", () => {
    // No <img> in the actual render output; the photo slot is an initial-based
    // avatar with an honest aria-label. Strip JSX/block comments first so the
    // instructive TODO(owner) example comments don't trip the guard.
    const code = about.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).not.toMatch(/<img\b/);
    expect(about).toContain('aria-label="Austin, founder of GradeDate"');
    expect(about).toContain("A</span>");
  });

  test("pending owner slots (photo) and X stay TODO(owner) with no dead links; LinkedIn is wired", () => {
    // Unobtrusive comment so the owner knows what to add later.
    expect(about).toContain("TODO(owner): founder photo + LinkedIn/X links");
    // X is still pending → renders as plain text ("coming soon"), never a link.
    expect(about).toContain("X — coming soon");
    expect(about).not.toContain('href="https://x.com');
    // LinkedIn is now a real owner-supplied link, opening safely in a new tab.
    expect(about).toContain("LinkedIn");
    expect(about).toContain('href="https://www.linkedin.com/in/austin-richmond-3723b7226"');
    expect(about).toContain('target="_blank"');
    expect(about).toContain('rel="noopener noreferrer"');
    expect(about).not.toContain("LinkedIn — coming soon");
  });

  test("footer credit 'Built by [Name]' links to /about with the real founder name", () => {
    expect(root).toContain('FOUNDER_CREDIT_NAME = "Austin"');
    expect(root).toContain("Built by");
    expect(root).toContain('to="/about"');
  });

  test("/about is in the public sitemap", () => {
    const seo = read("seo.ts");
    expect(seo).toContain('"/about"');
  });
});
