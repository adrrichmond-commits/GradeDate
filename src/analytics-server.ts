import { analytics } from "@heycatch/sdk";
import type { HeyCatchProperties, ServerTrackOptions } from "@heycatch/sdk";

// HeyCatch server analytics — initialize ONCE per server bundle at module
// scope, never inside a handler. The SDK queues nothing before init, and
// server calls send immediately once ingest answers.
//
// Guarded so `bun test` (which sets NODE_ENV=test) never initializes the SDK:
// every SDK method is a no-op before init, so unit tests can never send
// events to the live HeyCatch ingest or block on network. Real server
// environments (local serve.ts, the Vercel node function) run with
// NODE_ENV=production/development and initialize normally. The key is
// publishable and intentionally inlined — no env-var plumbing.
if (process.env.NODE_ENV !== "test") {
  analytics.init({
    projectKey: "hck_pk_zJyIGqI_UuKsTg9yN4nGyqDCWa8BevNR",
  });
}

/** Track a business event from the server (webhook or an API handler in the
 *  user's own request — pass `options.request` in that case so the event joins
 *  their live browser session). Awaited per the SDK contract, and never throws:
 *  an analytics hiccup must never fail the caller's webhook or request. Under
 *  `bun test` (NODE_ENV=test) this is a fully silent no-op — the SDK is not
 *  initialized there, so calling it directly would only print console errors. */
export async function trackServerEvent(
  event: string,
  properties: HeyCatchProperties | undefined,
  options: ServerTrackOptions,
): Promise<void> {
  if (process.env.NODE_ENV === "test") return;
  try {
    await analytics.trackEvent(event, properties, options);
  } catch {
    // The SDK catches its own send failures and resolves; this is a last-resort
    // guard so analytics can never break a payment webhook.
  }
}

export { analytics };
