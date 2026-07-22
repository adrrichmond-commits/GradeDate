import webPush from "web-push";
import { getPushSubscriptions, deletePushSubscription } from "./db";

// VAPID keys for Web Push — stored in environment variables
// Generate new keys with: npx web-push generate-vapid-keys
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;

if (!VAPID_PRIVATE_KEY || !VAPID_PUBLIC_KEY) {
  throw new Error(
    "VAPID_PRIVATE_KEY and VAPID_PUBLIC_KEY environment variables are required for push notifications. " +
    "Generate new keys with: npx web-push generate-vapid-keys"
  );
}

export { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY };

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
