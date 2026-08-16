import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "~/auth-context";
import { XIcon, TikTokIcon } from "~/social-icons";

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
// Waitlist Form Component — one field (email), shared by the hero and the
// closing CTA. Gentle client validation, friendly server-error handling,
// and a clear success state.
// ---------------------------------------------------------------------------
function WaitlistForm({ idPrefix }: { idPrefix: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      setErrorMsg("Please enter your email address");
      setState("error");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setErrorMsg("Please enter a valid email address");
      setState("error");
      return;
    }

    setState("submitting");
    setErrorMsg("");

    try {
      const res = await fetch("/api/waitlist/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = await res.json();
      if (data.success) {
        setState("success");
        setEmail("");
      } else {
        setErrorMsg(data.error || "Something went wrong. Please try again.");
        setState("error");
      }
    } catch {
      setErrorMsg("Network error. Please check your connection and try again.");
      setState("error");
    }
  };

  if (state === "success") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex flex-col items-center gap-3 rounded-2xl border border-green-500/25 bg-green-500/[0.06] px-6 py-8"
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500/10 ring-1 ring-green-500/30">
          <svg className="h-7 w-7 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-lg font-semibold text-white">You&apos;re on the list!</p>
        <p className="text-sm text-gray-400">
          Check your email for confirmation. We&apos;ll reach out when your city opens.
        </p>
        <button
          onClick={() => setState("idle")}
          className="mt-1 text-xs text-gray-500 underline transition hover:text-gray-300"
        >
          Sign up another email
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="mx-auto w-full max-w-xl">
      <div className="flex flex-col gap-3 sm:flex-row">
        <label htmlFor={`waitlist-email-${idPrefix}`} className="sr-only">
          Email address
        </label>
        <input
          id={`waitlist-email-${idPrefix}`}
          type="email"
          inputMode="email"
          autoComplete="email"
          aria-describedby={state === "error" ? `waitlist-error-${idPrefix}` : undefined}
          aria-invalid={state === "error"}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (state === "error") setState("idle");
          }}
          placeholder="you@email.com"
          className="input-field flex-1 px-5 py-3.5 text-base"
          disabled={state === "submitting"}
        />
        <button
          type="submit"
          disabled={state === "submitting"}
          className="btn-primary justify-center whitespace-nowrap px-8 py-3.5 text-base"
        >
          {state === "submitting" ? (
            <span className="flex items-center gap-2">
              <span className="loader-pulse" />
              Joining...
            </span>
          ) : (
            "Join the Waitlist"
          )}
        </button>
      </div>

      {state === "error" && errorMsg && (
        <p
          id={`waitlist-error-${idPrefix}`}
          role="alert"
          aria-live="assertive"
          className="mt-3 text-sm text-red-400"
        >
          {errorMsg}
        </p>
      )}
    </form>
  );
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
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pricing Section Component — Free + Paid side by side. Paid CTAs are gated:
// anonymous visitors have no account (checkout requires auth + verification),
// so they are pointed to /signup instead of a dead-end /subscribe page.
// ---------------------------------------------------------------------------
function PricingSection() {
  const { user } = useAuth();
  const signedIn = !!user;

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
              "1 free regrade per week",
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

          {/* Price — monthly only */}
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

          {signedIn ? (
            <Link
              to="/subscribe"
              className="btn-primary w-full justify-center text-base"
            >
              Subscribe — $5.99/month
            </Link>
          ) : (
            <Link
              to="/signup"
              className="btn-primary w-full justify-center text-base"
            >
              Create a free account
            </Link>
          )}
          <p className="mt-3 text-center text-xs text-gray-500">
            {signedIn
              ? "Secure payment via Stripe."
              : "Free to join — Austin, TX goes first."}
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Founders Club Section Component — real, capped, honestly worded.
// Live count is unified: one endpoint (/api/founders/count) returns
// { founders_count, waitlist_count, remaining, total } for every surface
// (landing + store card), so the two can never drift apart.
// ---------------------------------------------------------------------------
interface FounderClubStats {
  founders_count: number;
  waitlist_count: number;
  remaining: number;
  total: number;
}

// Below 100 founders the section renders clean text instead of a progress
// bar + 250/500/750 tick marks (those only show once the count is ≥100).
const FOUNDER_BAR_THRESHOLD = 100;
// "Only N spots left" is factual (the 1,000 cap is real, enforced
// server-side) — shown once remaining is at or below this and above zero.
const FOUNDER_LOW_SPOTS = 100;

function FounderCounter({ stats }: { stats: FounderClubStats | null }) {
  if (!stats) {
    return <p className="text-gray-500">Loading...</p>;
  }
  const { founders_count, waitlist_count, remaining, total } = stats;
  if (founders_count >= FOUNDER_BAR_THRESHOLD) {
    const showLowSpots = remaining > 0 && remaining <= FOUNDER_LOW_SPOTS;
    return (
      <div className="flex flex-col items-center gap-2">
        <div className="w-full max-w-sm">
          <div className="mb-3 text-center">
            <p className="tabular-nums text-lg font-semibold text-gray-300">
              <span className="text-3xl font-extrabold text-amber-400">
                {founders_count.toLocaleString()}
              </span>
              <span className="text-gray-500"> / {total.toLocaleString()} claimed</span>
            </p>
            {showLowSpots && (
              <p className="mt-1 text-sm font-semibold text-amber-400">
                Only {remaining.toLocaleString()} spot{remaining === 1 ? "" : "s"} left
              </p>
            )}
          </div>
          {/* Progress track */}
          <div className="h-3 w-full overflow-hidden rounded-full bg-gray-800/80 ring-1 ring-white/5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-400 shadow-[0_0_12px_rgba(245,158,11,0.3)] transition-all duration-700 ease-out"
              style={{
                width: `${Math.max(1, (founders_count / total) * 100)}%`,
              }}
            />
          </div>
          {/* Tick marks */}
          <div className="mt-1.5 flex justify-between px-0.5 text-[10px] text-gray-400">
            <span>0</span>
            <span>250</span>
            <span>500</span>
            <span>750</span>
            <span>{total.toLocaleString()}</span>
          </div>
        </div>
      </div>
    );
  }
  // Below 100 founders: clean text, no bar, no tick marks. If nobody has
  // claimed a spot yet but people are on the waitlist, say so honestly
  // instead of the awkward "First 0 of 1,000 claimed".
  if (founders_count === 0 && waitlist_count > 0) {
    return (
      <p className="text-lg font-semibold text-gray-300">
        <span className="text-3xl font-extrabold text-amber-400">
          {waitlist_count.toLocaleString()}
        </span>
        <span className="text-gray-500"> on the waitlist</span>
      </p>
    );
  }
  return (
    <p className="text-lg font-semibold text-gray-300">
      <span className="text-3xl font-extrabold text-amber-400">
        First {founders_count.toLocaleString()}
      </span>
      <span className="text-gray-500"> of {total.toLocaleString()} claimed</span>
    </p>
  );
}

// ── Illustrative founder avatars ─────────────────────────────────
// OWNER DECISION (2026-08-16): these are ILLUSTRATIVE EXAMPLES only — NOT
// real members, NOT tied to the live count, never implied to be real users.
// They are flat, stylized SVG faces (never photorealistic, never photos) so
// they can't be mistaken for pictures of real people. No member photos.
type AvatarHairStyle =
  | "short"
  | "buzz"
  | "curly"
  | "afro"
  | "long"
  | "bun"
  | "beanie"
  | "pompadour"
  | "waves"
  | "braids"
  | "side-part";
interface AvatarStyle {
  skin: string;
  hair: string;
  hairStyle: AvatarHairStyle;
  glasses?: boolean;
  beard?: boolean;
  blush?: boolean;
  earrings?: boolean;
}

const FOUNDER_AVATAR_STYLES: AvatarStyle[] = [
  { skin: "#F2C8A0", hair: "#1C1917", hairStyle: "short", blush: true },
  { skin: "#C68B59", hair: "#3B2A20", hairStyle: "curly", earrings: true },
  { skin: "#7A4632", hair: "#0F0E0C", hairStyle: "afro", glasses: true },
  { skin: "#E8B48C", hair: "#8B5A2B", hairStyle: "bun", blush: true },
  { skin: "#9C6239", hair: "#6B4423", hairStyle: "waves", beard: true },
  { skin: "#D9A066", hair: "#E3C88F", hairStyle: "long", earrings: true },
  { skin: "#5D3627", hair: "#1C1917", hairStyle: "pompadour", glasses: true },
  { skin: "#F2C8A0", hair: "#F59E0B", hairStyle: "beanie" },
  { skin: "#B0734A", hair: "#7C2D3A", hairStyle: "short", beard: true },
  { skin: "#5D3627", hair: "#9CA3AF", hairStyle: "waves", glasses: true },
  { skin: "#E8B48C", hair: "#C89B5A", hairStyle: "side-part", blush: true, earrings: true },
  { skin: "#9C6239", hair: "#1C1917", hairStyle: "braids", blush: true },
  { skin: "#C68B59", hair: "#3B2A20", hairStyle: "buzz", glasses: true },
  { skin: "#D9A066", hair: "#6B4423", hairStyle: "bun", earrings: true },
  { skin: "#F2C8A0", hair: "#FB7185", hairStyle: "beanie", earrings: true },
];

function FounderHair({ style, color }: { style: AvatarHairStyle; color: string }) {
  switch (style) {
    case "curly":
      return (
        <g fill={color}>
          <circle cx="19.5" cy="31" r="6.5" />
          <circle cx="24.5" cy="25.5" r="9" />
          <circle cx="32" cy="21.5" r="10.5" />
          <circle cx="39.5" cy="25.5" r="9" />
          <circle cx="44.5" cy="31" r="6.5" />
          <circle cx="32" cy="30" r="8.5" />
        </g>
      );
    case "bun":
      return (
        <g fill={color}>
          <path d="M12 34 A20 20 0 0 1 52 34 Z" />
          <circle cx="32" cy="13" r="6.5" />
        </g>
      );
    case "beanie":
      return (
        <g fill={color}>
          <path d="M12 34 A20 20 0 0 1 52 34 Z" />
          <rect x="11.5" y="29" width="41" height="6.5" rx="3.25" opacity="0.85" />
        </g>
      );
    case "pompadour":
      return <path d="M12 34 A20 26 0 0 1 52 34 Z" fill={color} />;
    case "waves":
      return (
        <g>
          <path d="M12 34 A20 20 0 0 1 52 34 Z" fill={color} />
          <path
            d="M20 23 q4 -3 8 0 M33 21 q4 -3 8 0"
            stroke="rgba(0,0,0,0.28)"
            strokeWidth="2.2"
            strokeLinecap="round"
            fill="none"
          />
        </g>
      );
    case "side-part":
      return (
        <g>
          <path d="M12 34 A20 20 0 0 1 52 34 Z" fill={color} />
          <path d="M31 14.5 L31 34" stroke="rgba(0,0,0,0.28)" strokeWidth="2" />
        </g>
      );
    case "braids":
      return (
        <g>
          <path d="M12 34 A20 20 0 0 1 52 34 Z" fill={color} />
          <g stroke={color} strokeWidth="5" strokeLinecap="round" fill="none">
            <path d="M16 35 v14" />
            <path d="M48 35 v14" />
          </g>
        </g>
      );
    case "buzz":
      return <path d="M14.5 31 A17.5 17.5 0 0 1 49.5 31 Z" fill={color} />;
    case "short":
    default:
      return (
        <g fill={color}>
          <path d="M12 34 A20 20 0 0 1 52 34 Z" />
          <rect x="12" y="33" width="4" height="5" rx="2" />
          <rect x="48" y="33" width="4" height="5" rx="2" />
        </g>
      );
  }
}

function FaceAvatar({ style }: { style: AvatarStyle }) {
  const { skin, hair, hairStyle, glasses, beard, blush, earrings } = style;
  const ink = "#23272F";
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className="h-11 w-11">
      {/* Afro sits behind the head */}
      {hairStyle === "afro" && <circle cx="32" cy="29" r="20.5" fill={hair} />}
      {/* Head + ears */}
      <circle cx="32" cy="34" r="19" fill={skin} />
      <circle cx="12.5" cy="36" r="4" fill={skin} />
      <circle cx="51.5" cy="36" r="4" fill={skin} />
      {/* Long hair frames the sides (over the ears) */}
      {hairStyle === "long" && (
        <g fill={hair}>
          <rect x="10.5" y="30" width="6.5" height="22" rx="3.25" />
          <rect x="47" y="30" width="6.5" height="22" rx="3.25" />
        </g>
      )}
      {/* Top hair */}
      <FounderHair style={hairStyle} color={hair} />
      {/* Eyebrows */}
      <g
        stroke={ink}
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
        opacity="0.5"
      >
        <path d="M21 29.5 q3 -2.6 6 -1.2" />
        <path d="M37 28.3 q3 -1.4 6 1.2" />
      </g>
      {/* Eyes */}
      <circle cx="24" cy="35" r="2.6" fill={ink} />
      <circle cx="40" cy="35" r="2.6" fill={ink} />
      {/* Blush */}
      {blush && (
        <g fill="#FB7185" opacity="0.35">
          <circle cx="19.5" cy="39.5" r="3" />
          <circle cx="44.5" cy="39.5" r="3" />
        </g>
      )}
      {/* Glasses */}
      {glasses && (
        <g stroke={ink} strokeWidth="1.8" fill="none" opacity="0.85">
          <circle cx="24" cy="35" r="6.2" />
          <circle cx="40" cy="35" r="6.2" />
          <path d="M30.2 35 h3.6" />
        </g>
      )}
      {/* Smile */}
      <path
        d="M27 42.5 q5 4 10 0"
        stroke={ink}
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />
      {/* Beard */}
      {beard && (
        <path d="M23.5 44.5 q8.5 6.5 17 0 v2 q-8.5 5.5 -17 0 z" fill={hair} opacity="0.9" />
      )}
      {/* Earrings */}
      {earrings && (
        <g fill="#F59E0B">
          <circle cx="12.5" cy="41.5" r="1.8" />
          <circle cx="51.5" cy="41.5" r="1.8" />
        </g>
      )}
    </svg>
  );
}

