import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { useAuth } from "~/auth-context";
import { getCsrfToken } from "~/csrf-client";

const RE_GRADE_LINK = "https://buy.stripe.com/5kQ7sL3gq0CW4edfxt7Re02";
const BOOST_LINK = "https://buy.stripe.com/14A9AT2cm3P8265etp7Re03";
const REVEAL_LIKES_LINK = "https://buy.stripe.com/eVq8wPbMW1H02659957Re04";

interface Product {
  id: string;
  name: string;
  price: string;
  description: string;
  paymentLink: string;
  icon: ReactNode;
  endpoint: string;
}

const products: Product[] = [
  {
    id: "re-grade",
    name: "Re-grade",
    price: "$2.99",
    description:
      "Think your first grade didn't do you justice? Get a fresh AI evaluation of your photo — good for one re-grade.",
    paymentLink: RE_GRADE_LINK,
    endpoint: "/api/store/activate-re-grade",
    icon: (
      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182"
        />
      </svg>
    ),
  },
  {
    id: "boost",
    name: "Profile Boost",
    price: "$3.99",
    description:
      "Get 24 hours of increased visibility — your profile appears at the top of match results for users in your grade range.",
    paymentLink: BOOST_LINK,
    endpoint: "/api/store/activate-boost",
    icon: (
      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
        />
      </svg>
    ),
  },
  {
    id: "reveal-likes",
    name: "See Who Liked You",
    price: "$0.99",
    description:
      "Unlock the list of people who have already liked your profile. Skip the guesswork and match instantly.",
    paymentLink: REVEAL_LIKES_LINK,
    endpoint: "/api/store/activate-reveal-likes",
    icon: (
      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
        />
      </svg>
    ),
  },
];

export const Route = createFileRoute("/store")({
  component: StorePage,
});

function StorePage() {
  const { user, loading, refetch } = useAuth();
  const [activating, setActivating] = useState<string | null>(null);
  const [activated, setActivated] = useState<string | null>(null);
  const [error, setError] = useState("");

  const handleActivate = async (product: Product) => {
    setActivating(product.id);
    setError("");
    try {
      const res = await fetch(product.endpoint, { method: "POST", headers: { "X-CSRF-Token": getCsrfToken() || "" } });
      const data = await res.json();
      if (res.ok && data.ok) {
        setActivated(product.id);
        await refetch();
      } else {
        setError(data.error || "Failed to activate. Make sure you completed the Stripe payment first.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setActivating(null);
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

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <div className="mb-10 text-center">
        <div className="mb-3 inline-block rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-1 text-sm font-medium text-amber-400">
          Upsell Store
        </div>
        <h1 className="text-3xl font-bold sm:text-4xl">Power Up Your Profile</h1>
        <p className="mt-3 text-gray-400 max-w-lg mx-auto">
          One-time purchases to get more out of GradeDate. Active subscription required.
        </p>
      </div>

      {/* Not subscribed warning */}
      {user && user.subscription_status !== "active" && (
        <div className="mb-8 rounded-xl border border-amber-500/30 bg-amber-500/10 p-5 text-center">
          <p className="text-amber-400 font-semibold text-sm">
            ⚠️ An active subscription is required to purchase upsells.
          </p>
          <Link
            to="/subscribe"
            className="mt-3 inline-block rounded-full bg-amber-500 px-5 py-2 text-sm font-semibold text-black transition hover:bg-amber-400"
          >
            Subscribe Now — $5.99/mo
          </Link>
        </div>
      )}

      {!user && (
        <div className="mb-8 rounded-xl border border-amber-500/30 bg-amber-500/10 p-5 text-center">
          <p className="text-amber-400 font-semibold text-sm">
            Please log in to purchase upsells.
          </p>
          <Link
            to="/login"
            className="mt-3 inline-block rounded-full bg-amber-500 px-5 py-2 text-sm font-semibold text-black transition hover:bg-amber-400"
          >
            Log In
          </Link>
        </div>
      )}

      {/* Product Cards */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((product) => {
          const isOwned =
            (product.id === "re-grade" && (user?.regrades_available ?? 0) > 0) ||
            (product.id === "boost" && user?.boost_until && new Date(user.boost_until) > new Date()) ||
            (product.id === "reveal-likes" && (user?.likes_revealed ?? 0) > 0);
          const justActivated = activated === product.id;

          return (
            <div
              key={product.id}
              className="card flex flex-col p-6 transition-all duration-300 hover:border-rose-500/20 hover:shadow-lg hover:shadow-rose-500/5"
            >
              {/* Icon */}
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-rose-500/10 text-rose-400">
                {product.icon}
              </div>

              {/* Name + Price */}
              <h3 className="text-lg font-bold">{product.name}</h3>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-2xl font-extrabold text-rose-400">
                  {product.price}
                </span>
                <span className="text-xs text-gray-500">one-time</span>
              </div>

              {/* Description */}
              <p className="mt-3 flex-1 text-sm leading-relaxed text-gray-400">
                {product.description}
              </p>

              {/* Already owned badge */}
              {isOwned && (
                <div className="mt-4 rounded-lg border border-green-500/20 bg-green-500/10 px-3 py-2 text-center">
                  <span className="text-xs font-semibold text-green-400">
                    ✓ Active
                    {product.id === "boost" && user?.boost_until
                      ? ` — until ${new Date(user.boost_until).toLocaleDateString()}`
                      : ""}
                    {product.id === "re-grade"
                      ? ` — ${user?.regrades_available} remaining`
                      : ""}
                  </span>
                </div>
              )}

              {/* Just activated */}
              {justActivated && !isOwned && (
                <div className="mt-4 rounded-lg border border-green-500/20 bg-green-500/10 px-3 py-2 text-center">
                  <span className="text-xs font-semibold text-green-400">
                    ✓ Activated! Refresh to see changes.
                  </span>
                </div>
              )}

              {/* Buy button section */}
              {!isOwned && !justActivated && (
                <div className="mt-4 space-y-3">
                  {/* Step 1: Pay on Stripe */}
                  <a
                    href={product.paymentLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full rounded-full bg-rose-600 px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-rose-500"
                  >
                    Buy {product.name} — {product.price} on Stripe →
                  </a>

                  {/* Step 2: Activate */}
                  <p className="text-center text-xs text-gray-500">
                    After paying, come back and click below to activate.
                  </p>
                  <button
                    onClick={() => handleActivate(product)}
                    disabled={activating === product.id || (user?.subscription_status !== "active")}
                    className="block w-full rounded-full border border-green-500/50 bg-green-600/20 px-4 py-2.5 text-sm font-semibold text-green-400 transition hover:bg-green-600/30 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {activating === product.id ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-green-400 border-t-transparent" />
                        Activating...
                      </span>
                    ) : (
                      `Activate ${product.name}`
                    )}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Error */}
      {error && (
        <div className="mt-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-center text-sm text-red-400">
          {error}
        </div>
      )}
    </div>
  );
}
