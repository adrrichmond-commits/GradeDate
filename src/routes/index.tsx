import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";

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
// Demo Grader Component (UNCHANGED)
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
// Pricing Section Component — Free + Paid side by side
// ---------------------------------------------------------------------------
function PricingSection() {
  return (
    <div className="mx-auto max-w-4xl text-center">
      <h2 className="mb-4 text-3xl font-bold sm:text-4xl">
        Choose Your Plan
      </h2>
      <p className="mb-10 text-gray-400">
        Start free. Upgrade when you're ready.
      </p>

      {/* Two side-by-side cards */}
      <div className="grid gap-6 sm:grid-cols-2">
        {/* ── Free Tier Card ── */}
        <div className="card-hover flex flex-col border-gray-700/50 bg-gray-900/40 p-8 text-left">
          <div className="mb-2 text-sm font-semibold uppercase tracking-wider text-gray-400">
            Free
          </div>
          <div className="mb-1 flex items-baseline gap-1">
            <span className="text-5xl font-extrabold">$0</span>
            <span className="text-gray-400">/forever</span>
          </div>
          <p className="mb-6 text-sm text-gray-500">
            No credit card required
          </p>

          <ul className="mb-8 flex-1 space-y-3">
            {[
              "3 likes per day",
              "Browse matches in your league",
              "Full messaging",
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

          <Link
            to="/grade"
            className="btn-secondary w-full justify-center text-base"
          >
            Get Started Free
          </Link>
        </div>

        {/* ── Paid Tier Card (more prominent) ── */}
        <div className="card-hover relative flex flex-col border-rose-500/30 bg-gradient-to-b from-gray-900 to-gray-950 p-8 text-left shadow-lg shadow-rose-500/5 ring-1 ring-rose-500/20">
          {/* Best Value badge */}
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-amber-500 to-rose-500 px-4 py-1 text-xs font-bold uppercase tracking-wider text-white shadow-lg">
            ★ Best Value
          </div>

          <div className="mb-2 text-sm font-semibold uppercase tracking-wider text-rose-400">
            Unlimited
          </div>
          <div className="mb-1 flex items-baseline gap-1">
            <span className="text-5xl font-extrabold">$5.99</span>
            <span className="text-gray-400">/month</span>
          </div>
          <p className="mb-6 text-sm text-gray-500">
            Cancel anytime
          </p>

          <ul className="mb-8 flex-1 space-y-3">
            {[
              "Everything in Free",
              "Unlimited likes",
              "Re-grade once per month",
              "No ads, ever",
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

          <Link
            to="/subscribe"
            className="btn-primary w-full justify-center text-base"
          >
            Subscribe
          </Link>
          <p className="mt-3 text-center text-xs text-gray-500">
            Secure payment via Stripe.
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Waitlist Section Component
// ---------------------------------------------------------------------------
function WaitlistSection() {
  const [email, setEmail] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [state, setState] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const validate = (): string | null => {
    const trimmed = email.trim();
    if (!trimmed) return "Please enter your email address";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return "Please enter a valid email address";
    if (zipCode.trim() && !/^\d{5}(-\d{4})?$/.test(zipCode.trim())) return "Please enter a valid ZIP code";
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validate();
    if (err) {
      setErrorMsg(err);
      setState("error");
      return;
    }

    setState("submitting");
    setErrorMsg("");

    try {
      const res = await fetch("/api/waitlist/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          zip_code: zipCode.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setState("success");
        setEmail("");
        setZipCode("");
      } else {
        setErrorMsg(data.error || "Something went wrong. Please try again.");
        setState("error");
      }
    } catch {
      setErrorMsg("Network error. Please check your connection and try again.");
      setState("error");
    }
  };

  return (
    <section className="relative overflow-hidden px-4 py-24">
      {/* Subtle gradient background */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-rose-500/[0.02] to-transparent" />

      <div className="relative mx-auto max-w-2xl text-center">
        <div className="card border-rose-500/20 bg-gradient-to-br from-rose-500/5 to-violet-500/5 p-10">
          {/* Icon */}
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500/20 to-violet-500/20 ring-1 ring-rose-500/30">
            <svg className="h-7 w-7 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
            </svg>
          </div>

          <h2 className="mb-3 text-2xl font-bold sm:text-3xl">
            Get notified when singles join your area
          </h2>
          <p className="mb-8 text-gray-400">
            Free to join. 3 likes/day when we launch in your area. Be the first to know when new matches arrive near you.
          </p>

          {state === "success" ? (
            <div className="flex flex-col items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500/10 ring-1 ring-green-500/30">
                <svg className="h-7 w-7 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-lg font-semibold text-white">You're on the list!</p>
              <p className="text-sm text-gray-400">Check your email for confirmation.</p>
              <button
                onClick={() => setState("idle")}
                className="mt-2 text-xs text-gray-500 underline transition hover:text-gray-300"
              >
                Sign up another email
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); if (state === "error") setState("idle"); }}
                  placeholder="you@example.com"
                  className="input-field flex-1"
                  disabled={state === "submitting"}
                  required
                />
                <input
                  type="text"
                  value={zipCode}
                  onChange={(e) => setZipCode(e.target.value)}
                  placeholder="ZIP code (optional)"
                  className="input-field sm:max-w-[160px]"
                  disabled={state === "submitting"}
                  maxLength={10}
                />
              </div>

              {state === "error" && errorMsg && (
                <p className="text-sm text-red-400">{errorMsg}</p>
              )}

              <button
                type="submit"
                disabled={state === "submitting"}
                className="btn-primary w-full justify-center"
              >
                {state === "submitting" ? (
                  <span className="flex items-center gap-2">
                    <span className="loader-pulse" />
                    Subscribing...
                  </span>
                ) : (
                  "Notify Me"
                )}
              </button>
            </form>
          )}

          <p className="mt-4 text-xs text-gray-500">
            No spam. Unsubscribe anytime. We'll only email you when new singles join your area.
          </p>
        </div>
      </div>
    </section>
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
          1. HERO — "Stop dating out of your league."
          ───────────────────────────────────────────────────────────── */}
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

        {/* Rose pulse blob behind headline */}
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-gradient-to-br from-rose-500/10 via-violet-500/05 to-transparent blur-3xl animate-pulse"
          style={{ animationDuration: "6s" }}
        />

        <div className="relative z-10 mx-auto max-w-3xl text-center">
          {/* Trust Bar */}
          <div className="mb-10 inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.04] px-5 py-2 backdrop-blur-sm">
            <div className="flex -space-x-2">
              {["#f43f5e", "#f59e0b", "#8b5cf6", "#0ea5e9"].map((c, i) => (
                <div
                  key={i}
                  className="h-8 w-8 rounded-full border-2 border-gray-950"
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <span className="text-sm text-gray-400">
              <span className="font-semibold text-white">2,400+</span> singles
              graded this week
            </span>
          </div>

          {/* Headline */}
          <h1 className="text-center text-5xl font-extrabold leading-[1.1] tracking-tight sm:text-7xl md:text-8xl">
            <span
              className="block bg-gradient-to-r from-white via-rose-100 to-white bg-clip-text text-transparent animate-[shimmer_4s_ease-in-out_infinite]"
              style={{ backgroundSize: "200% auto" }}
            >
              Build a better
            </span>
            <span
              className="block bg-gradient-to-r from-white via-rose-100 to-white bg-clip-text text-transparent animate-[shimmer_4s_ease-in-out_infinite]"
              style={{ backgroundSize: "200% auto", animationDelay: "0.15s" }}
            >
              dating profile.
            </span>
          </h1>

          {/* Subhead */}
          <p className="mx-auto mt-8 max-w-xl text-center text-lg leading-relaxed text-gray-400 sm:text-xl">
            Upload up to 5 photos, get AI-powered feedback, and see how you compare in Austin.
          </p>

          {/* CTA Button — changes based on geo */}
          {isAustinMetro ? (
            <>
              <Link
                to="/grade"
                className="btn-primary mt-10 inline-flex items-center gap-2 px-8 py-4 text-lg font-bold bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500"
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
                    d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
                  />
                </svg>
                Get Your Free Grade
              </Link>
              {/* Austin launch banner */}
              <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-green-500/30 bg-green-500/10 px-4 py-2">
                <span className="text-base">📍</span>
                <span className="text-sm text-green-400">
                  Austin is our launch city — you're in! Start matching with singles near you.
                </span>
              </div>
            </>
          ) : (
            <>
              <Link
                to="/grade"
                className="btn-primary mt-10 inline-flex items-center gap-2 px-8 py-4 text-lg font-bold"
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
                Get Your Grade — Free
              </Link>
              {/* Non-Austin note */}
              <p className="mt-3 text-sm text-gray-500">
                We're launching in Austin first. Join the waitlist to know when we reach your city.
              </p>
            </>
          )}

          {/* CTA Footnote */}
          <div className="mt-4 flex flex-col items-center gap-1.5 text-sm">
            {isAustinMetro ? (
              <p className="text-gray-500">
                $5.99/month. Join Austin's looks-matched dating community.
              </p>
            ) : (
              <p className="text-gray-500">
                $5.99/month after. No commitment. Cancel anytime.
              </p>
            )}
            <div className="flex items-center gap-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <svg
                  key={i}
                  className="h-4 w-4 text-amber-400"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              ))}
              <span className="ml-1 text-gray-500">
                4.8 from 1,200+ reviews
              </span>
            </div>
          </div>

          {/* Floating Grade Cards */}
          <div className="mt-16 grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              {
                grade: 8,
                quote: "We found our match in 3 days",
                name: "Tom & Rachel",
                gradient: "from-rose-500 to-rose-600",
              },
              {
                grade: 6,
                quote: "No more guessing if they'll reply",
                name: "Marcus",
                gradient: "from-violet-500 to-violet-600",
              },
              {
                grade: 9,
                quote: "Finally, an honest dating app",
                name: "Aisha",
                gradient: "from-amber-500 to-amber-600",
              },
            ].map((card, i) => (
              <div
                key={i}
                className="card-hover flex items-center gap-4 p-4 animate-[cardEnter_0.5s_ease-out_both]"
                style={{ animationDelay: `${0.4 + i * 0.1}s` }}
              >
                <div
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${card.gradient} text-lg font-extrabold text-white shadow-lg`}
                >
                  {card.grade}
                </div>
                <div className="min-w-0 text-left">
                  <p className="truncate text-sm leading-snug text-gray-300">
                    "{card.quote}"
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">{card.name}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Scroll indicator */}
          <div
            className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce"
            aria-hidden="true"
          >
            <svg
              className="h-6 w-6 text-gray-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 14l-7 7m0 0l-7-7m7 7V3"
              />
            </svg>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          2. STATS BAR (NEW)
          ───────────────────────────────────────────────────────────── */}
      <section className="border-y border-white/5 px-4 py-10">
        <div className="mx-auto flex max-w-4xl flex-col items-center justify-center gap-8 sm:flex-row sm:gap-16">
          {[
            { number: "5,000+", label: "Singles graded" },
            { number: "92%", label: "Match reply rate" },
            { number: "$5.99", label: "Flat monthly" },
          ].map((stat, i) => (
            <div key={i} className="text-center">
              <div className="text-4xl font-extrabold text-white">
                {stat.number}
              </div>
              <div className="mt-1 text-sm text-gray-500">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          3. HOW IT WORKS (updated copy)
          ───────────────────────────────────────────────────────────── */}
      <section id="how-it-works" className="px-4 py-24">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-4 text-center text-3xl font-bold sm:text-4xl">
            How It Works
          </h2>
          <p className="mb-16 text-center text-gray-400">
            Four simple steps to level up your profile
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
          3.5. WAITLIST — "Get notified when singles join your area"
          (Hidden for Austin metro visitors — they get the full signup flow)
          ───────────────────────────────────────────────────────────── */}
      {!isAustinMetro && <WaitlistSection />}

      {/* ─────────────────────────────────────────────────────────────
          4. FREE PREVIEW GRADING (ELEVATED — above pricing)
          ───────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden px-4 py-24">
        {/* Subtle gradient background to differentiate section */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-rose-500/[0.03] via-transparent to-violet-500/[0.03]" />

        <div className="relative mx-auto max-w-6xl">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            {/* Left column: copy */}
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-rose-500/20 bg-rose-500/10 px-4 py-1.5 text-xs font-semibold text-rose-400">
                ✓ Free · Anonymous · AI-Powered
              </div>
              <h2 className="mb-4 text-3xl font-bold sm:text-4xl">
                See Your Best Photos —{" "}
                <span className="bg-gradient-to-r from-rose-400 via-amber-400 to-rose-400 bg-clip-text text-transparent">
                  Free
                </span>
              </h2>
              <p className="mb-6 max-w-md text-lg leading-relaxed text-gray-400">
                Curious which photos work best? Upload up to 5 selfies and get
                an instant AI grade on each — no sign-up, no credit card, completely
                anonymous.
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
                  <div className="text-sm text-gray-500">
                    1-10 score · Private · Instant
                  </div>
                </div>
              </div>

              <Link to="/grade" className="btn-primary inline-flex text-lg">
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
                Get Your Grade — Free
              </Link>
              <p className="mt-3 text-sm text-gray-500">
                $5.99/month after. No commitment.
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
          5. PRICING — "One Plan. Full Access."
          ───────────────────────────────────────────────────────────── */}
      <section id="pricing" className="px-4 py-24">
        <PricingSection />
      </section>

      {/* ─────────────────────────────────────────────────────────────
          6. TESTIMONIALS (polished with grade badges + verified)
          ───────────────────────────────────────────────────────────── */}
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
              <div key={i} className="card-hover relative p-6">
                {/* Grade badge — top right */}
                <div className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-rose-600 text-xs font-extrabold text-white shadow-md">
                  {t.grade}
                </div>

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
                    <div className="flex items-center gap-1 text-sm font-semibold">
                      {t.name}
                      {/* Verified checkmark */}
                      <svg
                        className="h-4 w-4 text-sky-400"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          fillRule="evenodd"
                          d="M8.603 3.799A4.49 4.49 0 0112 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 013.498 1.307 4.491 4.491 0 011.307 3.497A4.49 4.49 0 0121.75 12a4.49 4.49 0 01-1.549 3.397 4.491 4.491 0 01-1.307 3.497 4.491 4.491 0 01-3.497 1.307A4.49 4.49 0 0112 21.75a4.49 4.49 0 01-3.397-1.549 4.49 4.49 0 01-3.498-1.306 4.491 4.491 0 01-1.307-3.498A4.49 4.49 0 012.25 12c0-1.357.6-2.573 1.549-3.397a4.49 4.49 0 011.307-3.497 4.49 4.49 0 013.497-1.307zm7.007 6.387a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                    <div className="text-xs text-gray-500">{t.location}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          7. CLOSING CTA
          ───────────────────────────────────────────────────────────── */}
      <section className="px-4 py-24">
        <div className="mx-auto max-w-2xl text-center">
          {/* Founders Club subtle mention */}
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-4 py-2">
            <span>👑</span>
            <span className="text-sm text-amber-400">
              <Link to="/store" className="font-semibold underline hover:text-amber-300">
                Join the Founders Club
              </Link>
              {" "}— first 1000 members get lifetime benefits
            </span>
          </div>

          <div className="card border-purple-500/20 bg-gradient-to-br from-purple-500/5 to-rose-500/5 p-12">
            <h2 className="mb-4 text-3xl font-bold sm:text-4xl">
              Ready to build a better dating profile?
            </h2>
            <p className="mb-8 text-gray-400">
              Upload your best photos, get AI feedback, and see how you compare. Stop guessing — start knowing.
            </p>
            <Link
              to="/grade"
              className="btn-primary text-lg inline-flex items-center gap-2"
            >
              Get Your Grade — Free
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
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
