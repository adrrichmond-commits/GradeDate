import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "~/auth-context";

const STRIPE_PAYMENT_LINK = "https://buy.stripe.com/5kQ6oHbMWadwh0Z5WT7Re01";

export const Route = createFileRoute("/subscribe")({
  component: SubscribePage,
});

function SubscribePage() {
  const { user, loading, refetch } = useAuth();
  const [activating, setActivating] = useState(false);
  const [activated, setActivated] = useState(false);
  const [error, setError] = useState("");

  const handleActivate = async () => {
    setActivating(true);
    setError("");
    try {
      const res = await fetch("/api/subscription/activate", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.ok) {
        setActivated(true);
        await refetch();
      } else {
        setError(data.error || "Failed to activate subscription");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setActivating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="loader-pulse" />
          <p className="text-sm text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  // If already subscribed, show success
  if (user?.subscription_status === "active" || activated) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center px-4">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-500/20">
            <svg
              className="h-10 w-10 text-green-400"
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
          </div>
          <h1 className="mb-3 text-3xl font-bold">You're Subscribed! 🎉</h1>
          <p className="mb-6 text-gray-400">
            Your GradeDate subscription is active. Start browsing your
            looks-matched singles now.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              to="/matches"
              className="rounded-full bg-rose-600 px-6 py-3 font-semibold text-white transition hover:bg-rose-500"
            >
              Browse Matches
            </Link>
            <Link
              to="/profile"
              className="rounded-full border border-gray-600 px-6 py-3 font-medium text-gray-300 transition hover:border-gray-400 hover:text-white"
            >
              View Profile
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <div className="max-w-lg text-center">
        {/* Header */}
        <div className="mb-2 inline-block rounded-full border border-rose-500/30 bg-rose-500/10 px-4 py-1 text-sm font-medium text-rose-400">
          Subscription Required
        </div>
        <h1 className="mb-3 text-3xl font-bold sm:text-4xl">
          Unlock GradeDate
        </h1>
        <p className="mb-8 text-gray-400">
          Subscribe to browse matches, connect with singles at your level, and
          start chatting. One simple plan, cancel anytime.
        </p>

        {/* Pricing Card */}
        <div className="mb-8 rounded-2xl border border-rose-500/30 bg-gradient-to-b from-gray-900 to-gray-950 p-8 shadow-xl shadow-rose-500/5">
          <div className="mb-2 text-sm font-semibold uppercase tracking-wider text-rose-400">
            Step 1 — Subscribe
          </div>
          <div className="mb-4 flex items-baseline justify-center gap-1">
            <span className="text-5xl font-extrabold">$5.99</span>
            <span className="text-gray-400">/month</span>
          </div>
          <ul className="mb-6 space-y-2 text-left text-sm">
            {[
              "Unlimited grade-matched profiles",
              "Chat with your matches",
              "Re-grade once per month",
              "No ads, ever",
              "Cancel anytime",
            ].map((item) => (
              <li key={item} className="flex items-center gap-3">
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

          {/* Stripe Payment Link */}
          <a
            href={STRIPE_PAYMENT_LINK}
            className="mb-4 block w-full rounded-full bg-rose-600 px-8 py-4 text-center text-lg font-semibold text-white shadow-lg shadow-rose-600/25 transition hover:bg-rose-500 hover:shadow-rose-500/30"
          >
            Pay $5.99/month on Stripe →
          </a>
          <p className="text-xs text-gray-500">
            After paying on Stripe, come back here and click "I've Subscribed" below to activate your account.
          </p>
        </div>

        {/* Activation */}
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6">
          <p className="mb-1 text-sm font-semibold text-amber-400">Step 2</p>
          <p className="mb-4 text-sm text-gray-400">
            After completing payment on Stripe, click below to activate your subscription and unlock the app.
          </p>
          <button
            onClick={handleActivate}
            disabled={activating}
            className="w-full rounded-full bg-green-600 px-6 py-3 font-semibold text-white transition hover:bg-green-500 disabled:opacity-50"
          >
            {activating ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Activating...
              </span>
            ) : (
              "I've Subscribed — Activate Now"
            )}
          </button>
          {error && (
            <p className="mt-3 text-sm text-red-400">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