function FoundersClubSection() {
  const [stats, setStats] = useState<FounderClubStats | null>(null);
  const [error, setError] = useState(false);
  const { user } = useAuth();
  const signedIn = !!user;

  const fetchStats = useCallback(() => {
    let cancelled = false;
    fetch("/api/founders/count")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch");
        return res.json();
      })
      .then((data: FounderClubStats) => {
        if (!cancelled) {
          setStats(data);
          setError(false);
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const cleanup = fetchStats();
    const interval = setInterval(fetchStats, 30_000);
    return () => {
      cleanup();
      clearInterval(interval);
    };
  }, [fetchStats]);

  const remaining = stats?.remaining ?? null;
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
          <span className="flex h-2 w-2 rounded-full bg-amber-400" />
          <span className="text-xs font-semibold uppercase tracking-widest text-amber-400">
            1,000 Spots · Forever
          </span>
        </div>

        {/* Headline */}
        <h2 className="mb-3 text-3xl font-extrabold tracking-tight sm:text-4xl md:text-5xl">
          <span className="bg-gradient-to-r from-amber-300 via-amber-400 to-yellow-400 bg-clip-text text-transparent">
            The First 1,000 Founders. Ever.
          </span>
        </h2>

        {/* Sub-headline */}
        <p className="mx-auto mb-8 max-w-lg text-lg text-gray-300 sm:text-xl">
          The first 1,000 Premium members become Founders: a numbered badge,
          early access to new features, and your $5.99/month locked in forever.
        </p>

        {/* Counter — live, factual, unified with the store card */}
        <div className="mb-10">
          {error ? (
            <p className="text-sm text-gray-500">Unable to load founder count. Check back soon.</p>
          ) : (
            <FounderCounter stats={stats} />
          )}
        </div>

        {/* Illustrative community preview — stylized faces, NOT real members */}
        <div className="mx-auto mb-10 max-w-md">
          <div className="flex flex-wrap items-center justify-center gap-3">
            {FOUNDER_AVATAR_STYLES.map((style, i) => (
              <div
                key={i}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-amber-500/15 via-gray-800/40 to-rose-500/10 ring-1 ring-white/10 shadow-lg shadow-black/20"
              >
                <FaceAvatar style={style} />
              </div>
            ))}
          </div>
          <p className="mt-4 text-center text-xs text-gray-500">
            Illustrative examples — stylized illustrations, not photos of real members
          </p>
        </div>

        {/* CTA — changes if spots are gone. Paid CTAs are auth-gated:
            anonymous visitors go to /signup (checkout needs an account). */}
        {spotsGone ? (
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-full border border-gray-700 bg-gray-800/50 px-6 py-4 text-gray-400">
              <span className="font-semibold text-gray-300">Founders Club is full</span>
              {" — "}Subscribe to join the waitlist for the next wave
            </div>
            <Link
              to={signedIn ? "/subscribe" : "/signup"}
              className="btn-secondary inline-flex items-center gap-2 px-8 py-4 text-base"
            >
              Join Waitlist
            </Link>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <Link
              to={signedIn ? "/subscribe" : "/signup"}
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
              Join the Founders Club
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
              title: "Permanent Founder Badge",
              desc: "Numbered #1–#1000. Yours forever.",
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
      <section className="relative overflow-hidden px-4 py-24">
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
                Try the Demo — Free
              </Link>
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
      <section id="pricing" className="px-4 py-24">
        <PricingSection />
      </section>

      {/* ─────────────────────────────────────────────────────────────
          5. FOUNDERS CLUB
          ───────────────────────────────────────────────────────────── */}
      <FoundersClubSection />

      {/* ─────────────────────────────────────────────────────────────
          6. CLOSING CTA — the waitlist again, unmissable
          ───────────────────────────────────────────────────────────── */}
      <section id="waitlist" className="px-4 py-24">
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

          {/* Founders Club subtle mention */}
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-4 py-2">
            <span>👑</span>
            <span className="text-sm text-amber-400">
              <Link to="/signup" className="font-semibold underline hover:text-amber-300">
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
