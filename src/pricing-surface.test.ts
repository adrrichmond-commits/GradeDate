/**
 * Pricing/entitlement surface guards — encode the smoke-test findings so the
 * canonical offer set can't silently regress:
 *   - Premium is $5.99/month only: no annual toggle/copy/pricing anywhere.
 *   - Store regrade is the canonical $0.99 credit consumed by the multi-photo
 *     grading flow; the deprecated one-time "reveal likes" product is gone
 *     (see-who-liked-you remains a Premium-included feature, not a purchase).
 *   - Terms describe the free tier accurately (3 likes/day, 1 free regrade/week,
 *     browsing/messaging) and never claim a paid subscription is required.
 *   - Root head emits runtime-origin canonical + og:url (no hardcoded host).
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const SRC = path.join(import.meta.dir);
const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf8");

describe("canonical pricing surface (smoke-test findings)", () => {
  test("homepage offers only the monthly $5.99 Premium plan", () => {
    const index = read("routes/index.tsx");
    expect(index).not.toMatch(/annual/i);
    expect(index).not.toContain("$49.99");
    expect(index).not.toContain("/year");
    expect(index).toContain("Subscribe — $5.99/month");
    expect(index).toContain("1 free regrade per week");
  });

  test("subscribe page only accepts the monthly plan", () => {
    const subscribe = read("routes/subscribe.tsx");
    expect(subscribe).toMatch(/type Plan = "monthly"/);
    expect(subscribe).not.toMatch(/annual/i);
    expect(subscribe).toContain("price: 5.99");
  });

  test("store regrade is the canonical $0.99 credit and reveal-likes is gone", () => {
    const store = read("routes/store.tsx");
    expect(store).not.toMatch(/reveal-likes|REVEAL_LIKES_LINK|activate-reveal|likes_revealed/i);
    expect(store).not.toContain("See Who Liked You");
    // The re-grade product object (id on line N, price on line N+2) must be $0.99.
    expect(store).toMatch(/id: "re-grade"[\s\S]{0,120}price: "\$0\.99"/);
    // Boost remains the canonical $2.99/7-day offer.
    expect(store).toMatch(/id: "boost"[\s\S]{0,120}price: "\$2\.99"/);
  });

  test("Founders Club CTA uses the canonical Premium subscription route", () => {
    const store = read("routes/store.tsx");
    expect(store).toContain('to="/subscribe"');
    expect(store).toContain("Subscribe — $5.99/month");
    expect(store).toContain("Subscription-only membership at $5.99/month with a lifetime price lock.");
    expect(store).toContain("Founders Club is included with the canonical Premium subscription.");
    expect(store).not.toContain("/api/founders/checkout");
    expect(store).not.toContain("handleFoundersCheckout");
  });

  test("server accepts only monthly checkout and three canonical upsells", () => {
    const handler = read("api-handler.ts");
    expect(handler).toContain("Only the monthly Premium plan is available");
    expect(handler).not.toMatch(/reveal-likes|activate-reveal/i);
    expect(handler).toMatch(/"re-grade": process\.env\.STRIPE_REGRADE_PRICE_ID/);
  });

  test("no dead annual/reveal code remains in db.ts", () => {
    const db = read("db.ts");
    expect(db).not.toMatch(/activateAnnualSubscription|revealLikes\b/);
  });

  test("terms describe the free tier accurately and never require payment", () => {
    const terms = read("routes/terms.tsx");
    expect(terms).toContain("3 likes per day");
    expect(terms).toContain("1 free regrade per week");
    expect(terms).toContain("browse compatible profiles");
    expect(terms).toContain("A paid subscription is not required to use the Service.");
    expect(terms).not.toMatch(/required to access the Service/);
    expect(terms).toContain("$5.99 per month");
  });

  test("root head emits runtime-origin canonical and og:url without a hardcoded host", () => {
    const root = read("routes/__root.tsx");
    expect(root).toContain('rel="canonical" href={siteUrl}');
    expect(root).toContain('property="og:url" content={siteUrl}');
    expect(root).toContain("resolveCanonicalSiteUrl(");
    expect(root).not.toMatch(/gradedate\.app/);
  });
});
