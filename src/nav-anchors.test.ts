/**
 * Homepage nav anchors (owner ask, D2.4; audit A1):
 *   - The fixed top nav NEVER renders the pulsing loading skeleton; anonymous
 *     visitors on "/" get four labeled anchor links — How It Works, Pricing,
 *     Try the Demo, Join Waitlist. How It Works / Try the Demo / Join Waitlist
 *     scroll to their homepage sections; Pricing navigates to the real
 *     /pricing route via a per-entry href override.
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
    expect(anchors).toContain('{ label: "Pricing", sectionId: "pricing", href: "/pricing" }');
    expect(anchors).toContain('{ label: "Try the Demo", sectionId: "demo" }');
    expect(anchors).toContain('{ label: "Join Waitlist", sectionId: "waitlist" }');
    // Non-override entries stay plain hash anchors from "/" — native fragment
    // navigation, no reload; an optional href overrides to a real route.
    expect(anchors).toContain("return anchor.href ?? `/#${anchor.sectionId}`;");
  });

  test("the Pricing entry is the only route override; others stay fragments (audit A1)", () => {
    const anchors = read("nav-anchors.tsx");
    // Pricing points at the real /pricing route…
    expect(anchors).toMatch(/\{ label: "Pricing", sectionId: "pricing", href: "\/pricing" \}/);
    // …and no other entry has an href override.
    expect(anchors.match(/"href":/g)).toBeNull();
    expect((anchors.match(/href: "/g) ?? []).length).toBe(1);
    // The resolved-href helper is what both desktop and mobile render.
    expect(anchors).toContain("href={homeAnchorHref(a)}");
    const root = read("routes/__root.tsx");
    expect(root).toContain("href={homeAnchorHref(a)}");
    // Mobile menu: route-override entries let the browser navigate (no
    // preventDefault) while fragment entries keep the smooth scroll.
    expect(root).toContain("if (a.href) { setMenuOpen(false); return; }");
    expect(root).toContain("scrollToSection(a.sectionId)");
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
    expect(root).toContain("homeAnchorHref(a)");
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
