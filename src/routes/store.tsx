import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useRef, type ReactNode } from "react";
import { useAuth } from "~/auth-context";
import { getCsrfToken } from "~/csrf-client";
import { parseStoreReturnState } from "~/checkout-return";
import {
  nextStoreConfirmationState,
  STORE_CONFIRMATION_INTERVAL_MS,
  type StoreConfirmationState,
} from "~/store-confirmation";

const RE_GRADE_LINK = "https://buy.stripe.com/5kQ7sL3gq0CW4edfxt7Re02";
const BOOST_LINK = "https://buy.stripe.com/14A9AT2cm3P8265etp7Re03";
const LIKE_PACK_LINK = "https://buy.stripe.com/28E5kD8AK2L4fWVfxt7Re06";

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
    price: "$0.99",
    description:
      "Think your first grade didn't do you justice? Buy a $0.99 regrade credit, then re-run the multi-photo grading flow in the Grade page for fresh AI feedback on your photos.",
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
    price: "$2.99",
    description:
      "Get 7 days of increased visibility — your profile appears at the top of match results for users in your grade range.",
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
    id: "like-pack",
    name: "5 Extra Likes",
    price: "$0.99",
    description:
      "Ran out of daily likes? Get 5 extra likes to keep swiping. Perfect for free users who want more action.",
    paymentLink: LIKE_PACK_LINK,
    endpoint: "/api/store/activate-like-pack",
    icon: (
      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
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
  const [activated, setActivated] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [foundersCount, setFoundersCount] = useState<{ count: number; remaining: number } | null>(null);
  const [foundersCheckingOut, setFoundersCheckingOut] = useState(false);
  const [checkoutProduct, setCheckoutProduct] = useState<string | null>(null);
  const [showCanceled, setShowCanceled] = useState(false);
  const [genericPending, setGenericPending] = useState(false);
  const [foundersState, setFoundersState] = useState<{ kind: "success" | "canceled"; message: string } | null>(null);
  // Confirmation state machine for the purchase the user just returned from
  // Stripe with: pending → confirmed (only after the server reports the
  // entitlement) | timeout | error, with manual retry/check-again.
  const [confirmation, setConfirmation] = useState<StoreConfirmationState>("idle");
  const [confirmationProduct, setConfirmationProduct] = useState<string | null>(null);
  const [confirmationSession, setConfirmationSession] = useState<string | null>(null);
  // Dedupe re-entry: refetch() inside the confirmation loop changes `user`,
  // which re-runs the mount effect; don't start a second loop for the same
  // purchase. Kept set on confirmed so re-runs stay deduped; cleared on
  // timeout/error so Check again / Retry can re-run.
  const activeRun = useRef<{ productId: string; sessionId: string } | null>(null);

  const productName = (id: string | null) => products.find((p) => p.id === id)?.name ?? "item";

  // Stripe's return URL is not fulfillment. For a real return (session id +
  // product present) the server verifies + grants the session, then the
  // authenticated entitlement status is polled with a bounded timeout; success
  // is only shown once the server confirms the entitlement.
  useEffect(() => {
    fetch("/api/founders/count")
      .then((r) => r.json())
      .then((data) => setFoundersCount(data))
      .catch(() => {});
    const state = parseStoreReturnState(window.location.search);
    if (state.kind === "activate" && user) {
      const product = products.find((item) => item.id === state.productId);
      if (product) void runPurchaseConfirmation(product.id, state.sessionId);
    } else if (state.kind === "payment-success") {
      // No session id to verify against (Stripe always appends one, so this is
      // a hand-crafted URL). Show honest pending copy and refresh so any
      // already-granted entitlement surfaces on its item card.
      setGenericPending(true);
      void refetch();
    } else if (state.kind === "payment-cancelled") {
      setShowCanceled(true);
    } else if (state.kind === "founders-success") {
      setFoundersState({
        kind: "success",
        message:
          "Payment received — activating your Founder membership. This usually takes a few seconds.",
      });
      // The webhook may have already granted founder status; pick it up if so.
      refetch();
    } else if (state.kind === "founders-cancelled") {
      setFoundersState({ kind: "canceled", message: "Payment was canceled. No charges were made." });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleCheckout = async (product: Product) => {
    setCheckoutProduct(product.id);
    setError("");
    try {
      const res = await fetch("/api/store/create-checkout", {
        method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() || "" },
        body: JSON.stringify({ product: product.id }),
      });
      const data = await res.json();
      if (res.ok && data.url) window.location.href = data.url;
      else setError(data.error || "Unable to start secure checkout.");
    } catch { setError("Network error. Please try again."); }
    finally { setCheckoutProduct(null); }
  };

  const runPurchaseConfirmation = async (productId: string, sessionId: string) => {
    if (activeRun.current && activeRun.current.productId === productId && activeRun.current.sessionId === sessionId) {
      return;
    }
    activeRun.current = { productId, sessionId };
    setConfirmationProduct(productId);
    setConfirmationSession(sessionId);
    setConfirmation("pending");
    setError("");
    const started = Date.now();
    // First ask the server to verify + grant the session (idempotent — the
    // webhook may have already granted it). Only a server `ok` counts as
    // confirmed; a 409 (payment not yet verified) falls through to polling.
    let serverConfirmed = false;
    try {
      const res = await fetch("/api/store/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() || "" },
        body: JSON.stringify({ session_id: sessionId }),
      });
      const data = await res.json();
      serverConfirmed = res.ok && Boolean(data.ok);
    } catch {
      serverConfirmed = false;
    }
    const poll = async () => {
      if (serverConfirmed) {
        await refetch();
        setActivated(productId);
        setConfirmation("confirmed");
        return; // keep activeRun set so re-renders don't restart this loop
      }
      try {
        const res = await fetch(
          `/api/store/entitlement-status?product=${encodeURIComponent(productId)}&session_id=${encodeURIComponent(sessionId)}`,
        );
        if (!res.ok) throw new Error("status unavailable");
        const data = (await res.json()) as { entitled?: boolean };
        const next = nextStoreConfirmationState(Boolean(data.entitled), Date.now() - started);
        if (next === "confirmed") {
          await refetch();
          setActivated(productId);
        }
        setConfirmation(next);
        if (next === "pending") {
          window.setTimeout(poll, STORE_CONFIRMATION_INTERVAL_MS);
        } else {
          activeRun.current = null;
        }
      } catch {
        setConfirmation("error");
        activeRun.current = null;
      }
    };
    void poll();
  };

  const retryConfirmation = () => {
    if (confirmationProduct && confirmationSession) {
      void runPurchaseConfirmation(confirmationProduct, confirmationSession);
    } else {
      window.location.reload();
    }
  };

  const handleFoundersCheckout = async () => {
    setFoundersCheckingOut(true);
    setError("");
    try {
      const res = await fetch("/api/founders/checkout", {
        method: "POST",
        headers: { "X-CSRF-Token": getCsrfToken() || "" },
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || "Failed to start checkout.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setFoundersCheckingOut(false);
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
          Power Ups
        </div>
        <h1 className="text-3xl font-bold sm:text-4xl">Power Up Your Profile</h1>
        <p className="mt-3 text-gray-400 max-w-lg mx-auto">
          One-time purchases for everyone. Free-tier limits still apply, and every payment is verified securely by Stripe.
        </p>
      </div>

      {/* Not subscribed warning */}
      {user && user.subscription_status !== "active" && (
        <div className="mb-8 rounded-xl border border-amber-500/30 bg-amber-500/10 p-5 text-center">
          <p className="text-amber-400 font-semibold text-sm">
            Free accounts can buy power ups too. Your normal free-tier limits remain in place; purchases only unlock the item shown.
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
            Please log in to purchase power ups.
          </p>
          <Link
            to="/login"
            className="mt-3 inline-block rounded-full bg-amber-500 px-5 py-2 text-sm font-semibold text-black transition hover:bg-amber-400"
          >
            Log In
          </Link>
        </div>
      )}

      {/* Stripe return-state banners (from ?payment=… / ?founders=… query).
          Success is only claimed after the server confirms the entitlement. */}
      {confirmation === "pending" && confirmationProduct && (
        <div className="mb-8 rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 text-center" role="status">
          <p className="text-sm font-semibold text-blue-400">
            Payment received — confirming your {productName(confirmationProduct)} purchase…
          </p>
          <p className="mt-1 text-xs text-blue-400/70">
            We're waiting for Stripe to finish activation. This usually takes a few seconds.
          </p>
        </div>
      )}
      {confirmation === "timeout" && confirmationProduct && (
        <div className="mb-8 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-center" role="alert">
          <p className="text-sm font-semibold text-amber-400">
            Confirming your {productName(confirmationProduct)} purchase is taking longer than expected.
          </p>
          <button
            onClick={retryConfirmation}
            className="mt-2 rounded-full border border-amber-400/50 px-4 py-2 text-sm font-semibold text-amber-300"
          >
            Check again
          </button>
        </div>
      )}
      {confirmation === "error" && confirmationProduct && (
        <div className="mb-8 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center" role="alert">
          <p className="text-sm font-semibold text-red-400">We couldn't confirm your purchase.</p>
          <button
            onClick={retryConfirmation}
            className="mt-2 rounded-full border border-red-400/50 px-4 py-2 text-sm font-semibold text-red-300"
          >
            Retry
          </button>
        </div>
      )}
      {genericPending && (
        <div className="mb-8 rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 text-center" role="status">
          <p className="text-sm font-semibold text-blue-400">Payment received — confirming your purchase…</p>
          <p className="mt-1 text-xs text-blue-400/70">
            Your purchase will appear on the item card below once Stripe confirms it.
          </p>
          <button
            onClick={() => { setGenericPending(false); void refetch(); }}
            className="mt-2 rounded-full border border-blue-400/50 px-4 py-2 text-sm font-semibold text-blue-300"
          >
            Check purchases
          </button>
        </div>
      )}
      {showCanceled && (
        <div className="mb-8 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-center">
          <p className="text-sm font-semibold text-amber-400">Payment was canceled. No charges were made.</p>
          <p className="mt-1 text-xs text-amber-400/70">You can try again whenever you're ready.</p>
        </div>
      )}
      {foundersState && (
        <div className="mb-8 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-center">
          <p className="text-sm font-semibold text-amber-300">
            {user?.is_founder && foundersState.kind === "success"
              ? "👑 Welcome to the Founders Club!"
              : foundersState.message}
          </p>
          {foundersState.kind === "success" && !user?.is_founder && (
            <p className="mt-1 text-xs text-amber-400/70">
              If it hasn't appeared yet, refresh this page in a few seconds.
            </p>
          )}
        </div>
      )}
      {/* Founders Club Card */}
      {user && (
        <div className="mb-10">
          <div className="card relative overflow-hidden border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-gray-900 to-gray-950 p-8 shadow-lg shadow-amber-500/5 ring-1 ring-amber-500/20">
            {/* Crown icon */}
            <div className="absolute right-6 top-6 text-5xl opacity-20">👑</div>

            <div className="relative z-10">
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-400">
                👑 Limited — Only 1000 Spots
              </div>
              <h2 className="mt-3 text-2xl font-bold">Founders Club</h2>
              <p className="mt-2 text-gray-400 max-w-xl">
                Join the first 1000 members and unlock lifetime benefits. Subscription-only membership at $5.99/month with a lifetime price lock.
              </p>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="flex items-start gap-2 text-sm">
                  <span className="mt-0.5 text-amber-400">✓</span>
                  <div>
                    <span className="font-medium text-white">Premium Regrades</span>
                    <p className="text-xs text-gray-500">Re-grade your photos anytime, forever</p>
                  </div>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <span className="mt-0.5 text-amber-400">✓</span>
                  <div>
                    <span className="font-medium text-white">Founder Badge</span>
                    <p className="text-xs text-gray-500">Permanent 👑 badge on your profile</p>
                  </div>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <span className="mt-0.5 text-amber-400">✓</span>
                  <div>
                    <span className="font-medium text-white">Founder Badge</span>
                    <p className="text-xs text-gray-500">Numbered badge and lifetime $5.99/month price lock</p>
                  </div>
                </div>
              </div>

              {/* Claimed count */}
              <div className="mt-5 flex items-center gap-4">
                <div className="flex-1">
                  <div className="h-2 rounded-full bg-gray-700">
                    <div
                      className="h-2 rounded-full bg-gradient-to-r from-amber-500 to-amber-400"
                      style={{ width: `${foundersCount ? Math.min(100, (foundersCount.count / 1000) * 100) : 0}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {foundersCount ? `${foundersCount.count} / 1000 claimed` : "Loading..."}
                    {foundersCount ? ` — ${foundersCount.remaining} spots remaining` : ""}
                  </p>
                </div>

                {user.is_founder ? (
                  <div className="rounded-lg border border-green-500/20 bg-green-500/10 px-4 py-2 text-center">
                    <span className="text-sm font-semibold text-green-400">👑 You're a Founder!</span>
                  </div>
                ) : (
                  <button
                    onClick={handleFoundersCheckout}
                    disabled={foundersCheckingOut || (foundersCount !== null && foundersCount.count >= 1000)}
                    className="rounded-full bg-gradient-to-r from-amber-500 to-amber-600 px-6 py-2.5 text-sm font-semibold text-black transition hover:from-amber-400 hover:to-amber-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {foundersCheckingOut ? (
                      <span className="flex items-center gap-2">
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-black border-t-transparent" />
                        Redirecting...
                      </span>
                    ) : foundersCount !== null && foundersCount.count >= 1000 ? (
                      "Sold Out"
                    ) : (
                      "Join Founders Club →"
                    )}
                  </button>
                )}
              </div>

              {!user.is_founder && (
                <p className="mt-3 text-xs text-gray-500">
                  Price set by our team. You'll be redirected to Stripe for secure payment.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Product Cards */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((product) => {
          const isOwned =
            (product.id === "re-grade" && (user?.regrades_available ?? 0) > 0) ||
            (product.id === "boost" && user?.boost_until && new Date(user.boost_until) > new Date()) ||
            (product.id === "like-pack" && false); // always purchasable
          const justActivated = activated === product.id;
          const purchasePending = confirmationProduct === product.id && confirmation === "pending";

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

              {/* Just activated (only reached after server-confirmed entitlement) */}
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
                  <button
                    onClick={() => handleCheckout(product)}
                    disabled={checkoutProduct === product.id || purchasePending}
                    className="block w-full rounded-full bg-rose-600 px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-rose-500 disabled:opacity-50"
                  >
                    {purchasePending ? (
                      "Confirming purchase…"
                    ) : checkoutProduct === product.id ? (
                      "Opening secure checkout…"
                    ) : (
                      `Buy ${product.name} — ${product.price}`
                    )}
                  </button>
                  <p className="text-center text-xs text-gray-500">
                    You'll return here after Stripe confirms payment. Activation is server-verified and safe to retry.
                  </p>
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
