import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "~/auth-context";

// Stripe payment link — replace with the real link when provided
const STRIPE_PAYMENT_LINK = "https://buy.stripe.com/8x2eVdeZ83P8h0Z4SP7Re00";
const STRIPE_CUSTOMER_PORTAL = "https://billing.stripe.com/p/login/placeholder";

export const Route = createFileRoute("/subscribe")({
  component: SubscribePage,
});

function SubscribePage() {
  const { user, loading, refetch } = useAuth();
  const [activating, setActivating] = useState(false);
  const [activated, setActivated] = useState(false);
  const [error, setError] = useState("");
  const [processingSession, setProcessingSession] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Detect post-checkout redirect: ?session_id=cs_xxx
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    if (sessionId) {
      setProcessingSession(true);
      // Clean the URL
      window.history.replaceState({}, "", "/subscribe");

      // Poll subscription status until webhook fires
      let attempts = 0;
      const maxAttempts = 30; // 30 * 2s = 60 seconds max

      pollRef.current = setInterval(async () => {
        attempts++;
        try {
          const res = await fetch("/api/subscription/status");
          if (res.ok) {
            const data = await res.json();
            if (data.subscription_status === "active") {
              setProcessingSession(false);
              setActivated(true);
              await refetch();
              if (pollRef.current) clearInterval(pollRef.current);
              return;
            }
          }
        } catch {
          // Silently retry
        }

        if (attempts >= maxAttempts) {
          setProcessingSession(false);
          setError(
            "Subscription processing is taking longer than expected. If you completed payment, use the button below to activate manually.",
          );
          if (pollRef.current) clearInterval(pollRef.current);
        }
      }, 2000);
    }

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

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

  // Show processing state after Stripe redirect
  if (processingSession) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center px-4">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center">
            <div className="h-12 w-12 animate-spin rounded-full border-3 border-rose-500 border-t-transparent" />
          </div>
          <h1 className="mb-3 text-2xl font-bold">
            Processing Your Subscription...
          </h1>
          <p className="text-gray-400">
            We're confirming your payment with Stripe. This usually takes a few
            seconds. You'll be redirected automatically once your subscription
            is active.
          </p>
          <div className="mt-6 flex items-center justify-center gap-2">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-rose-500" />
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-rose-500 [animation-delay:0.2s]" />
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-rose-500 [animation-delay:0.4s]" />
          </div>
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
          {/* Manage Subscription link */}
          <p className="mt-6 text-sm text-gray-500">
            Need to manage your subscription?{" "}
            <a
              href={STRIPE_CUSTOMER_PORTAL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline transition hover:text-gray-300"
            >
              Stripe Customer Portal
            </a>
          </p>
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
            Monthly Plan
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
            Subscribe Now — $5.99/month
          </a>
          <p className="text-xs text-gray-500">
            Secure payment via Stripe. You'll be redirected to Stripe's checkout
            and automatically returned after payment.
          </p>
        </div>

        {/* "I've Subscribed" Button (fallback) */}
        <div className="rounded-2xl border border-white/5 bg-gray-900/40 p-6">
          <p className="mb-4 text-sm text-gray-400">
            Already completed your payment on Stripe? Click below to activate
            your subscription.
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

        {/* Manage Subscription */}
        <p className="mt-6 text-sm text-gray-500">
          Already subscribed?{" "}
          <a
            href={STRIPE_CUSTOMER_PORTAL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline transition hover:text-gray-300"
          >
            Manage your subscription
          </a>{" "}
          via Stripe Customer Portal.
        </p>
      </div>
    </div>
  );
}
