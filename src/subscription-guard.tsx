import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "~/auth-context";

/**
 * Hook that redirects unsubscribed users to /subscribe.
 * Call this at the top of any protected page component.
 * Returns true if the user is subscribed and can proceed.
 */
export function useRequireSubscription(): {
  isSubscribed: boolean;
  checking: boolean;
} {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      navigate({ to: "/login" });
      return;
    }

    if (user.subscription_status !== "active") {
      navigate({ to: "/subscribe" });
    }
  }, [user, loading]);

  if (loading) {
    return { isSubscribed: false, checking: true };
  }

  if (!user) {
    return { isSubscribed: false, checking: false };
  }

  const isSubscribed = user.subscription_status === "active";
  return { isSubscribed, checking: false };
}

/**
 * Inline banner shown when a user is logged in but unsubscribed.
 * Use this on pages that should still render (e.g., profile) but
 * show a nag banner.
 */
export function SubscriptionBanner() {
  const { user } = useAuth();

  if (!user || user.subscription_status === "active") return null;

  return (
    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-amber-400 font-semibold text-sm">
            ⚠️ Subscription Required
          </p>
          <p className="text-amber-300/80 text-sm mt-0.5">
            Subscribe for $5.99/month to access full features.
          </p>
        </div>
        <a
          href="/subscribe"
          className="rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-amber-400"
        >
          Subscribe Now
        </a>
      </div>
    </div>
  );
}
