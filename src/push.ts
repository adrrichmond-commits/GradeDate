import webPush from "web-push";
import { getPushSubscriptions, deletePushSubscription } from "./db";

// VAPID keys for Web Push — generated via `bunx web-push generate-vapid-keys`
export const VAPID_PUBLIC_KEY =
  "BLnxfkHAG71afJZJeHtA48LX5zElxnY93ivcGiP8303QBem2qL-2EnH5EtTX10siVSkYLkiXXmTugmLOEsd_eyo";
export const VAPID_PRIVATE_KEY = "2aBck9MRH1UUPJHmPfBfko6rKdpYYqkXRi0LMHWXjbc";

// Set VAPID details once
webPush.setVapidDetails(
  "mailto:support@gradedate.app",
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
);

export interface PushPayload {
  title: string;
  body: string;
  url: string;
}

/**
 * Send a push notification to all subscribed devices of a user.
 * Removes any invalid (410 Gone) subscriptions automatically.
 */
export async function sendPushNotification(
  userId: number,
  payload: PushPayload,
): Promise<void> {
  const subscriptions = await getPushSubscriptions(userId);

  if (subscriptions.length === 0) return;

  const pushPayload = JSON.stringify(payload);

  const results = await Promise.allSettled(
    subscriptions.map(async (sub) => {
      await webPush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        },
        pushPayload,
      );
    }),
  );

  // Clean up invalid subscriptions
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "rejected") {
      const err = result.reason;
      // 410 Gone — subscription is no longer valid
      if (err?.statusCode === 410 || err?.statusCode === 404) {
        const sub = subscriptions[i];
        await deletePushSubscription(userId, sub.endpoint).catch(() => {});
      }
    }
  }
}
