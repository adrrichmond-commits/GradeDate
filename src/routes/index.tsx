import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { XIcon, TikTokIcon } from "~/social-icons";
import { PricingSection, FoundersClubSection } from "~/pricing-sections";
import { WaitlistForm } from "~/waitlist-form";

export const Route = createFileRoute("/")({
  component: Home,
});

// ─── Geo-gating helper ────────────────────────────────────────
function useGeoCheck() {
  const [isAustinMetro, setIsAustinMetro] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/geo-check")
      .then((res) => res.json())
      .then((data: { isAustinMetro: boolean }) => {
        if (!cancelled) setIsAustinMetro(data.isAustinMetro ?? false);
      })
      .catch(() => {
        if (!cancelled) setIsAustinMetro(false); // safe default on error
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return isAustinMetro;
}

// ---------------------------------------------------------------------------
// Waitlist Form — shared component (src/waitlist-form.tsx), used by the hero,
// the closing CTA, and the pricing block. One field (email), gentle client
// validation, friendly server-error handling, and a clear success state.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Demo Grader Component (UNCHANGED — except the done-state waitlist ladder)
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
          <span className="text-sm text-gray-400">
            Simulated demo — a preview of our real AI grading
          </span>
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
              Upload a selfie to see a simulated demo grade
            </span>
            <span className="text-xs text-gray-500">
              PNG, JPG — simulated preview of the real AI grader
            </span>
            <input
              type="file"
              aria-label="Upload a selfie for the demo"
              accept="image/*"
              onChange={handleFile}
              className="sr-only"
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
            <p className="text-sm text-gray-400">Simulating a demo grade...</p>
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
              <p className="mt-1 text-[10px] uppercase tracking-widest text-gray-400">
                Demo grade — simulated preview of real AI grading
              </p>
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

            {/* Waitlist ladder (owner D2.2): after the demo, the natural next
                step is the waitlist — the primary CTA of the pre-launch page. */}
            <div className="mt-5 w-full border-t border-white/10 pt-5 text-center">
              <p className="mb-3 text-sm text-gray-400">
                Want real AI grades on all your photos?
              </p>
              <a
                href="/#waitlist"
                className="btn-primary justify-center whitespace-nowrap px-7 py-3 text-sm"
              >
                Join the Waitlist
              </a>
            </div>
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
  const isAustinMetro = useGeoCheck();

  return (
    <>
      {/* ─────────────────────────────────────────────────────────────
          1. HERO — value prop + ONE primary CTA: the waitlist form.
          Mobile-first: short headline, big form, tiny trust row.
          ───────────────────────────────────────────────────────────── */}
      <section className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-24">
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

        {/* Rose pulse blob behind headline */}
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] max-w-[100vw] rounded-full bg-gradient-to-br from-rose-500/10 via-violet-500/05 to-transparent blur-3xl animate-pulse"
          style={{ animationDuration: "6s" }}
        />

        <div className="relative z-10 mx-auto max-w-3xl text-center">
          {/* Pain-first hook — swipe fatigue & dead-end chats (D1.2/D1.6) */}
          <p className="mx-auto mb-6 max-w-2xl text-lg font-medium text-gray-300 sm:text-xl">
            Burned out on swiping for one dead-end chat? Find out which photos
            actually work — and match on your level.
          </p>
          {/* Austin-first badge */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-rose-500/25 bg-rose-500/10 px-4 py-1.5">
            <span className="text-sm">📍</span>
            <span className="text-xs font-semibold uppercase tracking-widest text-rose-300">
              Austin, TX — Launching First
            </span>
          </div>

          {/* Headline */}
          <h1 className="text-center text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-6xl md:text-7xl">
            <span className="block text-white">
              Your profile, graded by AI.
            </span>
            <span
              className="block bg-gradient-to-r from-rose-400 via-rose-200 to-rose-400 bg-clip-text text-transparent animate-[shimmer_4s_ease-in-out_infinite]"
              style={{ backgroundSize: "200% auto" }}
            >
              Match on your level.
            </span>
          </h1>

          {/* Subhead — what it is, who it's for */}
          <p className="mx-auto mt-6 max-w-xl text-center text-lg leading-relaxed text-gray-400 sm:text-xl">
            Dating for 18–35s that works differently: upload up to 5 photos,
            get honest AI feedback and your best-pic pick, see your city
            percentile — then match with people who look similar, in your area.
          </p>

          {/* ONE primary CTA — the waitlist form */}
          <div className="mt-10">
            <WaitlistForm idPrefix="hero" />
          </div>

          {/* Microcopy — Austin-first, free to join */}
          <div className="mt-4 flex flex-col items-center gap-1.5 text-sm text-gray-500">
            {isAustinMetro ? (
              <p>
                You&apos;re in our launch city — join the waitlist and we&apos;ll
                email you your invite. Free to join.
              </p>
            ) : (
              <p>
                Free to join. Austin, TX goes first — we&apos;ll email you when
                your city opens.
              </p>
            )}
          </div>

          {/* Trust markers — real, live features, matched to the live
              /acceptable-use and /safety zero-tolerance facts */}
          <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-gray-400">
            <li className="flex items-center gap-1.5">
              <svg className="h-4 w-4 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
              </svg>
              Government-ID age verification
            </li>
            <li className="flex items-center gap-1.5">
              <svg className="h-4 w-4 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
              </svg>
              Photo &amp; message moderation
            </li>
            <li className="flex items-center gap-1.5">
              <svg className="h-4 w-4 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
              CSAM, underage &amp; trafficking: immediately hidden, accounts locked, reported to authorities
            </li>
            <li className="flex items-center gap-1.5">
              <svg className="h-4 w-4 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
              </svg>
              One appeal within 14 days
            </li>
          </ul>

          {/* Invite-holder path — for people who already have a code */}
          <div className="mt-8 border-t border-white/5 pt-6">
            <p className="text-sm text-gray-500">
              Already have an invite code?{" "}
              <Link
                to="/signup"
                className="font-semibold text-rose-400 underline underline-offset-4 transition hover:text-rose-300"
              >
                Sign up with it
              </Link>
              <span className="mt-1 block text-xs text-gray-400">
                Invite holders get 14 days of Premium free on signup.
              </span>
            </p>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          2. HOW IT WORKS
          ───────────────────────────────────────────────────────────── */}
      <section id="how-it-works" className="scroll-mt-24 px-4 py-24">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-4 text-center text-3xl font-bold sm:text-4xl">
            How It Works
          </h2>
          <p className="mb-16 text-center text-gray-400">
            Your journey to confidence starts here
          </p>

          <div className="relative grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {/* Subtle horizontal connector line on desktop */}
            <div className="pointer-events-none absolute left-[12.5%] right-[12.5%] top-[44px] hidden h-px bg-gradient-to-r from-transparent via-rose-500/20 to-transparent lg:block" />

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
                title: "Upload 5 Photos",
                desc: "Snap your best shots. Our AI analyzes each one — lighting, angles, composition, and overall quality.",
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
                title: "AI Grades Each with Tips",
                desc: "Get a 1–10 score and actionable feedback on every photo. Smile more, change the lighting, crop closer — practical advice.",
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
                title: "Find Your Best Profile Pic",
                desc: "We pick your strongest photo and rank the rest. Put your best face forward on every dating app.",
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
                title: "See How You Rank",
                desc: "Get your percentile in Austin — know exactly where you stand. Private, personal, and only visible to you.",
              },
            ].map((item) => (
              <div key={item.step} className="card-hover group relative p-6">
                <div className="relative z-10 mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-rose-500/10 text-rose-400 transition-colors group-hover:bg-rose-500/20">
                  {item.icon}
                </div>
                <div className="relative z-10 mb-1 text-xs font-semibold uppercase tracking-wider text-rose-400">
                  Step {item.step}
                </div>
                <h3 className="relative z-10 mb-2 text-lg font-semibold">
                  {item.title}
                </h3>
                <p className="relative z-10 text-sm leading-relaxed text-gray-400">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          2b. WHY 80/20 — honest strip. Copy placeholder (plan wording);
          the owner may supply paste-ready copy later — swap the two
          paragraphs below when they do.
          ───────────────────────────────────────────────────────────── */}
      <section className="border-y border-white/5 bg-white/[0.02] px-4 py-10">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-lg font-semibold text-white">
            80/20 feed: 80% in your range, 20% new perspectives — because
            &ldquo;your type&rdquo; is a spectrum.
          </p>
          <p className="mt-2 text-sm text-gray-500">
            Most of your matches sit close to your level; the rest give you a
            chance to be surprised. Matching stays appearance-based and
            location-aware either way.
          </p>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          3. FREE PREVIEW GRADING — a real hook that works today
          ───────────────────────────────────────────────────────────── */}
      <section id="demo" className="relative scroll-mt-24 overflow-hidden px-4 py-24">
        {/* Subtle gradient background to differentiate section */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-rose-500/[0.03] via-transparent to-violet-500/[0.03]" />

        <div className="relative mx-auto max-w-6xl">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            {/* Left column: copy */}
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-rose-500/20 bg-rose-500/10 px-4 py-1.5 text-xs font-semibold text-rose-400">
                ✓ Free · Anonymous · No Sign-Up
              </div>
              <h2 className="mb-4 text-3xl font-bold sm:text-4xl">
                See How Your Photos Score —{" "}
                <span className="bg-gradient-to-r from-rose-400 via-amber-400 to-rose-400 bg-clip-text text-transparent">
                  Free
                </span>
              </h2>
              <p className="mb-6 max-w-md text-lg leading-relaxed text-gray-400">
                Curious which photos work best? Upload a selfie and get an
                instant simulated demo grade — a preview of our real AI
                grading. No sign-up, no credit card, completely anonymous.
              </p>

              {/* Grade teaser with pulsing "?" */}
              <div className="mb-8 flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500/20 to-violet-500/20 ring-1 ring-rose-500/30">
                  <span className="animate-pulse text-3xl font-black text-rose-400">
                    ?
                  </span>
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">
                    Your grade is waiting
                  </div>
                  <div className="text-sm text-gray-400">
                    1-10 score · Simulated demo of real AI grading · Instant
                  </div>
                </div>
              </div>

              {/* Secondary CTA (owner D2.2): the demo is a taster, not the
                  loudest element — outline/ghost, smaller than the waitlist
                  primary. The waitlist is the page's ONE primary action. */}
              <Link
                to="/grade"
                className="btn-secondary inline-flex text-base hover:border-rose-400 hover:text-rose-200"
              >
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
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                Try the Demo — Free
              </Link>

              {/* Waitlist ladder microcopy — the demo ladders INTO the
                  waitlist (the primary CTA), never away from it. */}
              <p className="mt-4 text-sm text-gray-500">
                Like what you see?{" "}
                <a
                  href="/#waitlist"
                  className="font-semibold text-gray-400 underline underline-offset-4 transition hover:text-rose-300"
                >
                  Join the waitlist
                </a>{" "}
                to get real AI grading when Austin opens.
              </p>
            </div>

            {/* Right column: DemoGrader widget */}
            <div className="flex justify-center lg:justify-end">
              <DemoGrader />
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          4. PRICING — "One Plan. Full Access."
          ───────────────────────────────────────────────────────────── */}
      <section id="pricing" className="scroll-mt-24 px-4 py-24">
        <PricingSection />
      </section>

      {/* ─────────────────────────────────────────────────────────────
          5. FOUNDERS CLUB
          ───────────────────────────────────────────────────────────── */}
      <FoundersClubSection />

      {/* ─────────────────────────────────────────────────────────────
          6. CLOSING CTA — the waitlist again, unmissable
          ───────────────────────────────────────────────────────────── */}
      <section id="waitlist" className="scroll-mt-24 px-4 py-24">
        <div className="mx-auto max-w-2xl text-center">
          {/* Waitlist card */}
          <div className="card border-rose-500/20 bg-gradient-to-br from-rose-500/5 to-violet-500/5 p-10">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500/20 to-violet-500/20 ring-1 ring-rose-500/30">
              <svg className="h-7 w-7 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
            </div>

            <h2 className="mb-3 text-2xl font-bold sm:text-3xl">
              Be first when your city opens
            </h2>
            <p className="mb-8 text-gray-400">
              Austin, TX goes first. Join the waitlist and we&apos;ll email you
              the moment the beta reaches your city — free to join, no spam.
            </p>

            <WaitlistForm idPrefix="closing" />

            <p className="mt-4 text-xs text-gray-500">
              No spam. Unsubscribe anytime. We&apos;ll only email you about your
              city&apos;s launch.
            </p>
          </div>

          {/* Invite-holder path */}
          <div className="mt-6 text-sm text-gray-500">
            Already have an invite code?{" "}
            <Link
              to="/signup"
              className="font-semibold text-rose-400 underline underline-offset-4 transition hover:text-rose-300"
            >
              Sign up with it
            </Link>{" "}
            — invite holders get 14 days of Premium free.
          </div>

          {/* Contact card */}
          <div className="mb-10 mt-12 rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
            <h2 className="mb-2 text-2xl font-bold text-white">Contact</h2>
            <p className="mb-5 text-gray-400">Questions, feedback, or need help? Our team reads every message.</p>
            <Link to="/contact" className="btn-secondary inline-flex">Get in touch</Link>
          </div>

          {/* Founders Club subtle mention — TERTIARY for pre-launch visitors
              (owner D2.2): quiet/muted, still functional (→ /signup). */}
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2">
            <span>👑</span>
            <span className="text-sm text-gray-500">
              <Link to="/signup" className="font-medium text-gray-400 underline underline-offset-4 transition hover:text-gray-300">
                Join the Founders Club
              </Link>
              {" "}— the first 1,000 Premium members lock in $5.99/month forever.
            </span>
          </div>
        </div>
      </section>
      {/* ─────────────────────────────────────────────────────────────
          7. SOCIALS — real GradeDate profiles (X + TikTok)
          ───────────────────────────────────────────────────────────── */}
      <section className="px-4 pb-24">
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-5 text-center">
          <span className="text-xs font-semibold uppercase tracking-widest text-gray-500">
            Follow us
          </span>
          <div className="flex items-center gap-3">
            <a
              href="https://x.com/gradedate"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GradeDate on X"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-gray-300 transition hover:scale-105 hover:border-rose-500/40 hover:text-rose-400"
            >
              <XIcon className="h-5 w-5" />
            </a>
            <a
              href="https://www.tiktok.com/@gradedate"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GradeDate on TikTok"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-gray-300 transition hover:scale-105 hover:border-amber-500/40 hover:text-amber-400"
            >
              <TikTokIcon className="h-5 w-5" />
            </a>
          </div>
          <p className="text-xs text-gray-600">
            Launch news, features, and community — straight from GradeDate.
          </p>
        </div>
      </section>
    </>
  );
}
