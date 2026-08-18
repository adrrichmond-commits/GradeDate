/**
 * Structured data (JSON-LD) for GradeDate's public pages (site-audit B5 / D5.5,
 * backlog 3d07d6e3: "Organization + Product JSON-LD in homepage <head> and
 * /llms.txt at site root").
 *
 * This module is the single source of truth for:
 *  - FAQ_ITEMS — the homepage FAQ Q&A. The FAQ block in src/routes/index.tsx
 *    renders from this array, so the visible copy and the FAQPage schema can
 *    never drift apart.
 *  - Organization schema — name/url/logo plus the REAL social links rendered
 *    in the homepage socials section and footer (src/routes/index.tsx and
 *    src/routes/__root.tsx): https://x.com/gradedate and
 *    https://www.tiktok.com/@gradedate. No invented URLs.
 *  - Product/Offer schema — Premium $5.99/month USD + Free tier. Every price
 *    and limit is derived from src/canonical-entitlements.ts and the enforced
 *    product rules (src/db.ts daily like reset = 3, weekly free regrade in
 *    src/api-handler.ts, 5-photo upload cap). Nothing invented.
 *
 * Emission: RootDocument (src/routes/__root.tsx) renders these as inline
 * <script type="application/ld+json"> tags for exactly the two paths that
 * carry them ("/" and "/pricing") — the same per-pathname pattern already used
 * for canonical/og:url — so structured data is present on the homepage and the
 * pricing page and never duplicated on any other route.
 */
import {
  BOOST_PRICE_DISPLAY,
  FOUNDER_CAP,
  PREMIUM_MONTHLY_PRICE,
} from "./canonical-entitlements";

/** Public site origin (matches og:image/canonical usage elsewhere). */
export const SITE_URL = "https://gradedate.app";

/** Real GradeDate social profiles, as rendered on the homepage + footer. */
export const GRADE_DATE_SOCIALS = [
  "https://x.com/gradedate",
  "https://www.tiktok.com/@gradedate",
] as const;

/** Paths that carry the JSON-LD structured data (homepage + pricing only). */
export const STRUCTURED_DATA_PATHS = ["/", "/pricing"] as const;

/**
 * Free-tier limits, matching the enforced product rules:
 *  - 3 likes/day (db.ts useDailyLike resets daily_likes_remaining = 3)
 *  - 1 free regrade/week (api-handler.ts last_free_regrade_at weekly window)
 *  - up to 5 photos (api-handler.ts "Maximum 5 photos per upload")
 */
export const FREE_TIER_DESCRIPTION =
  "Free tier: 3 likes per day, 1 free regrade per week, and up to 5 profile photos. Browsing and messaging included.";

/** Premium offer description — price string derived from the canonical constant. */
export const PREMIUM_OFFER_DESCRIPTION = `Premium subscription at $${PREMIUM_MONTHLY_PRICE}/month (USD): premium likes, regrades, booster, and see-who-liked-you.`;

export interface FaqItem {
  q: string;
  a: string;
}

/**
 * The five homepage FAQ Q&As (audit B1) in the audience's own words. Plain
 * text on purpose: it feeds both the visible FAQ block and the FAQPage
 * schema. Every answer is honest and true to the shipped product — no
 * guarantees, no invented features.
 */
export const FAQ_ITEMS: readonly FaqItem[] = [
  {
    q: "Does AI matching actually get me dates?",
    a: "No guarantees — we're honest about that. The AI grades your photos and matches you with people in your appearance range, but the photos and the conversation still do the work. What we do is make sure you're not invisible to the people you'd actually match with.",
  },
  {
    q: "How does grade-level matching work?",
    a: "Every photo gets a 1–10 AI grade. Your city percentile is calculated from those grades, and your feed is 80% people in your range and 20% outside it — realistic, not a bubble and not a fantasy.",
  },
  {
    q: "Will there be people to match with in an Austin-only beta?",
    a: "The beta starts in Austin with a capped cohort, so it's real but deliberately small. If you're outside Austin, the waitlist keeps your spot and emails you the moment your city opens.",
  },
  {
    q: "Is the grade private?",
    a: "Yes. Your grade and city percentile show on your own profile as “private, only you see it.” Other members see your photos and profile — never your grade, and never your biometric data.",
  },
  {
    q: "Who is this not for?",
    a: "GradeDate isn't for anonymous, photo-less hookups — profiles, photos, and real conversations only.",
  },
];

export function organizationLdJson() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "GradeDate",
    url: SITE_URL,
    logo: `${SITE_URL}/logo.svg`,
    sameAs: [...GRADE_DATE_SOCIALS],
  } as const;
}

export function productLdJson() {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "GradeDate",
    description:
      "AI-assisted dating profile coaching and appearance-based matching: upload up to 5 photos, get honest AI feedback and a best-pic pick, see your city percentile, and match with similar people nearby.",
    brand: { "@type": "Brand", name: "GradeDate" },
    offers: [
      {
        "@type": "Offer",
        name: "Premium",
        description: PREMIUM_OFFER_DESCRIPTION,
        price: PREMIUM_MONTHLY_PRICE.toFixed(2),
        priceCurrency: "USD",
        availability: "https://schema.org/OnlineOnly",
      },
      {
        "@type": "Offer",
        name: "Free tier",
        description: FREE_TIER_DESCRIPTION,
        price: "0",
        priceCurrency: "USD",
        availability: "https://schema.org/OnlineOnly",
      },
    ],
  } as const;
}

export function faqLdJson() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_ITEMS.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  } as const;
}

/** The three JSON-LD graphs emitted on "/" and "/pricing". */
export const STRUCTURED_DATA_LD_JSON = [
  organizationLdJson(),
  productLdJson(),
  faqLdJson(),
] as const;

/** Serialized form used by RootDocument's inline <script> emission. */
export const STRUCTURED_DATA_JSON_STRINGS = STRUCTURED_DATA_LD_JSON.map((json) =>
  JSON.stringify(json),
);

/** Head-meta form that TanStack renders as <script type="application/ld+json">. */
export const STRUCTURED_DATA_META: ReadonlyArray<{
  "script:ld+json": (typeof STRUCTURED_DATA_LD_JSON)[number];
}> = STRUCTURED_DATA_LD_JSON.map((json) => ({ "script:ld+json": json }));

/** Export used by tests to pin llms.txt prices to the canonical constants. */
export { BOOST_PRICE_DISPLAY, FOUNDER_CAP, PREMIUM_MONTHLY_PRICE };
