/**
 * Profile Review card (Premium Full-Profile Review) — profile page UI.
 *
 * Talks to POST /api/profile-review (backend PR #181):
 *  - FREE user, first time:      200 { review, method, premiumRequired:false }
 *                                 — bio section real, every other section
 *                                 locked:true with honest Premium upsell copy
 *                                 (the "taste").
 *  - FREE user, already used:    402 { error, code:"FREE_REVIEW_USED",
 *                                 premiumRequired:true } → upsell CTA.
 *  - PREMIUM user:               200 full review (all sections real);
 *                                 within the 30-day window → 402
 *                                 { code:"REVIEW_WINDOW_ACTIVE", days_remaining }.
 *  - Shared:                     401 unauthenticated, 403 verificationGate,
 *                                 429 rate limit (3/15min, Retry-After).
 *
 * Honest labeling is owner-locked: method "mock" (AI unavailable) renders an
 * amber banner with the exact FALLBACK_OVERALL copy; coach-not-judge framing
 * is repeated in the tips microcopy, mirroring grade.tsx.
 *
 * Testability: the POST is behind an injectable seam (setReviewPostForTesting)
 * following the repo's fetchFn convention — no bun mock.module (it leaks
 * across test files).
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { getCsrfToken } from "~/csrf-client";
import { parseRetryAfter } from "~/client-api";
import type { ProfileReviewMethod, ProfileReviewResult } from "~/profile-review";

/** Wire shape of a successful 200 response. */
export interface ProfileReviewResponse {
  review: ProfileReviewResult;
  method: ProfileReviewMethod;
  premiumRequired: boolean;
}

/** UI state machine for the card. Pure data — no React in the transitions. */
export type ReviewUiState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "success";
      review: ProfileReviewResult;
      method: ProfileReviewMethod;
    }
  | { status: "used" } // FREE_REVIEW_USED → Premium upsell
  | { status: "window"; daysRemaining: number } // REVIEW_WINDOW_ACTIVE
  | { status: "rate_limited"; retryAfterSeconds: number | null }
  | { status: "error"; message: string };

/** Injectable fetch seam (defaults to the real global fetch). */
export type ReviewPostFn = (url: string, init: RequestInit) => Promise<Response>;
let reviewPost: ReviewPostFn = (url, init) => fetch(url, init);
export function setReviewPostForTesting(fn: ReviewPostFn): void {
  reviewPost = fn;
}

/** Coaches, doesn't judge — honest copy reused in the tips microcopy. */
export const REVIEW_TIPS_MICROCOPY =
  "Suggestions — not a judgment of your profile.";

/** Honest amber banner shown when the AI provider was unavailable (method "mock"). */
export const REVIEW_MOCK_BANNER =
  "AI review was unavailable — these are generic suggestions, not an AI analysis.";

/** Honest upsell copy for a free user who already used their one-time taste. */
export const REVIEW_USED_UPSELL =
  "Your free bio review is used — unlock the full profile review with Premium $5.99/mo";

/**
 * Run one profile review POST and map the response to a UI state. Pure
 * function over the injectable seam — unit-testable without a DOM or React.
 */
export async function requestProfileReview(): Promise<ReviewUiState> {
  let res: Response;
  try {
    res = await reviewPost("/api/profile-review", {
      method: "POST",
      headers: { "X-CSRF-Token": getCsrfToken() || "" },
    });
  } catch {
    return {
      status: "error",
      message: "We couldn't connect. Check your connection and try again.",
    };
  }
  const payload: unknown = await res.json().catch(() => null);
  if (res.ok && payload && typeof payload === "object" && "review" in payload) {
    const body = payload as ProfileReviewResponse;
    if (
      body.review &&
      typeof body.review === "object" &&
      Array.isArray(body.review.sections)
    ) {
      return {
        status: "success",
        review: body.review,
        method: body.method === "mock" ? "mock" : "ai",
      };
    }
  }
  if (res.status === 429) {
    return {
      status: "rate_limited",
      retryAfterSeconds: parseRetryAfter(res.headers.get("Retry-After")),
    };
  }
  const code =
    payload && typeof payload === "object" && "code" in payload
      ? (payload as { code?: unknown }).code
      : undefined;
  if (code === "FREE_REVIEW_USED") return { status: "used" };
  if (code === "REVIEW_WINDOW_ACTIVE") {
    const days = (payload as { days_remaining?: unknown }).days_remaining;
    return {
      status: "window",
      daysRemaining:
        typeof days === "number" && Number.isFinite(days)
          ? Math.max(1, Math.round(days))
          : 30,
    };
  }
  // Client-actionable server messages (validation/conflict) are safe to show;
  // never surface internal 5xx details (same rule as client-api.messageFor).
  const message =
    res.status < 500 &&
    payload &&
    typeof payload === "object" &&
    typeof (payload as { error?: unknown }).error === "string"
      ? (payload as { error: string }).error
      : res.status === 401
        ? "Please sign in again to continue."
        : res.status === 403
          ? "You do not have permission to do that."
          : res.status >= 500
            ? "GradeDate is having trouble right now. Please try again."
            : "We couldn't complete that request.";
  return { status: "error", message };
}

