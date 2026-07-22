import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useAuth } from "~/auth-context";

type Plan = "monthly" | "annual";

interface PlanInfo {
  label: string;
  price: number;
  period: string;
  savingsBadge: string | null;
  equivalent: string | null;
}

const PLANS: Record<Plan, PlanInfo> = {
  monthly: {
    label: "Monthly",
    price: 5.99,
    period: "/month",
    savingsBadge: null,
    equivalent: null,
  },
  annual: {
    label: "Annual",
    price: 49.99,
    period: "/year",
    savingsBadge: "Save 30%",
    equivalent: "$4.17/mo equivalent",
  },
};

export const Route = createFileRoute("/subscribe")({
  component: SubscribePage,
  validateSearch: (
    search: Record<string, unknown>,
  ): { success?: string; canceled?: string } => {
    return {
      success: search.success as string | undefined,
      canceled: search.canceled as string | undefined,
    };
  },
});

function SubscribePage() {
  const { user, loading, refetch } = useAuth();
  const [plan, setPlan] = useState<Plan>("monthly");
  const [checkingOut, setCheckingOut] = useState(false);
  const [error, setError] = useState("");

  // Read URL params for post-Stripe-redirect status
  const search = Route.useSearch();
  const showSuccess = search.success === "true";
  const showCanceled = search.canceled === "true";

  const currentPlan = PLANS[plan];

  const handleSubscribe = async () => {
    setCheckingOut(true);
    setError("");
    try {
      const res = await fetch("/api/subscription/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        // Redirect to Stripe Checkout
        window.location.href = data.url;
      } else {
        setError(data.error || "Failed to create checkout session");
        setCheckingOut(false);
      }
    } catch {
      setError("Network error. Please try again.");
      setCheckingOut(false);
    }
  };

  // After returning from Stripe with success=true, refetch user to pick up subscription
  useEffect(() => {
    if (showSuccess) {
      refetch();
    }
  }, [showSuccess]);

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
  if (user?.subscription_status === "active") {
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
          start chatting. Choose monthly or save 30% with an annual plan.
        </p>

        {/* Success banner */}
        {showSuccess && (
          <div className="mb-6 rounded-xl border border-green-500/30 bg-green-500/10 p-4">
            <p className="font-semibold text-green-400">
              ✅ Subscription successful! Your account is now active.
            </p>
            <p className="mt-1 text-sm text-green-400/70">
              Head to{" "}
              <Link to="/matches" className="underline hover:text-green-300">
                Browse Matches
              </Link>{" "}
              to start connecting.
            </p>
          </div>
        )}

        {/* Canceled banner */}
        {showCanceled && (
          <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
            <p className="font-semibold text-amber-400">
              Payment was canceled. No charges were made.
            </p>
            <p className="mt-1 text-sm text-amber-400/70">
              You can try again whenever you're ready.
            </p>
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Plan Toggle */}
        <div className="mb-6 inline-flex rounded-full bg-gray-800 p-1 shadow-inner">
          {(Object.keys(PLANS) as Plan[]).map((key) => (
            <button
              key={key}
              onClick={() => setPlan(key)}
              className={`relative rounded-full px-6 py-2 text-sm font-semibold transition-all ${
                plan === key
                  ? "bg-rose-600 text-white shadow-lg shadow-rose-600/25"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              {PLANS[key].label}
              {PLANS[key].savingsBadge && plan === key && (
                <span className="ml-2 inline-block rounded-full bg-rose-400/20 px-2 py-0.5 text-xs text-rose-300">
                  {PLANS[key].savingsBadge}
                </span>
              )}
              {PLANS[key].savingsBadge && plan !== key && (
                <span className="ml-2 inline-block rounded-full bg-gray-700 px-2 py-0.5 text-xs text-gray-300">
                  {PLANS[key].savingsBadge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Pricing Card */}
        <div
          className={`mb-8 rounded-2xl border bg-gradient-to-b p-8 shadow-xl transition-all ${
            plan === "annual"
              ? "border-rose-400/50 from-gray-900 to-gray-950 shadow-rose-500/10 ring-2 ring-rose-500/20"
              : "border-rose-500/30 from-gray-900 to-gray-950 shadow-rose-500/5"
          }`}
        >
          <div className="mb-2 text-sm font-semibold uppercase tracking-wider text-rose-400">
            Subscribe
          </div>

          {/* Price display */}
          <div className="mb-1 flex items-baseline justify-center gap-1">
            <span className="text-5xl font-extrabold">
              ${currentPlan.price.toFixed(2)}
            </span>
            <span className="text-gray-400">{currentPlan.period}</span>
          </div>

          {currentPlan.equivalent && (
            <p className="mb-4 text-sm text-rose-400">{currentPlan.equivalent}</p>
          )}
          {!currentPlan.equivalent && <div className="mb-4" />}

          {/* Savings badge for annual plan */}
          {currentPlan.savingsBadge && (
            <div className="mx-auto mb-4 inline-block rounded-full border border-rose-400/30 bg-rose-500/10 px-4 py-1 text-sm font-medium text-rose-400">
              🎉 {currentPlan.savingsBadge} vs monthly
            </div>
          )}

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

          {/* Checkout Button */}
          <button
            onClick={handleSubscribe}
            disabled={checkingOut}
            className={`w-full rounded-full px-8 py-4 text-center text-lg font-semibold text-white shadow-lg transition ${
              plan === "annual"
                ? "bg-rose-500 shadow-rose-500/30 hover:bg-rose-400"
                : "bg-rose-600 shadow-rose-600/25 hover:bg-rose-500 hover:shadow-rose-500/30"
            } disabled:cursor-wait disabled:opacity-60`}
          >
            {checkingOut ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Redirecting to Stripe...
              </span>
            ) : (
              `Subscribe — $${currentPlan.price.toFixed(2)}${currentPlan.period}`
            )}
          </button>
          <p className="mt-3 text-xs text-gray-500">
            You'll be redirected to Stripe to complete your subscription securely.
          </p>
        </div>

        {/* Security / trust badges */}
        <div className="flex items-center justify-center gap-6 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Secure checkout
          </span>
          <span>Powered by Stripe</span>
          <span>Cancel anytime</span>
        </div>
      </div>
    </div>
  );
}
