import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { getCsrfToken } from "~/csrf-client";

export interface SafeUser {
  id: number;
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
  regrades_available: number;
  boost_until: string | null;
  likes_revealed: number;
  last_free_regrade_at: string | null;
  percentile: number | null;
  percentile_city: string | null;
  created_at: string;
  latitude?: number;
  longitude?: number;
  max_distance?: number;
  location_city?: string;
  location_state?: string;
  distance_km?: number;
  photos?: { id: number; photo_path: string; sort_order: number; is_primary: boolean }[];
}

interface AuthState {
  user: SafeUser | null;
  loading: boolean;
  refetch: () => Promise<void>;
  pushPermission: NotificationPermission;
  pushSubscribed: boolean;
  subscribeToPush: () => Promise<void>;
  unsubscribeFromPush: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  refetch: async () => {},
  pushPermission: "default",
  pushSubscribed: false,
  subscribeToPush: async () => {},
  unsubscribeFromPush: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SafeUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [pushPermission, setPushPermission] = useState<NotificationPermission>("default");
  const [pushSubscribed, setPushSubscribed] = useState(false);

  const refetch = async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
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
