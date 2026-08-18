/**
 * Premium Full-Profile Review UI tests (profile-page card, frontend of
 * POST /api/profile-review, backend PR #181).
 *
 * Two layers:
 *  1. Static surface guards (repo convention — pricing-surface.test.ts style):
 *     the card is placed on the profile page in view mode between the grade
 *     hero and the Get Graded CTA, and the honest owner-locked copy strings
 *     (mock banner, coach-not-judge microcopy, free-used upsell, 30-day
 *     window) can't silently regress.
 *  2. Behavior tests against the injectable fetch seam
 *     (setReviewPostForTesting — no bun mock.module, which leaks across
 *     files): free taste 200 / free used 402 / premium full 200 / mock
 *     method / 429 Retry-After / REVIEW_WINDOW_ACTIVE / 5xx / network.
 */
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  ProfileReviewCard,
  requestProfileReview,
  setReviewPostForTesting,
  REVIEW_MOCK_BANNER,
  REVIEW_TIPS_MICROCOPY,
  REVIEW_USED_UPSELL,
} from "./profile-review-card";
import type { ProfileReviewResult } from "./profile-review";

const SRC = path.join(import.meta.dir);
const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf8");
const CARD = read("profile-review-card.tsx");
const PROFILE = read("routes/profile.index.tsx");

// ── Fixtures (mirror the backend's wire shapes) ─────────────────────────
const LOCKED_COPY =
  "Unlock the full profile review with Premium to see feedback on this section.";

function freeTasteReview(): ProfileReviewResult {
  return {
    overall: "Your bio opens with a strong hook — keep it.",
    sections: [
      { key: "bio", label: "Bio", feedback: "Your bio opens with a strong hook — keep it." },
      { key: "hobbies", label: "Hobbies", feedback: LOCKED_COPY, locked: true },
      { key: "ideal_first_date", label: "Ideal first date", feedback: LOCKED_COPY, locked: true },
      { key: "green_flags", label: "Green flags", feedback: LOCKED_COPY, locked: true },
      { key: "red_flags", label: "Red flags", feedback: LOCKED_COPY, locked: true },
      { key: "obsessions", label: "Obsessions", feedback: LOCKED_COPY, locked: true },
      { key: "communication_style", label: "Communication style", feedback: LOCKED_COPY, locked: true },
      { key: "lifestyle", label: "Lifestyle", feedback: LOCKED_COPY, locked: true },
      { key: "dating_goals", label: "Dating goals", feedback: LOCKED_COPY, locked: true },
    ],
    tips: [
      { id: "bio-hook", text: "Lead with what makes your weekend great.", source: "rule" },
    ],
  };
}

function fullReview(): ProfileReviewResult {
  return {
    overall: "Strong profile with a clear sense of who you are.",
    sections: [
      { key: "bio", label: "Bio", feedback: "Your bio opens with a strong hook — keep it." },
      { key: "hobbies", label: "Hobbies", feedback: "Specific hobbies make you easy to match with." },
      { key: "ideal_first_date", label: "Ideal first date", feedback: "A concrete date idea helps matches start easy." },
      { key: "green_flags", label: "Green flags", feedback: "Clear green flags set honest expectations." },
      { key: "red_flags", label: "Red flags", feedback: "Keep red flags constructive, not heavy." },
      { key: "obsessions", label: "Obsessions", feedback: "One real obsession beats three generic ones." },
      { key: "communication_style", label: "Communication style", feedback: "Naming your style avoids mismatched pacing." },
      { key: "lifestyle", label: "Lifestyle", feedback: "Your lifestyle note reads authentic." },
      { key: "dating_goals", label: "Dating goals", feedback: "Stating goals filters for aligned matches." },
    ],
    tips: [
      { id: "bio-hook", text: "Lead with what makes your weekend great.", source: "rule" },
      { id: "one-obsession", text: "Pick one obsession and go deeper.", source: "rule" },
    ],
  };
}

