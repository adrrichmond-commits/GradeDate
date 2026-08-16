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
    // Boost remains the canonical $2.99/7-day offer. The store now sources
    // the price from the shared constant (same source the profile page uses)
    // so both surfaces can't drift — assert the constant and its value.
    expect(store).toMatch(/id: "boost"[\s\S]{0,120}price: BOOST_PRICE_DISPLAY/);
    const entitlements = read("canonical-entitlements.ts");
    expect(entitlements).toMatch(/BOOST_PRICE_DISPLAY = "\$2\.99"/);
    expect(entitlements).toMatch(/BOOST_DURATION_DAYS = 7/);
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
    expect(handler).toMatch(/case "re-grade": return process\.env\.STRIPE_REGRADE_PRICE_ID/);
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

  test("profile boost upsell price matches the canonical store price", () => {
    const profile = read("routes/profile.index.tsx");
    // The profile page must render the canonical $2.99/7-day boost (PR fix
    // for the stale $3.99) — sourced from the same constants the store uses
    // so the two surfaces can't drift again.
    expect(profile).toContain("BOOST_PRICE_DISPLAY");
    expect(profile).toContain("BOOST_DURATION_DAYS");
    expect(profile).toContain("Boost Profile — {BOOST_PRICE_DISPLAY} · {BOOST_DURATION_DAYS} days of top placement");
    expect(profile).not.toMatch(/\$3\.99/);
    const store = read("routes/store.tsx");
    expect(store).toMatch(/id: "boost"[\s\S]{0,120}price: BOOST_PRICE_DISPLAY/);
  });

  test("landing page gates paid CTAs for anonymous visitors", () => {
    const index = read("routes/index.tsx");
    expect(index).toContain('import { useAuth } from "~/auth-context";');
    expect(index).toContain("const signedIn = !!user;");
    // Anonymous path points at /signup, not the auth-required /subscribe page.
    expect(index).toContain('to={signedIn ? "/subscribe" : "/signup"}');
    expect(index).toContain("Create a free account");
  });

  test("honest premium CTA copy: real hooks, no false browsing claims", () => {
    const grade = read("routes/grade.tsx");
    expect(grade).not.toContain("Subscribe to browse matches at your grade level");
    expect(grade).toContain("Get unlimited likes, premium regrades, a profile boost, and see who liked you");
    const subscribe = read("routes/subscribe.tsx");
    expect(subscribe).toContain("Get unlimited likes, see who liked you, premium regrades, and a\n          profile boost. $5.99/mo — cancel anytime.");
    const banner = read("subscription-guard.tsx");
    expect(banner).not.toContain("access full features");
    expect(banner).toContain("Unlimited likes, see who liked you, premium regrades, and a");
  });

  test("signup surfaces the 14-day trial and disambiguates invite/referral copy", () => {
    const signup = read("routes/signup.tsx");
    expect(signup).toContain("Your 14-day Premium trial is active");
    expect(signup).toContain("Start your 14-day Premium trial");
    expect(signup).toContain("Enter your invite or referral code");
    expect(signup).toContain("Invite / Referral Code");
    // Referral reward copy must match server behavior (14-day trial for
    // invites, one month for referrals) — never a blanket "free month".
    expect(signup).not.toContain("claim your free month");
    expect(signup).not.toContain("both get 1 month free");
    expect(signup).toContain("Invite codes start a 14-day Premium trial. Referral codes");
  });

  test("demo labels are honest AND consistent with the real grader", () => {
    const index = read("routes/index.tsx");
    // The homepage widget is a simulated preview of the real AI grader — never
    // claim the demo output is real analysis, never imply the product is fake.
    expect(index).toContain("Simulated demo — a preview of our real AI grading");
    expect(index).not.toContain("not real AI analysis");
    expect(index).not.toContain("demo only, no real analysis");
    expect(index).toContain("simulated preview of the real AI grader");
    // The real /grade flow keeps its honest AI-assisted label.
    const grade = read("routes/grade.tsx");
    expect(grade).toContain("AI-assisted grade");
  });

  test("photo count is 5 everywhere on the profile page", () => {
    const profile = read("routes/profile.index.tsx");
    expect(profile).toContain("const totalSlots = 5;");
    expect(profile).toContain("Photos ({editPhotos.length}/5)");
    expect(profile).toContain("Upload up to 5 photos. Tap the ★ to set your primary photo.");
    expect(profile).not.toContain("totalSlots = 6");
    expect(profile).not.toContain("Upload up to 6 photos");
  });

  test("root head emits runtime-origin canonical and og:url without a hardcoded host", () => {
    const root = read("routes/__root.tsx");
    // canonical + og:url must stay runtime-origin resolved (never a hardcoded host)…
    const canonicalLine = root.match(/<link rel="canonical"[^>]*>/)?.[0] ?? "";
    const ogUrlLine = root.match(/property="og:url"[^>]*/)?.[0] ?? "";
    expect(canonicalLine).toContain("siteUrl");
    expect(canonicalLine).not.toMatch(/gradedate\.app/);
    expect(ogUrlLine).toContain("siteUrl");
    expect(ogUrlLine).not.toMatch(/gradedate\.app/);
    expect(root).toContain("resolveCanonicalSiteUrl(");
    // …but share-preview images must be absolute so link cards render everywhere.
    expect(root).toContain('{ property: "og:image", content: "https://gradedate.app/og-image.png" }');
    expect(root).toContain('{ name: "twitter:image", content: "https://gradedate.app/og-image.png" }');
    expect(root).toContain('{ property: "og:image:width", content: "1200" }');
    expect(root).toContain('{ property: "og:image:height", content: "630" }');
  });
});

describe("acceptable use policy surface", () => {
  test("publishes the policy and its legal cross-links", () => {
    const policy = read("routes/acceptable-use.tsx");
    expect(policy).toContain("18 or older");
    expect(policy).toContain("underage");
    expect(policy).toMatch(/harass/i);
    expect(policy).toContain("spam");
    expect(policy).toContain("one appeal within 14 days");
    expect(policy).toContain("quarantine");
    expect(policy).toContain('to="/contact"');
    expect(read("routes/__root.tsx")).toContain('to="/acceptable-use"');
    expect(read("routes/terms.tsx")).toContain('to="/acceptable-use"');
  });
});
