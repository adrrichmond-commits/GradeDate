import { createFileRoute, Link } from "@tanstack/react-router";
import { staticPageHead } from "~/route-heads";
import { TestimonialsSection } from "~/testimonials-section";

/**
 * /customers — customer stories page (audit B3 / D3.2).
 *
 * HONEST EMPTY STATE: this page does NOT invent testimonials. The Austin beta
 * hasn't produced any published, member-approved stories yet, so the wall
 * renders a plain "stories are on the way" message plus design-ready card
 * slots. The real stories live in src/testimonials-section.tsx (TESTIMONIALS)
 * and appear here AND on the homepage the moment the owner supplies them.
 *
 *   FLAG for owner: collect 5-8 named beta/early-grader quotes with photos
 *   (first name, role, photo, specific outcome) — see TESTIMONIALS in
 *   src/testimonials-section.tsx.
 */

export const Route = createFileRoute("/customers")({
  component: CustomersPage,
  head: () => staticPageHead("GradeDate — Customer Stories", "Real stories from GradeDate members — first names, roles, photos, and specific outcomes, published as the Austin beta rolls out."),
});

function CustomersPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="mb-3 text-3xl font-bold text-white">Customer Stories</h1>
      <p className="mb-10 text-gray-400">
        What happens when your photos get graded and your feed finally matches
        on your level.
      </p>

      <div className="mb-12 space-y-3 leading-relaxed text-gray-400">
        <p>
          We&apos;re collecting real stories from the Austin beta — the good,
          the honest, and the specific. Every quote on this page comes from a
          real member with their approval: first name, role, photo, and the
          outcome they actually got. Nothing is written for us, and nothing is
          invented.
        </p>
        <p>
          The beta is live in Austin now. As members hit real milestones —
          better photos, matches on their level, conversations that go
          somewhere — their stories will be published here and on the
          homepage.
        </p>
      </div>

      {/* The shared wall: honest empty state + slots until real quotes land.
          showMoreLink=false — this IS the customers page, no self-link. */}
      <TestimonialsSection showMoreLink={false} />

      <div className="mt-12 rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
        <p className="text-sm text-gray-400">
          Been in the Austin beta with results to share?{" "}
          <Link
            to="/contact"
            className="font-semibold text-rose-400 underline underline-offset-4 transition hover:text-rose-300"
          >
            Tell us your story
          </Link>{" "}
          — we&apos;d love to feature it (with your OK).
        </p>
      </div>

      <div className="mt-12">
        <Link to="/" className="text-sm text-rose-400">
          ← Back to GradeDate
        </Link>
      </div>
    </div>
  );
}
