import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/")({
  component: Home,
});

// ---------------------------------------------------------------------------
// Demo Grader Component
// ---------------------------------------------------------------------------
function DemoGrader() {
  const [state, setState] = useState<"idle" | "analyzing" | "done">("idle");
  const [grade, setGrade] = useState<number | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    setState("analyzing");
    setTimeout(() => {
      const g = Math.floor(Math.random() * 10) + 1;
      setGrade(g);
      setState("done");
    }, 1800 + Math.random() * 1200);
  };

  const reset = () => {
    setState("idle");
    setGrade(null);
    setPreview(null);
  };

  return (
    <div className="mx-auto max-w-md">
      <div className="card border-rose-500/20 p-6">
        <div className="mb-4 flex items-center gap-2">
          <span className="badge">DEMO</span>
          <span className="text-sm text-gray-400">Try our grader</span>
        </div>

        {state === "idle" && (
          <label className="flex cursor-pointer flex-col items-center gap-4 rounded-xl border-2 border-dashed border-gray-600 p-8 transition hover:border-rose-500/50">
            <svg
              className="h-10 w-10 text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M3 16.5v3.75A2.25 2.25 0 005.25 22.5h13.5A2.25 2.25 0 0021 20.25V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
              />
            </svg>
            <span className="text-sm font-medium text-gray-300">
              Upload a selfie to see your grade
            </span>
            <span className="text-xs text-gray-500">PNG, JPG — demo only</span>
            <input
              type="file"
              accept="image/*"
              onChange={handleFile}
              className="hidden"
            />
          </label>
        )}

        {state === "analyzing" && (
          <div className="flex flex-col items-center gap-4 py-8">
            {preview && (
              <img
                src={preview}
                alt="Preview"
                className="h-32 w-32 rounded-full object-cover ring-3 ring-rose-500/15 ring-offset-2 ring-offset-gray-950"
              />
            )}
            <div className="loader-pulse" />
            <p className="text-sm text-gray-400">Analyzing your features...</p>
          </div>
        )}

        {state === "done" && grade !== null && (
          <div className="flex flex-col items-center gap-4 py-4">
            {preview && (
              <img
                src={preview}
                alt="Preview"
                className="h-24 w-24 rounded-full object-cover ring-3 ring-rose-500/15 ring-offset-2 ring-offset-gray-950"
              />
            )}
            <div className="text-center">
              <div className="animate-[scaleIn_0.5s_ease-out] text-6xl font-black text-rose-400">
                {grade}
              </div>
              <div className="mt-1 text-sm font-medium text-gray-300">/ 10</div>
            </div>
            <p className="text-center text-sm text-gray-400">
              {grade >= 9
                ? "🔥 Absolute smoke show. The top tier."
                : grade >= 7
                  ? "✨ Looking great! You'll match well."
                  : grade >= 5
                    ? "👍 Solid. Plenty of great matches waiting."
                    : grade >= 3
                      ? "🙂 Everyone's got their type. Own it."
                      : "💪 Confidence is key. Real connections happen here."}
            </p>
            <button
              onClick={reset}
              className="mt-2 text-xs text-gray-500 underline transition hover:text-gray-300"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Home Page
// ---------------------------------------------------------------------------
function Home() {
  return (
    <>
      {/* ── Hero ────────────────────────────────────────────────── */}
      <section className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
        {/* Dot grid background pattern */}
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(244,63,94,0.3) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
        {/* Background gradients */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(244,63,94,0.15),transparent_50%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_rgba(245,158,11,0.08),transparent_50%)]" />

        <div className="relative z-10 mx-auto max-w-3xl text-center">
          <span className="badge mb-6 text-sm">
            🔥 The dating app that keeps it real
          </span>
          <h1 className="mb-6 text-5xl font-extrabold leading-tight tracking-tight sm:text-7xl">
            Find your{" "}
            <span
              className="bg-gradient-to-r from-rose-400 via-amber-400 to-rose-400 bg-clip-text text-transparent animate-[shimmer_3s_ease-in-out_infinite]"
              style={{ backgroundSize: "200% auto" }}
            >
              looks-match
            </span>
            .
          </h1>
          <p className="mx-auto mb-10 max-w-xl text-lg text-gray-400 sm:text-xl">
            We grade your selfie. You date people at your level. No more shooting
            out of your league — just real connections with looks-compatible
            singles.
          </p>
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <a
              href="https://buy.stripe.com/8x2eVdeZ83P8h0Z4SP7Re00"
              className="btn-primary text-lg"
            >
              Subscribe for $5.99/mo
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 7l5 5m0 0l-5 5m5-5H6"
                />
              </svg>
            </a>
            <Link to="/grade" className="btn-secondary text-lg">
              Try demo grader →
            </Link>
          </div>
          <p className="mt-4 text-sm text-gray-500">
            No free tier. Cancel anytime.
          </p>

          {/* Social proof counter */}
          <div className="mt-8 flex items-center justify-center gap-6 text-sm text-gray-500">
            <div className="flex items-center gap-1.5">
              <div className="flex -space-x-2">
                {["#f43f5e", "#f59e0b", "#8b5cf6", "#0ea5e9"].map((c, i) => (
                  <div
                    key={i}
                    className="h-7 w-7 rounded-full border-2 border-gray-950"
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <span className="ml-1 text-gray-400">2.4k+ graded this week</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── How It Works ────────────────────────────────────────── */}
      <section id="how-it-works" className="px-4 py-24">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-4 text-center text-3xl font-bold sm:text-4xl">
            How It Works
          </h2>
          <p className="mb-16 text-center text-gray-400">
            Four simple steps to find your looks-match
          </p>

          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: (
                  <svg
                    className="h-8 w-8"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M3 16.5v3.75A2.25 2.25 0 005.25 22.5h13.5A2.25 2.25 0 0021 20.25V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                    />
                  </svg>
                ),
                step: "1",
                title: "Upload Selfie",
                desc: "Snap a clear photo of your face. Our AI analyzes facial symmetry, proportions, and features.",
              },
              {
                icon: (
                  <svg
                    className="h-8 w-8"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
                    />
                  </svg>
                ),
                step: "2",
                title: "Get Your Grade",
                desc: "Receive your 1–10 facial appearance score. Transparent, objective, and private to you.",
              },
              {
                icon: (
                  <svg
                    className="h-8 w-8"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
                    />
                  </svg>
                ),
                step: "3",
                title: "Match With Your Level",
                desc: "Browse a curated feed of singles at your grade (or one adjacent). No more wasted swipes.",
              },
              {
                icon: (
                  <svg
                    className="h-8 w-8"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
                    />
                  </svg>
                ),
                step: "4",
                title: "Date",
                desc: "Chat, connect, and meet. Real dates with people who match your vibe — and your look.",
              },
            ].map((item) => (
              <div
                key={item.step}
                className="card-hover group relative p-6"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-rose-500/10 text-rose-400 transition-colors group-hover:bg-rose-500/20">
                  {item.icon}
                </div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-rose-400">
                  Step {item.step}
                </div>
                <h3 className="mb-2 text-lg font-semibold">{item.title}</h3>
                <p className="text-sm leading-relaxed text-gray-400">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Demo Grader Section ─────────────────────────────────── */}
      <section className="px-4 py-24">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-4 text-center text-3xl font-bold sm:text-4xl">
            See It In Action
          </h2>
          <p className="mb-12 text-center text-gray-400">
            Upload a photo and get a preview of your grade — it's just a demo,
            but you'll get the idea.
          </p>
          <DemoGrader />
        </div>
      </section>

      {/* ── Pricing ─────────────────────────────────────────────── */}
      <section id="pricing" className="px-4 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="mb-4 text-3xl font-bold sm:text-4xl">
            Simple Pricing
          </h2>
          <p className="mb-12 text-gray-400">
            One plan. Full access. No games.
          </p>

          <div className="rounded-2xl border border-rose-500/30 bg-gradient-to-b from-gray-900 to-gray-950 p-8 shadow-xl shadow-rose-500/5">
            <div className="mb-2 text-sm font-semibold uppercase tracking-wider text-rose-400">
              Monthly Plan
            </div>
            <div className="mb-6 flex items-baseline justify-center gap-1">
              <span className="text-5xl font-extrabold">$5.99</span>
              <span className="text-gray-400">/month</span>
            </div>
            <ul className="mb-8 space-y-3 text-left">
              {[
                "Unlimited grade-matched profiles",
                "Chat with your matches",
                "Re-grade once per month",
                "No ads, ever",
                "Cancel anytime",
              ].map((item) => (
                <li key={item} className="flex items-center gap-3 text-sm">
                  <svg
                    className="h-5 w-5 shrink-0 text-rose-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
            <a
              href="https://buy.stripe.com/8x2eVdeZ83P8h0Z4SP7Re00"
              className="btn-primary w-full justify-center text-lg"
            >
              Subscribe for $5.99/month
            </a>
            <p className="mt-4 text-xs text-gray-500">
              Secure payment via Stripe. Your card won't be charged until the
              payment link is live.
            </p>
          </div>
        </div>
      </section>

      {/* ── Testimonials ────────────────────────────────────────── */}
      <section className="px-4 py-24">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-4 text-center text-3xl font-bold sm:text-4xl">
            What People Are Saying
          </h2>
          <p className="mb-12 text-center text-gray-400">
            Join thousands who found their looks-match
          </p>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                quote:
                  "I always felt like I was wasting time on other apps. GradeDate put me in front of people who actually wanted to match with me. Game changer.",
                name: "Sarah M.",
                location: "Austin, TX",
                grade: 8,
              },
              {
                quote:
                  "Honestly? It's refreshing. No more wondering if someone is out of your league. The grade system just works.",
                name: "Marcus J.",
                location: "Brooklyn, NY",
                grade: 6,
              },
              {
                quote:
                  "I was skeptical about being 'graded' but it's totally private. Only you see your score. The matches have been incredible.",
                name: "Aisha K.",
                location: "Los Angeles, CA",
                grade: 9,
              },
            ].map((t, i) => (
              <div
                key={i}
                className="card-hover p-6"
              >
                {/* Star rating — amber/gold */}
                <div className="mb-4 flex">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <svg
                      key={j}
                      className="h-5 w-5 text-amber-400"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <blockquote className="mb-4 text-sm leading-relaxed text-gray-300">
                  "{t.quote}"
                </blockquote>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-purple-600 text-sm font-bold text-white">
                    {t.name[0]}
                  </div>
                  <div>
                    <div className="text-sm font-semibold">{t.name}</div>
                    <div className="text-xs text-gray-500">{t.location}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────── */}
      <section className="px-4 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <div className="card border-purple-500/20 bg-gradient-to-br from-purple-500/5 to-rose-500/5 p-12">
            <h2 className="mb-4 text-3xl font-bold sm:text-4xl">
              Ready to find your looks-match?
            </h2>
            <p className="mb-8 text-gray-400">
              Stop wasting swipes. Join GradeDate and date people at your level.
            </p>
            <a
              href="https://buy.stripe.com/8x2eVdeZ83P8h0Z4SP7Re00"
              className="btn-primary text-lg"
            >
              Get Started — $5.99/mo
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 7l5 5m0 0l-5 5m5-5H6"
                />
              </svg>
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
