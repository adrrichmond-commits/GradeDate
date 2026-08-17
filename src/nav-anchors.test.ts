/**
 * Homepage nav anchors (owner ask, D2.4):
 *   - The fixed top nav NEVER renders the pulsing loading skeleton; anonymous
 *     visitors on "/" get four labeled anchor links — How It Works, Pricing,
 *     Try the Demo, Join Waitlist — that scroll to their homepage sections.
 *   - The demo section has an id so "Try the Demo" has a scroll target.
 *   - All four scroll targets carry a scroll-margin-top offset (scroll-mt-24)
 *     so the fixed 64px header never covers the section heading, and smooth
 *     scrolling is enabled at the base layer.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const SRC = path.join(import.meta.dir);
const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf8");

describe("homepage nav anchors (D2.4)", () => {
  test("the four anchors are defined once with the right labels and hrefs", () => {
    const anchors = read("nav-anchors.tsx");
    expect(anchors).toContain('{ label: "How It Works", sectionId: "how-it-works" }');
    expect(anchors).toContain('{ label: "Pricing", sectionId: "pricing" }');
    expect(anchors).toContain('{ label: "Try the Demo", sectionId: "demo" }');
    expect(anchors).toContain('{ label: "Join Waitlist", sectionId: "waitlist" }');
    // Plain hash anchors from "/" — native fragment navigation, no reload.
    expect(anchors).toContain("return `/#${sectionId}`;");
  });

  test("__root.tsx renders the anchors and never renders the skeleton", () => {
    const root = read("routes/__root.tsx");
    expect(root).toContain(
      'import { HOME_ANCHORS, HomeAnchorLinks, homeAnchorHref } from "~/nav-anchors";'
    );
    // Desktop anchors are rendered inside the anonymous nav branch.
    expect(root).toContain("<HomeAnchorLinks");
    // The mobile menu maps the same anchor list.
    expect(root).toContain("HOME_ANCHORS.map((a) =>");
    expect(root).toContain("homeAnchorHref(a.sectionId)");
    // The pulsing loading skeleton must NEVER render in the nav.
    expect(root).not.toContain("animate-pulse");
    // Login/Sign Up remain reachable for anonymous visitors on every route.
    expect(root).toContain('to="/login"');
    expect(root).toContain('to="/signup"');
  });

  test("the demo section id exists and all four targets clear the fixed header", () => {
    const index = read("routes/index.tsx");
    expect(index).toContain('<section id="demo"');
    expect(index).toContain('<section id="how-it-works" className="scroll-mt-24 px-4 py-24">');
    expect(index).toContain(
      '<section id="demo" className="relative scroll-mt-24 overflow-hidden px-4 py-24">'
    );
    expect(index).toContain('<section id="pricing" className="scroll-mt-24 px-4 py-24">');
    expect(index).toContain('<section id="waitlist" className="scroll-mt-24 px-4 py-24">');
  });

  test("smooth scrolling is enabled at the base layer (reduced-motion safe)", () => {
    const css = read("styles/app.css");
    expect(css).toMatch(/html,\s*body\s*\{\s*@apply scroll-smooth/);
    // The reduced-motion override forces scroll-behavior back to auto.
    expect(css).toContain("scroll-behavior: auto !important");
  });
});
