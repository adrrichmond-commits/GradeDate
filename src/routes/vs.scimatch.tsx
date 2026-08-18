import { createFileRoute, Link } from "@tanstack/react-router";
import { staticPageHead } from "~/route-heads";
import { VS_SCIMATCH_FAQ_ITEMS } from "~/structured-data";
import { WaitlistForm } from "~/waitlist-form";

/**
 * /vs/scimatch — honest comparison page (site-audit C1 / D5.3).
 *
 * Honesty rules (see /home/team/shared/competitive-research.md):
 *  - We only claim what WE do, in detail, from the shipped product.
 *  - The SciMatch column contains a fact ONLY when the competitive-research
 *    file verifies it. It does not cover SciMatch, so every SciMatch cell says
 *    "Not stated in published materials." / "Not published." — never a guess.
 *  - No disparaging language about competitors, no unsourced claims about
 *    their algorithms or business practices. The audit's shorthand for
 *    SciMatch is deliberately NOT used here, because the research file does
 *    not verify it.
 *  - The page says plainly that SciMatch is a separate, unaffiliated product.
 *
 * The visible FAQ renders from VS_SCIMATCH_FAQ_ITEMS (src/structured-data.ts),
 * the same source that feeds the FAQPage JSON-LD emitted by RootDocument for
 * this pathname, so the copy and the schema can never drift apart.
 */

export const Route = createFileRoute("/vs/scimatch")({
  component: VsSciMatchPage,
  head: () => staticPageHead("GradeDate vs SciMatch — An Honest Comparison", "See how GradeDate and SciMatch compare on matching, price, age verification and moderation, transparency, and geography — with nothing invented about either app."),
});

const COMPARISON_ROWS: ReadonlyArray<{
  feature: string;
  gradedate: string;
  scimatch: string;
}> = [
  {
    feature: "Matching philosophy",
    gradedate:
      "A coaching interface for dating: AI grades each photo on a 1–10 scale, recommends your best profile picture, shows your city percentile, and matches you on grade, common interests, and geography. Your feed is 80% people in your appearance range and 20% outside it.",
    scimatch: "Not stated in published materials.",
  },
  {
    feature: "Price",
    gradedate:
      "Free to start: 3 likes per day, 1 free regrade per week, up to 5 photos, browsing, and messaging. Premium is $5.99/month for premium likes, regrades, a booster, and see-who-liked-you. The first 1,000 Premium subscribers lock in $5.99/month while subscribed (Founders Club).",
    scimatch: "Not published.",
  },
  {
    feature: "Age verification & moderation",
    gradedate:
      "Mandatory government ID + selfie verification in the beta. AI photo and message moderation. Zero tolerance for CSAM, underage content, and human trafficking — content is hidden, the account is locked, and authorities are notified.",
    scimatch: "Not stated in published materials.",
  },
  {
    feature: "Transparency",
    gradedate:
      "Your grade and city percentile are private to you but visible to you, alongside honest AI coaching feedback. Even the free demo grader is labeled as a simulated preview — never claimed to be real analysis.",
    scimatch: "Not stated in published materials.",
  },
  {
    feature: "Where it runs",
    gradedate:
      "Austin, TX first — a capped, invite-only beta — then your city via the waitlist.",
    scimatch: "Not stated in published materials.",
  },
];

