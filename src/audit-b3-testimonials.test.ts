/**
 * Content guards for the site-audit Delegation B, part 2 (PR):
 *   B3 — testimonial wall on the homepage + /customers page (audit D3.2)
 *
 * These are honest-copy guards: the wall renders from a TESTIMONIALS array
 * that must stay EMPTY (no invented quotes, names, roles, or photos) until
 * the owner supplies real, member-approved stories; the design keeps
 * SLOT_COUNT reserved cards (5-8) so filling it later is a content swap;
 * /customers carries its own head and is publicly indexable; the footer
 * links to it next to /about.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const SRC = path.join(import.meta.dir);
const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf8");

describe("homepage testimonial wall (audit B3)", () => {
  const home = read("routes/index.tsx");
  const module = read("testimonials-section.tsx");
  test("renders the shared section between FAQ and pricing (audit order)", () => {
    expect(home).toContain("<TestimonialsSection />");
    expect(home.indexOf("Questions, answered")).toBeGreaterThan(-1);
    expect(home.indexOf("<TestimonialsSection />")).toBeGreaterThan(
      home.indexOf("Questions, answered")
    );
    expect(home.indexOf("<PricingSection />")).toBeGreaterThan(
      home.indexOf("<TestimonialsSection />")
    );
  });
  test("TESTIMONIALS array is EMPTY — honest empty state, nothing invented", () => {
    // The array literal must be empty: only the TODO(owner) comment inside.
    expect(module).toMatch(
      /export const TESTIMONIALS: Testimonial\[\] = \[\s*\/\/ TODO\(owner\): 5-8 real beta/
    );
    // No filled-in fields anywhere (the only `first name:`/`quote:` tokens
    // are the …-placeholder examples inside the TODO comment).
    expect(module).not.toMatch(/firstName: "(?!…")/);
    expect(module).not.toMatch(/quote: "(?!…")/);
    expect(module).not.toMatch(/photoAlt: "(?!…")/);
    expect(module).not.toMatch(/role: "(?!…")/);
  });
  test("renders the honest empty-state message + reserved card slots (5-8)", () => {
    expect(module).toContain(
      "Beta testers&apos; stories are on the way — we&apos;ll publish real results as the Austin beta rolls out."
    );
    expect(module).toContain("Real quote coming soon");
    const slotMatch = module.match(/export const SLOT_COUNT = (\d+);/);
    expect(slotMatch).not.toBeNull();
    const slotCount = Number(slotMatch![1]);
    expect(slotCount).toBeGreaterThanOrEqual(5);
    expect(slotCount).toBeLessThanOrEqual(8);
    expect(module).toContain("Array.from({ length: SLOT_COUNT }");
  });
  test("slot template matches the audit: first name + role + photo + specific outcome", () => {
    // The type documents the exact per-quote slots.
    expect(module).toContain("firstName: string;");
    expect(module).toContain("role: string;");
    expect(module).toContain("photoAlt: string;");
    expect(module).toContain("quote: string;");
  });
});

describe("/customers page (audit B3)", () => {
  const route = read("routes/customers.tsx");
  test("route exists with its own title/description via the shared head helper", () => {
    expect(route).toContain('createFileRoute("/customers")');
    expect(route).toContain(
      'staticPageHead("GradeDate — Customer Stories"'
    );
    expect(route).toMatch(/head: \(\) =>\s*staticPageHead/);
  });
  test("renders the shared wall and links to /contact for story submissions", () => {
    expect(route).toContain("<TestimonialsSection showMoreLink={false} />");
    expect(route).toContain('to="/contact"');
    expect(route).toContain("Tell us your story");
  });
  test("no fabricated quotes anywhere on the page", () => {
    expect(route).not.toMatch(/firstName:|quote: |photoAlt: |role: /);
  });
  test("/customers is in the public sitemap and linked from the footer next to /about", () => {
    const seo = read("seo.ts");
    expect(seo).toContain('"/customers"');
    const root = read("routes/__root.tsx");
    expect(root).toContain('to="/customers"');
    expect(root).toContain('to="/about"');
    expect(root.indexOf('to="/customers"')).toBeGreaterThan(
      root.indexOf('to="/about"')
    );
  });
});
