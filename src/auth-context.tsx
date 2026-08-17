import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { analytics } from "@heycatch/sdk";
import { getCsrfToken } from "~/csrf-client";

export type AuthResponseState = "authenticated" | "anonymous" | "error";

export function classifyAuthResponse(
  status: number,
  payload: unknown,
): AuthResponseState {
  if (status === 401) return "anonymous";
  if (status < 200 || status >= 300) return "error";
  if (!payload || typeof payload !== "object" || !("user" in payload))
    return "error";
  const user = (payload as { user: unknown }).user;
  return user === null || (typeof user === "object" && user !== null)
    ? user === null
      ? "anonymous"
      : "authenticated"
    : "error";
}

export interface SafeUser {
  id: number;
  role?: string;
  email: string;
  display_name: string | null;
  age: number | null;
  gender: string | null;
  looking_for: string;
  bio: string | null;
  photo_path: string | null;
  grade: number | null;
  subscription_status: string;
  subscription_updated_at: string | null;
  /** End of the one-time 14-day closed-beta Premium trial (null = none). */
  trial_ends_at: string | null;
  regrades_available: number;
  boost_until: string | null;
  last_free_regrade_at: string | null;
  percentile: number | null;
  percentile_city: string | null;
  communication_style: string | null;
  lifestyle: string | null;
  dating_goals: string | null;
  college: string | null;
  occupation: string | null;
  hobbies: string | null;
  height: string | null;
  pronouns: string | null;
  ideal_first_date: string | null;
  green_flags: string | null;
  red_flags: string | null;
  obsessions: string | null;
  is_founder: boolean;
  created_at: string;
  latitude?: number;
  longitude?: number;
  max_distance?: number;
  location_city?: string;
  location_state?: string;
  distance_km?: number;
  photos?: {
    id: number;
    photo_path: string;
    sort_order: number;
    is_primary: boolean;
  }[];
  badges?: { id: string; label: string; emoji: string }[];
  verification_status: "unverified" | "pending" | "verified";
  verification_verified_at: string | null;
  /** True when the beta requires age verification (VERIFICATION_REQUIRED=true server-side). */
  verification_required: boolean;
}

/**
 * Client-side Premium check: an active subscription OR an in-flight beta
 * trial. The server is the source of truth (all API gates derive from the
 * same rule); this only drives what the UI renders.
 */
export function isPremiumUser(user: SafeUser | null | undefined): boolean {
  if (!user) return false;
  if (user.subscription_status === "active") return true;
  return !!user.trial_ends_at && new Date(user.trial_ends_at).getTime() > Date.now();
}

/**
 * HeyCatch `plan` person property: the app's own plan name, per the SDK's
 * canonical person-property contract (values are ours, the key is fixed).
 * Mirrors server-side entitlement so plan-level dashboard breakdowns line up
 * with what the app actually grants.
 */
export function heycatchPlanLabel(user: SafeUser): string {
  if (user.subscription_status === "active") return "premium";
  if (user.trial_ends_at && new Date(user.trial_ends_at).getTime() > Date.now()) {
    return "trial";
  }
  return "free";
}

interface AuthState {
  user: SafeUser | null;
  loading: boolean;
  authError: boolean;
  refetch: () => Promise<void>;
  pushPermission: NotificationPermission;
  pushSubscribed: boolean;
  subscribeToPush: () => Promise<void>;
  unsubscribeFromPush: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  authError: false,
  refetch: async () => {},
  pushPermission: "default",
  pushSubscribed: false,
  subscribeToPush: async () => {},
  unsubscribeFromPush: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SafeUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);
  const [pushPermission, setPushPermission] =
    useState<NotificationPermission>("default");
  const [pushSubscribed, setPushSubscribed] = useState(false);

  const refetch = async () => {
    try {
      const res = await fetch("/api/auth/me");
      const data = res.ok ? await res.json() : null;
      const responseState = classifyAuthResponse(res.status, data);
      if (responseState === "anonymous") {
        setUser(null);
        setAuthError(false);
        // New anonymous visitor on this browser — clear any previous identity
        // so their activity is no longer attributed to the signed-out user.
        analytics.resetIdentity();
      } else if (responseState === "error") {
        // A server outage must not look like a logout. Keep a known user usable.
        setAuthError(true);
      } else {
        if (
          !data ||
          (data.user !== null && (!data.user || typeof data.user !== "object"))
        ) {
          setAuthError(true);
        } else {
          const nextUser = data.user as SafeUser;
          setUser(nextUser);
          setAuthError(false);
          // HeyCatch: link this browser session to the authenticated user.
          // Stable internal id only (never the email as the id); email/name/
          // plan ride along as properties; signup_date is set-ONCE so a later
          // sign-in can never move the account-age anchor. No-op before init.
          analytics.setIdentity(
            String(nextUser.id),
            {
              email: nextUser.email,
              name: nextUser.display_name ?? undefined,
              plan: heycatchPlanLabel(nextUser),
            },
            { signup_date: nextUser.created_at },
          );
        }
      }
    } catch {
      // Preserve the last-known session during transient network failures.
      setAuthError(true);
    } finally {
      setLoading(false);
    }
  };

  // Check notification permission on mount
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setPushPermission(Notification.permission);
      // Also check if already subscribed
      navigator.serviceWorker.ready.then((reg) => {
        reg.pushManager.getSubscription().then((sub) => {
          setPushSubscribed(!!sub);
        });
      });
    }
  }, []);

  const subscribeToPush = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    try {
      const permission = await Notification.requestPermission();
      setPushPermission(permission);

      if (permission !== "granted") return;

      // Get VAPID public key
      const vapidRes = await fetch("/api/push/vapid-public-key");
      const { publicKey } = await vapidRes.json();

      // Register service worker if not already
      const reg = await navigator.serviceWorker.ready;

      // Subscribe to push
      let subscription = await reg.pushManager.getSubscription();
      if (!subscription) {
        subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }

      // Send subscription to server
      const subObj = subscription.toJSON();
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": getCsrfToken() || "",
        },
        body: JSON.stringify({
          endpoint: subObj.endpoint,
          keys: subObj.keys,
        }),
      });

      setPushSubscribed(true);
    } catch (err) {
      console.error("Push subscription failed:", err);
    }
  }, []);

  const unsubscribeFromPush = useCallback(async () => {
    if (!("serviceWorker" in navigator)) return;

    try {
      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.getSubscription();
      if (subscription) {
        const subObj = subscription.toJSON();
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": getCsrfToken() || "",
          },
          body: JSON.stringify({ endpoint: subObj.endpoint }),
        });
        await subscription.unsubscribe();
        setPushSubscribed(false);
      }
    } catch (err) {
      console.error("Push unsubscribe failed:", err);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        authError,
        refetch,
        pushPermission,
        pushSubscribed,
        subscribeToPush,
        unsubscribeFromPush,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

// Helper: convert base64 URL-safe string to Uint8Array for VAPID applicationServerKey
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