function VsSciMatchPage() {
  return (
    <div className="relative overflow-hidden">
      {/* Background accents consistent with the landing page and /pricing */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(244,63,94,0.10),transparent_50%)]" />

      <div className="relative z-10 mx-auto max-w-5xl px-4 pb-8 pt-16 sm:pt-24">
        {/* ── Hero ─────────────────────────────────────────────── */}
        <header className="mb-10 text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-rose-500/25 bg-rose-500/10 px-4 py-1.5">
            <span className="text-xs font-semibold uppercase tracking-widest text-rose-300">
              Honest Comparison
            </span>
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
            GradeDate vs{" "}
            <span className="bg-gradient-to-r from-rose-400 to-amber-400 bg-clip-text text-transparent">
              SciMatch
            </span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-gray-400">
            Here&apos;s how they compare on the facts we can verify — and where
            we couldn&apos;t verify a fact, we say so.
          </p>
          <p className="mx-auto mt-3 max-w-xl text-xs text-gray-600">
            SciMatch is a separate, unaffiliated product. This page is not
            endorsed by or affiliated with SciMatch — it exists so you can
            compare honestly.
          </p>
        </header>

        {/* ── Comparison table ─────────────────────────────────── */}
        <section className="mb-10" aria-labelledby="comparison-table-title">
          <h2
            id="comparison-table-title"
            className="mb-4 text-2xl font-bold text-white"
          >
            Side by side
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <caption className="sr-only">
                GradeDate versus SciMatch, compared on matching philosophy,
                price, age verification and moderation, transparency, and
                geography.
              </caption>
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.03]">
                  <th scope="col" className="px-4 py-3 font-semibold text-gray-400">
                    Feature
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold text-rose-300">
                    GradeDate
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold text-gray-300">
                    SciMatch
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((row) => (
                  <tr
                    key={row.feature}
                    className="border-b border-white/5 align-top last:border-b-0"
                  >
                    <th
                      scope="row"
                      className="px-4 py-4 font-semibold text-white"
                    >
                      {row.feature}
                    </th>
                    <td className="px-4 py-4 leading-relaxed text-gray-300">
                      {row.gradedate}
                    </td>
                    <td className="px-4 py-4 leading-relaxed text-gray-500">
                      {row.scimatch}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-gray-600">
            We only fill in what we can verify from published materials. Where
            a detail isn&apos;t published, we say &ldquo;not stated&rdquo;
            rather than guess — and we&apos;d rather you check each app&apos;s
            own site for the latest.
          </p>
        </section>

        {/* ── Honesty callout ──────────────────────────────────── */}
        <section className="mb-10">
          <div className="card border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-rose-500/5 p-6">
            <h2 className="mb-2 text-lg font-bold text-white">
              Why the SciMatch column is short
            </h2>
            <p className="text-sm leading-relaxed text-gray-400">
              A comparison is only as good as its sources. Our competitive
              research documents the major swipe apps in detail, but it does
              not contain verifiable facts about how SciMatch handles pricing,
              moderation, or transparency — so instead of guessing, we say
              &ldquo;not stated.&rdquo; Every claim on this page is something
              we can back: what GradeDate ships, what it costs, and how it
              protects users. If a published source changes what we know about
              SciMatch, this table gets updated — not papered over.
            </p>
          </div>
        </section>

        {/* ── FAQ (renders from the JSON-LD source of truth) ───── */}
        <section className="mb-10" aria-labelledby="vs-faq-title">
          <h2
            id="vs-faq-title"
            className="mb-4 text-2xl font-bold text-white"
          >
            Frequently asked questions
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {VS_SCIMATCH_FAQ_ITEMS.map((item) => (
              <div key={item.q} className="card border-rose-500/20 p-5">
                <h3 className="mb-1.5 font-semibold text-white">{item.q}</h3>
                <p className="text-sm leading-relaxed text-gray-400">
                  {item.a}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Waitlist CTA (audit C1: waitlist CTA) ────────────── */}
        <section className="mb-10" aria-labelledby="vs-waitlist-title">
          <div className="card border-rose-500/20 bg-gradient-to-br from-rose-500/5 to-violet-500/5 p-8 text-center">
            <h2
              id="vs-waitlist-title"
              className="mb-3 text-2xl font-bold text-white"
            >
              Be first when your city opens
            </h2>
            <p className="mx-auto mb-6 max-w-xl text-sm text-gray-400">
              The closed beta starts in Austin, TX with a capped, invite-only
              cohort. Join the waitlist and we&apos;ll email you the moment
              the beta reaches your city — free to join, no spam.
            </p>
            <div className="mx-auto max-w-md">
              <WaitlistForm idPrefix="vs" />
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