const json = (payload: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

describe("profile review card — placement and honest copy (static surface)", () => {
  test("profile page imports the card and renders it in view mode, between the grade hero and the Get Graded CTA", () => {
    expect(PROFILE).toContain(
      'import { ProfileReviewCard } from "~/profile-review-card";',
    );
    const hero = PROFILE.indexOf("Grade Display — hero element");
    const cardComment = PROFILE.indexOf("Profile Review — coaching card");
    const cta = PROFILE.indexOf("Get Graded CTA (only in view mode)");
    expect(hero).toBeGreaterThanOrEqual(0);
    expect(cardComment).toBeGreaterThan(hero);
    expect(cta).toBeGreaterThan(cardComment);
    // View mode only: the card is gated on !editing like its siblings.
    expect(PROFILE).toMatch(
      /\{!editing && \(\n\s+<div className="mb-8">\n\s+<ProfileReviewCard isPremium=\{isPremiumUser\(user\)\} \/>/,
    );
    // Premium flag comes from the client-side entitlement check (active sub
    // OR in-flight beta trial) — the same source every other surface uses.
    expect(PROFILE).toContain("<ProfileReviewCard isPremium={isPremiumUser(user)} />");
  });

  test("CTA copy: free users get the one-time taste, Premium users run the full review", () => {
    expect(CARD).toContain("Get your free bio review");
    expect(CARD).toContain("Run Profile Review");
    expect(CARD).toContain("available once every 30 days");
  });

  test("honest mock banner: AI-unavailable copy is exact and amber", () => {
    expect(REVIEW_MOCK_BANNER).toBe(
      "AI review was unavailable — these are generic suggestions, not an AI analysis.",
    );
    expect(CARD).toContain(REVIEW_MOCK_BANNER);
    expect(CARD).toMatch(/border-amber-500\/30 bg-amber-500\/10/);
  });

  test("coach-not-judge microcopy on the tips list", () => {
    expect(REVIEW_TIPS_MICROCOPY).toBe(
      "Suggestions — not a judgment of your profile.",
    );
    expect(CARD).toContain(REVIEW_TIPS_MICROCOPY);
  });

  test("free-used state renders the honest upsell copy and links to the Premium purchase flow", () => {
    expect(REVIEW_USED_UPSELL).toBe(
      "Your free bio review is used — unlock the full profile review with Premium $5.99/mo",
    );
    expect(CARD).toContain(REVIEW_USED_UPSELL);
    // Same canonical purchase route as SubscriptionBanner / grade.tsx CTAs.
    expect(CARD).toContain('to="/subscribe"');
    expect(CARD).toContain("Unlock with Premium");
  });

  test("locked sections carry a Premium badge and the server's upsell copy", () => {
    expect(CARD).toContain("Premium");
    expect(CARD).toContain("section.feedback");
  });

  test("POST carries the CSRF header (same mechanics as other profile POSTs)", () => {
    expect(CARD).toContain('"X-CSRF-Token": getCsrfToken() || ""');
  });
});

describe("profile review card — state transitions (injectable seam)", () => {
  let capturedInit: RequestInit | null;

  beforeEach(() => {
    capturedInit = null;
  });
  afterEach(() => {
    setReviewPostForTesting((url, init) => fetch(url, init));
  });

  const post = (res: Response) =>
    setReviewPostForTesting(async (_url, init) => {
      capturedInit = init;
      return res;
    });

  test("free first-run 200 renders the taste: bio real, every other section locked", async () => {
    post(json({ review: freeTasteReview(), method: "ai", premiumRequired: false }));
    const state = await requestProfileReview();
    expect(state.status).toBe("success");
    if (state.status !== "success") return;
    expect(state.method).toBe("ai");
    const bio = state.review.sections.find((s) => s.key === "bio");
    expect(bio?.locked).not.toBe(true);
    const locked = state.review.sections.filter((s) => s.locked);
    expect(locked.length).toBe(8);
    expect(locked.every((s) => s.feedback === LOCKED_COPY)).toBe(true);
  });

  test("free user already used → FREE_REVIEW_USED maps to the upsell state", async () => {
    post(
      json(
        {
          error: "Your free bio review is used. Unlock the full profile review with Premium to see feedback on every section.",
          code: "FREE_REVIEW_USED",
          premiumRequired: true,
        },
        402,
      ),
    );
    const state = await requestProfileReview();
    expect(state).toEqual({ status: "used" });
  });

  test("premium 200 renders the full review with all nine sections real", async () => {
    post(json({ review: fullReview(), method: "ai", premiumRequired: false }));
    const state = await requestProfileReview();
    expect(state.status).toBe("success");
    if (state.status !== "success") return;
    expect(state.review.sections).toHaveLength(9);
    expect(state.review.sections.every((s) => !s.locked)).toBe(true);
    const keys = state.review.sections.map((s) => s.key);
    expect(keys).toEqual([
      "bio",
      "hobbies",
      "ideal_first_date",
      "green_flags",
      "red_flags",
      "obsessions",
      "communication_style",
      "lifestyle",
      "dating_goals",
    ]);
  });

  test("method mock flows through so the amber honest banner renders", async () => {
    post(json({ review: fullReview(), method: "mock", premiumRequired: false }));
    const state = await requestProfileReview();
    expect(state.status).toBe("success");
    if (state.status !== "success") return;
    expect(state.method).toBe("mock");
  });

  test("premium within the 30-day window → REVIEW_WINDOW_ACTIVE with days_remaining", async () => {
    post(
      json(
        {
          error: "Your full profile review is available once every 30 days. 12 day(s) until your next review.",
          code: "REVIEW_WINDOW_ACTIVE",
          days_remaining: 12,
          premiumRequired: false,
        },
        402,
      ),
    );
    const state = await requestProfileReview();
    expect(state).toEqual({ status: "window", daysRemaining: 12 });
  });

  test("429 surfaces the Retry-After window", async () => {
    post(
      json(
        { error: "Too many requests" },
        429,
        { "Retry-After": "900" },
      ),
    );
    const state = await requestProfileReview();
    expect(state).toEqual({ status: "rate_limited", retryAfterSeconds: 900 });
  });

  test("429 without Retry-After still maps to a rate-limit state", async () => {
    post(json({ error: "Too many requests" }, 429));
    const state = await requestProfileReview();
    expect(state).toEqual({ status: "rate_limited", retryAfterSeconds: null });
  });

  test("5xx renders a generic inline error — no crash, no leaked details", async () => {
    post(json({ error: "database password leaked" }, 503));
    const state = await requestProfileReview();
    expect(state).toEqual({
      status: "error",
      message: "GradeDate is having trouble right now. Please try again.",
    });
  });

  test("network failure maps to the connection error, not a crash", async () => {
    setReviewPostForTesting(async () => {
      throw new TypeError("fetch failed");
    });
    const state = await requestProfileReview();
    expect(state).toEqual({
      status: "error",
      message: "We couldn't connect. Check your connection and try again.",
    });
  });

  test("the POST targets /api/profile-review with a CSRF header", async () => {
    let calledUrl: string | null = null;
    setReviewPostForTesting(async (url, init) => {
      calledUrl = url;
      capturedInit = init;
      return json({ review: fullReview(), method: "ai", premiumRequired: false });
    });
    await requestProfileReview();
    expect(calledUrl).toBe("/api/profile-review");
    expect(capturedInit?.method).toBe("POST");
    const headers = new Headers(capturedInit?.headers);
    expect(headers.get("X-CSRF-Token")).not.toBeNull();
  });

  test("malformed 200 body is treated as an error, not a crash", async () => {
    post(new Response("<html>not json</html>", { status: 200 }));
    const state = await requestProfileReview();
    expect(state.status).toBe("error");
  });
});
