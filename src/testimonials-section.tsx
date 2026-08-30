import { Link } from "@tanstack/react-router";

/**
 * Customer testimonial wall (audit B3 / D3.2) — shared by the homepage and the
 * /customers page so there is exactly ONE source of truth for stories.
 *
 * HONEST EMPTY STATE (P0-4): with no published, member-approved stories yet,
 * TESTIMONIALS is intentionally EMPTY and the wall renders ONE honest
 * one-liner — never dashed placeholder-slot cards, never fabricated quotes
 * or fake review counts. NOTHING here is invented.
 *
 * To add a story later (owner supplies it): append one object to TESTIMONIALS
 * per real, approved member — first name, role, photo alt text, and their
 * specific outcome. The wall renders straight from the array, so each quote is
 * one line in this file, and it appears on BOTH the homepage and /customers.
 */

export type Testimonial = {
  /** First name only, exactly as the member approves it. */
  firstName: string;
  /** Role/context line, e.g. "Austin beta member · 26". */
  role: string;
  /** Alt text for the member's photo (real photo, with their consent). */
  photoAlt: string;
  /** Their specific outcome, in their words — no invented results. */
  quote: string;
};

export const TESTIMONIALS: Testimonial[] = [
  // TODO(owner): 5-8 real beta/early-grader quotes with photos, e.g.:
  // { firstName: "…", role: "…", photoAlt: "…", quote: "…" },
];

function QuoteCard({ testimonial }: { testimonial: Testimonial }) {
  return (
    <figure className="card border-rose-500/20 p-6">
      <blockquote className="text-sm leading-relaxed text-gray-300">
        &ldquo;{testimonial.quote}&rdquo;
      </blockquote>
      <figcaption className="mt-5 flex items-center gap-3">
        {/* TODO(owner): member photo asset — <img src=... alt={photoAlt} /> */}
        <div
          role="img"
          aria-label={testimonial.photoAlt}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-rose-500/20 to-violet-500/20 ring-1 ring-rose-500/30"
        >
          <svg
            className="h-5 w-5 text-rose-400/80"
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
        </div>
        <div>
          <div className="text-sm font-semibold text-white">
            {testimonial.firstName}
          </div>
          <div className="text-xs text-gray-500">{testimonial.role}</div>
        </div>
      </figcaption>
    </figure>
  );
}

export function TestimonialsSection({ showMoreLink = true }: { showMoreLink?: boolean }) {
  return (
    <section className="border-y border-white/5 bg-white/[0.02] px-4 py-20">
      <div className="mx-auto max-w-6xl">
        <h2 className="mb-3 text-center text-3xl font-bold sm:text-4xl">
          Customer stories
        </h2>
        <p className="mb-10 text-center text-gray-400">
          Real results from real members — published as the Austin beta rolls
          out. No hype, no invented quotes.
        </p>

        {TESTIMONIALS.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {TESTIMONIALS.map((t) => (
              <QuoteCard key={t.firstName} testimonial={t} />
            ))}
          </div>
        ) : (
          /* Honest single one-liner (P0-4): with no real approved stories we
             show ONE honest line — never dashed placeholder-slot cards, never
             fabricated quotes or fake review counts. */
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-lg font-semibold text-white">
              Beta testers&apos; stories are on the way — we&apos;ll publish real results as the Austin beta rolls out.
            </p>
          </div>
        )}

        {showMoreLink && (
          <p className="mt-12 text-center">
            <Link
              to="/customers"
              className="font-semibold text-rose-400 underline underline-offset-4 transition hover:text-rose-300"
            >
              Read more on our customers page
            </Link>
          </p>
        )}
      </div>
    </section>
  );
}
