import { createFileRoute, Link } from "@tanstack/react-router";
import { staticPageHead } from "~/route-heads";

/**
 * /about — founder story page (audit B4 / D3.3).
 *
 * The founder block below is REAL content supplied by the owner: name
 * ("Austin") and the "why I built GradeDate" story, in the owner's own
 * first-person words. Nothing here is invented about the owner.
 *
 * Two slots are still pending the owner's input (marked TODO(owner)):
 *
 *   1. TODO(owner): founder photo — the page renders a monogram avatar (an
 *      initial "A") in the photo slot, never a stock/generated person image.
 *      Replace the avatar block with a real photo when provided, e.g.:
 *      <img src="/founder.jpg" alt="Austin, founder of GradeDate" ... />.
 *   2. TODO(owner): founder LinkedIn/X links — rendered as plain "coming
 *      soon" text until real profile URLs exist, so the page never links to
 *      a dead or fake profile.
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

      {/* ── Founder block (real name + story; photo/socials pending owner) ── */}
      <section>
        <h2 className="mb-6 text-xl font-bold text-white">Meet the founder</h2>
        <div className="card border-rose-500/20 p-6">
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
            {/* Monogram avatar — stands in for the founder photo until the
                owner provides one. Never a stock/generated image of a person.
                TODO(owner): founder photo + LinkedIn/X links — replace this
                avatar block with the real photo when available, e.g.:
                <img
                  src="/founder.jpg"
                  alt="Austin, founder of GradeDate"
                  className="h-28 w-28 rounded-2xl object-cover ring-2 ring-rose-500/30"
                /> */}
            <div
              role="img"
              aria-label="Austin, founder of GradeDate"
              className="flex h-28 w-28 shrink-0 select-none flex-col items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500/25 to-rose-600/10 ring-2 ring-rose-500/30"
            >
              <span className="text-4xl font-bold text-rose-300">A</span>
            </div>

            <div className="flex-1 text-center sm:text-left">
              <h3 className="text-lg font-semibold text-white">Austin</h3>
              <p className="mt-1 text-sm text-gray-500">Founder, GradeDate</p>

              <p className="mt-4 text-sm leading-relaxed text-gray-400">
                GradeDate started as just an idea — dating apps just never
                worked for me. I&apos;d only ever heard horror stories and bad
                experiences, never a great experience, or how an app actually
                helped improve your situation. So I decided to fix that: an app
                that not only shows you your highest-quality matches but also
                gives you the opportunity to become the best you. I want
                GradeDate to become a place people come to be better and make
                honest connections with others.
              </p>

              {/* Founder social links — LinkedIn supplied by owner (2026-08-19);
                  X still pending. Only link real, owner-provided profiles so the
                  page never points to a dead or fake account. */}
              <div className="mt-4 flex items-center justify-center gap-3 text-sm sm:justify-start">
                <a
                  href="https://www.linkedin.com/in/austin-richmond-3723b7226"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-rose-400 underline-offset-4 hover:underline"
                >
                  LinkedIn
                </a>
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
