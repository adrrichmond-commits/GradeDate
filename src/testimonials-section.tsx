import { Link } from "@tanstack/react-router";

/**
 * Customer testimonial wall (audit B3 / D3.2) — shared by the homepage and the
 * /customers page so there is exactly ONE source of truth for stories.
 *
 * HONEST EMPTY STATE: the Austin beta has not produced any published,
 * member-approved stories yet, so TESTIMONIALS is intentionally EMPTY and the
 * wall renders a plain "stories are on the way" message plus design-ready card
 * slots. NOTHING here is invented — no fake names, roles, photos, or quotes.
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

/**
 * Number of quote-card slots the wall reserves (audit asks for 5-8). When
 * TESTIMONIALS is empty, this many placeholder cards render so the section
 * already has its final shape — filling it in later is pure content swap.
 */
export const SLOT_COUNT = 6;

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

/** Design-ready placeholder card — clearly a slot, never fake content. */
function SlotCard() {
  return (
    <div
      aria-label="Open slot for a real customer quote"
      className="card border-dashed border-gray-700/70 bg-white/[0.01] p-6"
    >
      <div className="flex items-center gap-3">
        {/* Photo slot */}
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-dashed border-gray-700 bg-gray-900">
          <svg
            className="h-5 w-5 text-gray-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
            />
          </svg>
        </div>
        {/* Name + role slot */}
        <div className="flex-1" aria-hidden="true">
          <div className="h-3 w-24 rounded bg-gray-800" />
          <div className="mt-1.5 h-2.5 w-16 rounded bg-gray-800/70" />
        </div>
      </div>
      {/* Quote slot */}
      <div className="mt-4 space-y-2" aria-hidden="true">
        <div className="h-2.5 w-full rounded bg-gray-800/70" />
        <div className="h-2.5 w-11/12 rounded bg-gray-800/70" />
        <div className="h-2.5 w-4/6 rounded bg-gray-800/70" />
      </div>
      <p className="mt-4 text-center text-[10px] font-semibold uppercase tracking-widest text-gray-600">
        Real quote coming soon
      </p>
    </div>
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
          <div className="mx-auto max-w-2xl text-center">
            <p className="mb-3 text-lg font-semibold text-white">
              Beta testers&apos; stories are on the way — we&apos;ll publish real results as the Austin beta rolls out.
            </p>
            <p className="mb-10 text-sm leading-relaxed text-gray-500">
              Each card below is a slot for a member&apos;s story — first name,
              role, photo, and their specific outcome — published only once a
              real member approves it.
            </p>
          </div>
        )}

        {/* The wall keeps its final shape even while TESTIMONIALS is empty:
            SLOT_COUNT reserved cards, filled in later as quotes arrive. */}
        {TESTIMONIALS.length === 0 && (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: SLOT_COUNT }, (_, i) => (
              <SlotCard key={i} />
            ))}
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
