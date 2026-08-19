import { createFileRoute, Link } from "@tanstack/react-router";
import { staticPageHead } from "~/route-heads";
import { HOW_WE_COMPARE_FAQ_ITEMS } from "~/structured-data";
import { WaitlistForm } from "~/waitlist-form";

/**
 * /how-we-compare — GradeDate-first "how we compare" page (owner decision
 * 2026-08-19).
 *
 * This page is framed entirely around GradeDate's own approach: what we ship,
 * how that differs from the norm, and how to weigh us against ANY dating app.
 * It deliberately does NOT headline or name any specific competitor, and does
 * not make claims about other apps.
 *
 * Honesty guardrails (keep these — they are the point of this page):
 *  - No claims about any other dating app, and no disparaging language about
 *    any of them. We describe what GradeDate does and let you judge any app,
 *    including us, on its own published materials.
 *  - We only claim what WE actually ship: free tier (3 likes/day, 1 free
 *    regrade/week, up to 5 photos, browsing, messaging), Premium $5.99/month,
 *    Founders Club price lock, mandatory gov-ID + selfie age verification in
 *    the beta, AI photo + message moderation, and zero tolerance for CSAM,
 *    underage content, and human trafficking. Nothing invented, no
 *    guarantees, no features we don't have (no video chat, no annual plan,
 *    no nationwide launch yet).
 *
 * The visible FAQ renders from HOW_WE_COMPARE_FAQ_ITEMS (src/structured-data.ts),
 * the same source that feeds the FAQPage JSON-LD emitted by RootDocument for
 * this pathname, so the copy and the schema can never drift apart.
 */

export const Route = createFileRoute("/how-we-compare")({
  component: HowWeComparePage,
  head: () =>
    staticPageHead(
      "How GradeDate compares — what we do, and how to weigh us against any app",
      "GradeDate is a tool for dating: AI photo grading and coaching, your best-pic pick, a city percentile, and grade + interest + geography matching. Here's what we ship and how to weigh us against any app — with nothing invented.",
    ),
});

const HOW_WERE_DIFFERENT: ReadonlyArray<{ title: string; body: string }> = [
  {
    title: "A coach, not a judge",
    body: "GradeDate is a tool for dating. It grades each of your photos on a 1–10 scale, recommends your strongest profile picture, and shows a city percentile — so you can build and understand your profile, not be judged by it.",
  },
  {
    title: "City percentile, not a raw score",
    body: "Instead of a single number floating with no context, you get a percentile that shows where your profile sits for your city — a more honest, less reductive read.",
  },
  {
    title: "An 80/20 grade + geography feed",
    body: "Your feed is 80% people in your appearance range and 20% outside it, matched on grade, common interests, and geography — realistic, not a bubble and not a fantasy.",
  },
  {
    title: "Age verification that's actually enforced",
    body: "In the beta, every account is verified with a government ID (document + selfie). It's mandatory — not a checkmark you can skip.",
  },
  {
    title: "AI photo and message moderation",
    body: "Photos and messages are scanned automatically, with flagged content reviewed by a human safety reviewer on our team.",
  },
  {
    title: "Zero tolerance for serious harm",
    body: "CSAM, underage content, and human trafficking are zero-tolerance: content is hidden immediately, the account is locked, and authorities are notified.",
  },
  {
    title: "Free to start, honest pricing",
    body: "Start free: 3 likes per day, 1 free regrade per week, up to 5 photos, browsing, and messaging. Premium is $5.99/month, and the first 1,000 Premium subscribers lock in that price while subscribed — that's a real number we enforce.",
  },
];

