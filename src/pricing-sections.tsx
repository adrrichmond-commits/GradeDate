import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "~/auth-context";

// ---------------------------------------------------------------------------
// Shared pricing + Founders Club sections — single source of truth for the
// Free/$5.99 Premium/Founders offer, rendered by BOTH the homepage ("/",
// inside <section id="pricing">) and the standalone /pricing route so the two
// surfaces can never drift apart. Paid CTAs stay auth-gated (PR #159):
// anonymous visitors go to /signup, signed-in non-subscribers to /subscribe.
// ---------------------------------------------------------------------------
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

export { PricingSection, FoundersClubSection };
