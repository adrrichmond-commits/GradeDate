import { createFileRoute, Link } from "@tanstack/react-router";
import { staticPageHead } from "~/route-heads";

/**
 * /about — founder story page (audit B4 / D3.3).
 *
 * THIS IS A STUB. The founder block below is made of CLEAN PLACEHOLDERS —
 * nothing here is invented about the owner. Every slot the owner needs to
 * fill is marked TODO(owner) in this file:
 *
 *   1. TODO(owner): FOUNDER_PHOTO_ALT  — alt text for the founder's photo.
 *   2. TODO(owner): founder photo asset — replace the placeholder block with
 *      a real photo (e.g. <img src="/founder.jpg" ... />).
 *   3. TODO(owner): FOUNDER_NAME       — the founder's real name.
 *   4. TODO(owner): FOUNDER_STORY      — the "why I built GradeDate" story,
 *      one paragraph, first person, real.
 *   5. TODO(owner): FOUNDER_LINKEDIN_URL / FOUNDER_X_URL — real profile URLs.
 *
 * The product facts below (what GradeDate does, Austin-first beta, safety
 * stance) are true to the shipped product — see the business plan.
 */

export const Route = createFileRoute("/about")({
  component: AboutPage,
  head: () => staticPageHead("GradeDate — About", "The story behind GradeDate: a dating app that grades your photos and matches you with people in your appearance range, in your city."),
});

function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="mb-3 text-3xl font-bold text-white">About GradeDate</h1>
      <p className="mb-10 text-gray-400">
        What it is, who it&apos;s for, and the story behind it.
      </p>

      {/* ── What GradeDate is (real product facts) ─────────────── */}
      <section className="mb-12">
        <h2 className="mb-3 text-xl font-bold text-white">
          What GradeDate does
        </h2>
        <div className="space-y-3 leading-relaxed text-gray-400">
          <p>
            GradeDate is a dating app for 18–35s that starts with your photos:
            you upload up to five, our AI grades each one and gives you plain,
            actionable feedback — lighting, angles, composition — and picks
            your best profile picture.
          </p>
          <p>
            Your city percentile is calculated from your photo grades. Your
            feed is 80% people in your appearance range and 20% outside it, so
            matching stays realistic — and location-aware, starting with our
            Austin, TX beta.
          </p>
          <p>
            Every account is age-verified with a government ID and selfie, and
            photos and messages are moderated. GradeDate isn&apos;t for
            anonymous, photo-less hookups — profiles, photos, and real
            conversations only.
          </p>
        </div>
      </section>

      {/* ── Founder block (STUB — placeholders, see TODO(owner) above) ── */}
      <section>
        <h2 className="mb-6 text-xl font-bold text-white">Meet the founder</h2>
        <div className="card border-rose-500/20 p-6">
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
            {/* TODO(owner): founder photo — replace this placeholder block
                with the real photo, e.g.:
                <img
                  src="/founder.jpg"
                  alt={FOUNDER_PHOTO_ALT}
                  className="h-28 w-28 rounded-2xl object-cover ring-2 ring-rose-500/30"
                /> */}
            <div
              role="img"
              aria-label="TODO(owner): FOUNDER_PHOTO_ALT — placeholder slot for the founder's photo"
              className="flex h-28 w-28 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-gray-700 bg-gray-900 text-center"
            >
              <svg
                className="h-8 w-8 text-gray-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
                />
              </svg>
              <span className="px-2 text-[10px] uppercase tracking-widest text-gray-600">
                Photo coming soon
              </span>
            </div>

            <div className="flex-1 text-center sm:text-left">
              {/* TODO(owner): FOUNDER_NAME — real founder name */}
              <h3 className="text-lg font-semibold text-white">
                Founder name — coming soon
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                Founder, GradeDate
              </p>

              {/* TODO(owner): FOUNDER_STORY — the real "why I built
                  GradeDate" story (one paragraph, first person) */}
              <p className="mt-4 text-sm leading-relaxed text-gray-400">
                Why I built GradeDate — the founder&apos;s story will live here.
                This is a placeholder slot until the founder writes it.
              </p>

              {/* TODO(owner): FOUNDER_LINKEDIN_URL / FOUNDER_X_URL — real
                  profile URLs. Rendered as plain text until they exist, so
                  the page never links to a dead or fake profile. */}
              <div className="mt-4 flex items-center justify-center gap-3 text-sm sm:justify-start">
                <span className="text-gray-500" title="Placeholder — owner to supply LinkedIn URL">
                  LinkedIn — coming soon
                </span>
                <span className="text-gray-700">·</span>
                <span className="text-gray-500" title="Placeholder — owner to supply X URL">
                  X — coming soon
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mt-12">
        <Link to="/" className="text-sm text-rose-400">
          ← Back to GradeDate
        </Link>
      </div>
    </div>
  );
}
