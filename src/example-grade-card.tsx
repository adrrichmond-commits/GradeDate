/**
 * Static "Example result" card for the homepage demo section (audit B2 / D1.5).
 *
 * This is a MOCK — a concrete, clearly-labeled example of what a graded photo
 * looks like after the real AI runs, so visitors see a result without uploading
 * anything. It must never be mistaken for a real member:
 *   - the card header and the image caption both say "Example";
 *   - the "photo" is a SYNTHETIC illustration (abstract silhouette, no facial
 *     features, no real person) — deliberately not a photo of anyone;
 *   - the grade (7.8/10), tips, best-pic ribbon, and percentile line are all
 *     static example copy, not a real user's data.
 *
 * The percentile line is consistent with the app's percentile semantics
 * (src/percentile.ts): a 7.8 grade maps to a 78th-percentile rank, displayed
 * as "Top 22%".
 */

const EXAMPLE_TIPS = [
  "Face the light — it's washing out your eyes.",
  "Crop in tighter — the frame is mostly empty space.",
  "Lose the sunglasses — eyes build trust.",
] as const;

export function ExampleGradeCard() {
  return (
    <div className="mx-auto max-w-md">
      <div className="card border-rose-500/20 p-6">
        <div className="mb-4 flex items-center gap-2">
          <span className="badge">EXAMPLE RESULT</span>
          <span className="text-sm text-gray-400">
            A sample grade card — not a real member
          </span>
        </div>

        {/* Synthetic sample "photo" — abstract illustration, clearly not a
            person. Meaningful alt text (audit D5.5): describes what it is and
            that it is synthetic. */}
        <div className="relative overflow-hidden rounded-xl">
          <svg
            role="img"
            aria-label="Example result: a synthetic illustration used as a stand-in profile photo — an abstract silhouette, not a real person. It carries a 7.8 out of 10 grade badge and a Best pic ribbon."
            viewBox="0 0 320 320"
            className="h-auto w-full"
          >
            <defs>
              <linearGradient id="example-bg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#1e1b4b" />
                <stop offset="55%" stopColor="#2a1a2e" />
                <stop offset="100%" stopColor="#4c0d20" />
              </linearGradient>
              <linearGradient id="example-silhouette" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.55" />
                <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.35" />
              </linearGradient>
            </defs>
            <rect width="320" height="320" fill="url(#example-bg)" />
            {/* Abstract head + shoulders — no facial features, so nobody
                reads this as a real person */}
            <circle cx="160" cy="118" r="54" fill="url(#example-silhouette)" />
            <path
              d="M46 320c0-66 52-108 114-108s114 42 114 108z"
              fill="url(#example-silhouette)"
            />
            {/* Decorative sparkles to keep it obviously illustrative */}
            <path
              d="M236 76l2.6 6.4 6.4 2.6-6.4 2.6-2.6 6.4-2.6-6.4-6.4-2.6 6.4-2.6z"
              fill="#fbbf24"
              opacity="0.8"
            />
            <circle cx="88" cy="204" r="4" fill="#f43f5e" opacity="0.7" />
            <circle cx="244" cy="206" r="3" fill="#fbbf24" opacity="0.6" />
          </svg>

          {/* Grade badge */}
          <span className="absolute bottom-3 right-3 flex items-baseline gap-1 rounded-full bg-gradient-to-r from-rose-600 to-violet-600 px-3.5 py-1.5 text-white shadow-lg shadow-rose-900/40">
            <span className="text-lg font-black leading-none">7.8</span>
            <span className="text-xs font-semibold opacity-90">/ 10</span>
          </span>

          {/* Best-pic ribbon */}
          <span className="absolute left-3 top-3 rounded-full border border-amber-400/40 bg-amber-500/90 px-3 py-1 text-xs font-bold uppercase tracking-wide text-gray-950 shadow">
            ⭐ Best pic
          </span>
        </div>

        <p className="mt-2 text-center text-[10px] uppercase tracking-widest text-gray-500">
          Example — synthetic illustration, not a real member
        </p>

        {/* Actionable tips */}
        <ul className="mt-4 space-y-2">
          {EXAMPLE_TIPS.map((tip) => (
            <li key={tip} className="flex items-start gap-2 text-sm text-gray-300">
              <svg
                className="mt-0.5 h-4 w-4 shrink-0 text-rose-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.746 3.746 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z"
                />
              </svg>
              {tip}
            </li>
          ))}
        </ul>

        {/* Percentile line — consistent with src/percentile.ts semantics */}
        <p className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-center text-sm">
          <span className="font-bold text-rose-400">Top 22% in Austin</span>
          <span className="text-gray-500">
            {" "}
            — example city percentile from a 7.8 grade
          </span>
        </p>
      </div>
    </div>
  );
}