function SectionRow({
  section,
}: {
  section: ProfileReviewResult["sections"][number];
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        section.locked
          ? "border-white/5 bg-gray-800/30"
          : "border-purple-500/15 bg-purple-500/5"
      }`}
    >
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-300">
        {section.locked && (
          <svg
            className="h-3.5 w-3.5 shrink-0 text-amber-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
            />
          </svg>
        )}
        <span>{section.label}</span>
        {section.locked && (
          <span className="ml-auto rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
            Premium
          </span>
        )}
      </div>
      <p
        className={`mt-1.5 text-sm ${
          section.locked ? "text-gray-500" : "text-gray-300"
        }`}
      >
        {section.feedback}
      </p>
    </div>
  );
}

function ReviewResult({
  review,
  method,
  isPremium,
}: {
  review: ProfileReviewResult;
  method: ProfileReviewMethod;
  isPremium: boolean;
}) {
  return (
    <div className="space-y-3">
      {method === "mock" && (
        <div
          role="status"
          className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-center"
        >
          <p className="text-xs text-amber-300">{REVIEW_MOCK_BANNER}</p>
        </div>
      )}
      {review.overall && (
        <p className="text-sm italic text-gray-300">"{review.overall}"</p>
      )}
      <div className="space-y-2">
        {review.sections.map((section) => (
          <SectionRow key={section.key} section={section} />
        ))}
      </div>
      {review.tips.length > 0 && (
        <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-purple-400">
            Coaching Tips
          </div>
          <ul className="mt-2 space-y-1.5">
            {review.tips.map((tip) => (
              <li
                key={tip.id}
                className="flex items-start gap-2 text-sm text-gray-300"
              >
                <span className="mt-0.5 shrink-0 text-purple-400">✦</span>
                {tip.text}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] text-gray-400">{REVIEW_TIPS_MICROCOPY}</p>
        </div>
      )}
      {!isPremium && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-center">
          <p className="text-sm text-gray-300">
            See feedback on every section with{" "}
            <span className="font-semibold text-amber-400">
              Premium — $5.99/mo
            </span>
            .
          </p>
          <Link
            to="/subscribe"
            className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-5 py-2 text-sm font-semibold text-gray-950 transition hover:bg-amber-400"
          >
            Unlock the full review
          </Link>
        </div>
      )}
    </div>
  );
}

/**
 * Profile Review card — rendered on the profile page (view mode) for free and
 * Premium users alike. Placement: after the grade hero, before the Get Graded
 * CTA (scoping report fa614001).
 */
export function ProfileReviewCard({ isPremium }: { isPremium: boolean }) {
  const [state, setState] = useState<ReviewUiState>({ status: "idle" });

  const handleRun = async () => {
    setState({ status: "loading" });
    const next = await requestProfileReview();
    setState(next);
  };

  return (
    <section
      aria-labelledby="profile-review-heading"
      className="rounded-2xl border border-white/10 bg-gray-900/60 p-5"
    >
      <div className="flex items-center gap-2">
        <svg
          className="h-5 w-5 shrink-0 text-purple-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.8}
            d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z"
          />
        </svg>
        <h2 id="profile-review-heading" className="text-lg font-semibold">
          Profile Review
        </h2>
      </div>
      <p className="mt-1 text-sm text-gray-400">
        {isPremium
          ? "AI coaching across every section of your profile — available once every 30 days."
          : "A coach's look at your bio — one free review, then every section with Premium."}
      </p>

      {state.status === "idle" && (
        <button
          type="button"
          onClick={handleRun}
          className={`mt-4 inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold transition hover:scale-105 active:scale-95 ${
            isPremium
              ? "bg-rose-600 text-white hover:bg-rose-500"
              : "bg-amber-500 text-gray-950 hover:bg-amber-400"
          }`}
        >
          {isPremium ? "Run Profile Review" : "Get your free bio review"}
        </button>
      )}

      {state.status === "loading" && (
        <div className="mt-4 flex flex-col items-center gap-3 py-3">
          <div className="loader-pulse" />
          <p className="text-sm text-gray-400">Analyzing your profile...</p>
        </div>
      )}

      {state.status === "success" && (
        <div className="mt-4">
          <ReviewResult
            review={state.review}
            method={state.method}
            isPremium={isPremium}
          />
        </div>
      )}

      {state.status === "used" && (
        <div className="mt-4 rounded-xl border border-amber-500/30 bg-gradient-to-b from-amber-500/5 to-transparent p-5 text-center">
          <p className="text-sm text-gray-400">{REVIEW_USED_UPSELL}</p>
          <Link
            to="/subscribe"
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-6 py-2.5 text-sm font-semibold text-gray-950 transition hover:bg-amber-400"
          >
            Unlock with Premium
          </Link>
        </div>
      )}

      {state.status === "window" && (
        <div className="mt-4 rounded-xl border border-gray-700 bg-gray-800/30 p-4">
          <p className="text-sm text-gray-300">
            Your full profile review is available once every 30 days —{" "}
            <span className="font-semibold text-gray-100">
              {state.daysRemaining} day{state.daysRemaining === 1 ? "" : "s"}
            </span>{" "}
            until your next review.
          </p>
        </div>
      )}

      {state.status === "rate_limited" && (
        <p role="alert" className="mt-4 text-sm text-red-400">
          {state.retryAfterSeconds !== null
            ? `You've used your profile review requests for now. Please try again in about ${Math.max(
                1,
                Math.ceil(state.retryAfterSeconds / 60),
              )} minute${Math.max(1, Math.ceil(state.retryAfterSeconds / 60)) === 1 ? "" : "s"}.`
            : "Too many requests. Please try again soon."}
        </p>
      )}

      {state.status === "error" && (
        <p role="alert" className="mt-4 text-sm text-red-400">
          {state.message}
        </p>
      )}
    </section>
  );
}
