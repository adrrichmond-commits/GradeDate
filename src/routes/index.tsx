import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";

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
  const [plan, setPlan] = useState<"monthly" | "annual">("monthly");

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
        <div className="card-hover flex flex-col border-gray-700/50 bg-gray-900/40 p-4 sm:p-8 text-left">
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
              "Browse compatible matches",
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
        <div className="card-hover relative flex flex-col border-rose-500/30 bg-gradient-to-b from-gray-900 to-gray-950 p-4 sm:p-8 text-left shadow-lg shadow-rose-500/5 ring-1 ring-rose-500/20">
          {/* Best Value badge */}
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-amber-500 to-rose-500 px-4 py-1 text-xs font-bold uppercase tracking-wider text-white shadow-lg">
            ★ Best Value
          </div>

          <div className="mb-2 text-sm font-semibold uppercase tracking-wider text-rose-400">
            Premium
          </div>

          {/* Monthly / Annual Toggle */}
          <div className="mb-4 inline-flex self-center rounded-full bg-gray-800 p-1 shadow-inner">
            <button
              onClick={() => setPlan("monthly")}
              className={`relative rounded-full px-6 py-2 text-sm font-semibold transition-all ${
                plan === "monthly"
                  ? "bg-rose-600 text-white shadow-lg shadow-rose-600/25"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setPlan("annual")}
              className={`relative rounded-full px-6 py-2 text-sm font-semibold transition-all ${
                plan === "annual"
                  ? "bg-rose-600 text-white shadow-lg shadow-rose-600/25"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              Annual
              {plan === "annual" ? (
                <span className="ml-2 inline-block rounded-full bg-rose-400/20 px-2 py-0.5 text-xs text-rose-300">
                  Save 30%
                </span>
              ) : (
                <span className="ml-2 inline-block rounded-full bg-gray-700 px-2 py-0.5 text-xs text-gray-300">
                  Save 30%
                </span>
              )}
            </button>
          </div>

          {/* Price — changes based on plan */}
          {plan === "monthly" ? (
            <>
              <div className="mb-1 flex items-baseline gap-1">
                <span className="text-5xl font-extrabold">$5.99</span>
                <span className="text-gray-400">/month</span>
              </div>
              <p className="mb-6 text-sm text-gray-500">
                Cancel anytime
              </p>
            </>
          ) : (
            <>
              <div className="mb-1 flex items-baseline gap-1">
                <span className="text-5xl font-extrabold">$49.99</span>
                <span className="text-gray-400">/year</span>
              </div>
              <p className="mb-1 text-sm font-medium text-rose-400">
                $4.17/mo equivalent
              </p>
              <p className="mb-6 text-sm text-gray-500">
                Cancel anytime
              </p>
            </>
          )}

          <ul className="mb-8 flex-1 space-y-3">
            {[
              "Everything in Free",
              "Premium likes",
              "Premium regrades",
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
            to={`/subscribe?plan=${plan}`}
            className="btn-primary w-full justify-center text-base"
          >
            Subscribe — {plan === "monthly" ? "$5.99/month" : "$49.99/year"}
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
// Founders Club Section Component
// ---------------------------------------------------------------------------
function FoundersClubSection() {
  const [remaining, setRemaining] = useState<number | null>(null);
  const [error, setError] = useState(false);

  const fetchSpots = useCallback(() => {
    let cancelled = false;
    fetch("/api/founder-spots-remaining")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch");
        return res.json();
      })
      .then((data: { remaining: number; total: number }) => {
        if (!cancelled) {
          setRemaining(data.remaining);
          setError(false);
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const cleanup = fetchSpots();
    const interval = setInterval(fetchSpots, 30_000);
    return () => {
      cleanup();
      clearInterval(interval);
    };
  }, [fetchSpots]);

  const used = remaining !== null ? 1000 - remaining : null;
  const spotsGone = remaining !== null && remaining <= 0;

  return (
    <section className="relative overflow-hidden px-4 py-24">
      {/* Rich premium background */}
      <div className="pointer-events-none absolute inset-0">
        {/* Dark gradient base */}
        <div className="absolute inset-0 bg-gradient-to-b from-gray-950 via-gray-950/95 to-gray-950" />
        {/* Gold/amber radial glow */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[700px] w-[700px] rounded-full bg-gradient-to-br from-amber-500/[0.06] via-amber-500/[0.03] to-transparent blur-3xl" />
        {/* Subtle rose accent */}
        <div className="absolute right-0 top-0 h-[400px] w-[400px] rounded-full bg-gradient-to-br from-rose-500/[0.04] to-transparent blur-3xl" />
        {/* Dot pattern */}
        <div
          className="absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(245,158,11,0.25) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />
        {/* Animated line ornament at top */}
        <div className="absolute left-1/2 top-0 h-px w-64 -translate-x-1/2 bg-gradient-to-r from-transparent via-amber-500/30 to-transparent" />
      </div>

      <div className="relative z-10 mx-auto max-w-3xl text-center">
        {/* Crown icon */}
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500/20 via-amber-400/15 to-yellow-500/20 ring-1 ring-amber-500/30 shadow-lg shadow-amber-500/5">
          <svg
            className="h-8 w-8 text-amber-400"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M11.38 2.019a.75.75 0 011.24 0l2.69 4.302 4.97-1.307a.75.75 0 01.93.703l-.03 5.09 3.92 3.256a.75.75 0 01-.14 1.197l-4.56 2.29.33 5.082a.75.75 0 01-1.03.74L12 19.93l-4.7 2.322a.75.75 0 01-1.03-.74l.33-5.082-4.56-2.29a.75.75 0 01-.14-1.197l3.92-3.256-.03-5.09a.75.75 0 01.93-.703l4.97 1.307 2.69-4.302z" />
          </svg>
        </div>

        {/* Badge */}
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-amber-500/25 bg-amber-500/10 px-4 py-1.5">
          <span className="flex h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-xs font-semibold uppercase tracking-widest text-amber-400">
            Exclusive · Limited
          </span>
        </div>

        {/* Headline */}
        <h2 className="mb-3 text-3xl font-extrabold tracking-tight sm:text-4xl md:text-5xl">
          <span className="bg-gradient-to-r from-amber-300 via-amber-400 to-yellow-400 bg-clip-text text-transparent">
            Become one of the First 1,000 Founders.
          </span>
        </h2>

        {/* Sub-headline */}
        <p className="mx-auto mb-8 max-w-lg text-lg text-gray-300 sm:text-xl">
          Help shape the future of dating while locking in lifetime Founder benefits.
        </p>

        {/* Counter */}
        <div className="mb-10">
          {error ? (
            <p className="text-sm text-gray-500">Unable to load founder count. Check back soon.</p>
          ) : (
            <div className="flex flex-col items-center gap-2">
              {/* Progress bar */}
              <div className="w-full max-w-sm">
                <div className="mb-3 text-center">
                  {used !== null ? (
                    <p className="tabular-nums text-lg font-semibold text-gray-300">
                      <span className="text-3xl font-extrabold text-amber-400">{used}</span>
                      <span className="text-gray-500"> / 1,000 Founders Claimed</span>
                    </p>
                  ) : (
                    <p className="text-gray-500">Loading...</p>
                  )}
                </div>
                {/* Progress track */}
                <div className="h-3 w-full overflow-hidden rounded-full bg-gray-800/80 ring-1 ring-white/5">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-400 shadow-[0_0_12px_rgba(245,158,11,0.3)] transition-all duration-700 ease-out"
                    style={{
                      width: used !== null ? `${Math.max(1, (used / 1000) * 100)}%` : "0%",
                    }}
                  />
                </div>
                {/* Tick marks */}
                <div className="mt-1.5 flex justify-between px-0.5 text-[10px] text-gray-600">
                  <span>0</span>
                  <span>250</span>
                  <span>500</span>
                  <span>750</span>
                  <span>1,000</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* CTA — changes if spots are gone */}
        {spotsGone ? (
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-full border border-gray-700 bg-gray-800/50 px-6 py-4 text-gray-400">
              <span className="font-semibold text-gray-300">Founders Club is full</span>
              {" — "}Subscribe to join the waitlist for the next wave
            </div>
            <Link
              to="/subscribe"
              className="btn-secondary inline-flex items-center gap-2 px-8 py-4 text-base"
            >
              Join Waitlist
            </Link>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <Link
              to="/subscribe"
              className="inline-flex items-center gap-3 rounded-full bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 px-8 py-4 text-base font-bold text-gray-950 shadow-xl shadow-amber-500/25 transition-all duration-300 hover:scale-105 hover:shadow-amber-500/40 active:scale-95"
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
                  d="M5 13l4 4L19 7"
                />
              </svg>
              Claim Your Founder Spot
            </Link>
            <p className="text-xs text-gray-500">
              $5.99/month · Lifetime price lock · Cancel anytime
            </p>
          </div>
        )}

        {/* Perks row */}
        <div className="mt-12 grid gap-4 sm:grid-cols-3">
          {[
            {
              icon: (
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ),
              title: "Lifetime Price Lock",
              desc: "$5.99/month forever, even as prices rise",
            },
            {
              icon: (
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
                </svg>
              ),
              title: "Founding Member Badge",
              desc: "Numbered badge showing you were here first",
            },
            {
              icon: (
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                </svg>
              ),
              title: "Early Access",
              desc: "Test new features before anyone else",
            },
          ].map((perk) => (
            <div
              key={perk.title}
              className="flex flex-col items-center gap-2 rounded-xl border border-amber-500/10 bg-amber-500/[0.03] p-5 backdrop-blur-sm"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
                {perk.icon}
              </div>
              <span className="text-sm font-semibold text-gray-200">{perk.title}</span>
              <span className="text-xs text-gray-500">{perk.desc}</span>
            </div>
          ))}
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
          1. HERO — "Craft your confidence."
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
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] max-w-[100vw] rounded-full bg-gradient-to-br from-rose-500/10 via-violet-500/05 to-transparent blur-3xl animate-pulse"
          style={{ animationDuration: "6s" }}
        />

        <div className="relative z-10 mx-auto max-w-3xl text-center">

          {/* Headline */}
          <h1 className="text-center text-5xl font-extrabold leading-[1.1] tracking-tight sm:text-7xl md:text-8xl">
            <span
              className="block bg-gradient-to-r from-white via-rose-100 to-white bg-clip-text text-transparent animate-[shimmer_4s_ease-in-out_infinite]"
              style={{ backgroundSize: "200% auto" }}
            >
              Craft your confidence.
            </span>
            <span
              className="block bg-gradient-to-r from-white via-rose-100 to-white bg-clip-text text-transparent animate-[shimmer_4s_ease-in-out_infinite]"
              style={{ backgroundSize: "200% auto", animationDelay: "0.15s" }}
            >
              Connect authentically.
            </span>
          </h1>

          {/* Subhead */}
          <p className="mx-auto mt-8 max-w-xl text-center text-lg leading-relaxed text-gray-400 sm:text-xl">
            Understand how you're perceived, build real confidence, and find someone who matches your energy.
          </p>

          {/* CTA Button — changes based on geo */}
          {isAustinMetro ? (
            <>
              <Link
                to="/grade"
                className="btn-primary mt-10 inline-flex items-center gap-2 px-8 py-4 text-lg font-bold bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-400 hover:to-rose-500"
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
                $5.99/month or $49.99/year (save 30%). Join Austin's confidence-first dating community.
              </p>
            ) : (
              <p className="text-gray-500">
                $5.99/month after. No commitment. Cancel anytime.
              </p>
            )}
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
          3. HOW IT WORKS (updated copy)
          ───────────────────────────────────────────────────────────── */}
      <section id="how-it-works" className="px-4 py-24">
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
          3.5. WAITLIST — "Get notified when singles join your area"
          (Hidden for Austin metro visitors — they get the full signup flow)
          ───────────────────────────────────────────────────────────── */}
      {!isAustinMetro && <WaitlistSection />}

      {/* ─────────────────────────────────────────────────────────────
          3.6. FOUNDERS CLUB
          ───────────────────────────────────────────────────────────── */}
      <FoundersClubSection />

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
              Ready to start your journey?
            </h2>
            <p className="mb-8 text-gray-400">
              Understand your look, build your confidence, and connect with people who get you. Your best matches start here.
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