function HowWeComparePage() {
  return (
    <div className="relative overflow-hidden">
      {/* Background accents consistent with the landing page and /pricing */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(244,63,94,0.10),transparent_50%)]" />

      <div className="relative z-10 mx-auto max-w-5xl px-4 pb-8 pt-16 sm:pt-24">
        {/* ── Hero (a) ──────────────────────────────────────────── */}
        <header className="mb-10 text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-rose-500/25 bg-rose-500/10 px-4 py-1.5">
            <span className="text-xs font-semibold uppercase tracking-widest text-rose-300">
              What GradeDate does
            </span>
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
            How{" "}
            <span className="bg-gradient-to-r from-rose-400 to-amber-400 bg-clip-text text-transparent">
              GradeDate
            </span>{" "}
            compares
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-400">
            GradeDate is a tool for dating — a coaching interface that helps
            you build and understand your dating profile, then matches you with
            people who look similar, share your interests, and live nearby.
            This page is about what we actually do, and how to weigh us against
            any app.
          </p>
        </header>

        {/* ── How we're different (b) ───────────────────────────── */}
        <section className="mb-10" aria-labelledby="how-were-different-title">
          <h2
            id="how-were-different-title"
            className="mb-4 text-2xl font-bold text-white"
          >
            How we&apos;re different
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {HOW_WERE_DIFFERENT.map((item) => (
              <div key={item.title} className="card border-rose-500/20 p-5">
                <h3 className="mb-1.5 font-semibold text-white">{item.title}</h3>
                <p className="text-sm leading-relaxed text-gray-400">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Honest "weigh us against any app" note (c) ───────── */}
        <section className="mb-10">
          <div className="card border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-rose-500/5 p-6">
            <h2 className="mb-2 text-lg font-bold text-white">
              How to weigh us against any app
            </h2>
            <p className="text-sm leading-relaxed text-gray-400">
              We don&apos;t make claims about other apps — only about what
              GradeDate ships. Every dating app sets its own terms, pricing,
              and practices, and those change. So we&apos;d rather you check
              each app&apos;s own published materials, including ours, and judge
              for yourself. This page exists to be clear about what we do, what
              we cost, and how we protect users: a trustworthy comparison is one
              that tells you what it doesn&apos;t know instead of guessing.
            </p>
          </div>
        </section>

        {/* ── FAQ (d, renders from the JSON-LD source of truth) ── */}
        <section className="mb-10" aria-labelledby="how-we-compare-faq-title">
          <h2
            id="how-we-compare-faq-title"
            className="mb-4 text-2xl font-bold text-white"
          >
            Frequently asked questions
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {HOW_WE_COMPARE_FAQ_ITEMS.map((item) => (
              <div key={item.q} className="card border-rose-500/20 p-5">
                <h3 className="mb-1.5 font-semibold text-white">{item.q}</h3>
                <p className="text-sm leading-relaxed text-gray-400">
                  {item.a}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Waitlist CTA (e: waitlist + invite-code block) ──── */}
        <section className="mb-10" aria-labelledby="how-we-compare-waitlist-title">
          <div className="card border-rose-500/20 bg-gradient-to-br from-rose-500/5 to-violet-500/5 p-8 text-center">
            <h2
              id="how-we-compare-waitlist-title"
              className="mb-3 text-2xl font-bold text-white"
            >
              Be first when your city opens
            </h2>
            <p className="mx-auto mb-6 max-w-xl text-sm text-gray-400">
              The closed beta starts in Austin, TX with a capped, invite-only
              cohort. Join the waitlist and we&apos;ll email you the moment the
              beta reaches your city — free to join, no spam.
            </p>
            <div className="mx-auto max-w-md">
              <WaitlistForm idPrefix="hwc" />
            </div>
            <p className="mt-4 text-xs text-gray-500">
              No spam. Unsubscribe anytime. We&apos;ll only email you about
              your city&apos;s launch.
            </p>
          </div>
          <div className="mt-6 text-center text-sm text-gray-500">
            Already have an invite code?{" "}
            <Link
              to="/signup"
              className="font-semibold text-rose-400 underline underline-offset-4 transition hover:text-rose-300"
            >
              Sign up with it
            </Link>{" "}
            — invite holders get 14 days of Premium free.
          </div>
        </section>

        {/* ── Back links ───────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
          <Link to="/" className="text-rose-400">
            ← Back to GradeDate
          </Link>
          <Link to="/pricing" className="text-rose-400">
            See pricing
          </Link>
        </div>
      </div>
    </div>
  );
}
