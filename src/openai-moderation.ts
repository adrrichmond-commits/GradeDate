/**
 * OpenAI Moderation message adapter.
 *
 * Selected by MODERATION_MESSAGE_PROVIDER=openai. Reuses the existing
 * OPENAI_API_KEY (already in the Vercel project env). Calls the
 * /v1/moderations endpoint (default model omni-moderation-latest, overridable
 * via OPENAI_MODERATION_MODEL).
 *
 * Category mapping (owner-approved policy 2026-08-11):
 *  - sexual/minors -> csam_or_underage: zero-tolerance -> auto-hide + lock
 *    (existing policyForMessageScan path).
 *  - harassment/hate/violence -> harassment_or_abuse: flagged -> review queue.
 *  - sexual -> inappropriate_or_explicit: flagged -> review queue.
 *  - self-harm / illicit -> other: flagged -> review queue.
 * Zero-tolerance enforcement follows the ratified safety policy (CSAM / minor
 * solicitation only) — harassment flags go to the human review queue, they do
 * not automate an account lock.
 */
import { logInfo, logWarn } from "./observability";
import type { MessageFlagType, MessageScanResult } from "./message-moderation";

export const OPENAI_PROVIDER = "openai";
export const OPENAI_MODERATION_URL = "https://api.openai.com/v1/moderations";
export const OPENAI_MODERATION_DEFAULT_MODEL = "omni-moderation-latest";

const SCAN_TIMEOUT_MS = 15_000;

/** Ordered by severity: the first flagged category determines the classification. */
const CATEGORY_FLAG_MAP: ReadonlyArray<readonly [string, MessageFlagType]> = [
  ["sexual/minors", "csam_or_underage"],
  ["harassment/threatening", "harassment_or_abuse"],
  ["hate/threatening", "harassment_or_abuse"],
  ["violence/graphic", "harassment_or_abuse"],
  ["violence", "harassment_or_abuse"],
  ["harassment", "harassment_or_abuse"],
  ["hate", "harassment_or_abuse"],
  ["sexual", "inappropriate_or_explicit"],
  ["illicit/violent", "other"],
  ["illicit", "other"],
  ["self-harm/instructions", "other"],
  ["self-harm/intent", "other"],
  ["self-harm", "other"],
];

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/** True when the OpenAI provider is selected AND OPENAI_API_KEY is present. */
export function openAiConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return env.MODERATION_MESSAGE_PROVIDER === OPENAI_PROVIDER && !!env.OPENAI_API_KEY;
}

function errorResult(): MessageScanResult {
  return { classification: "error", confidence: null, matchedRules: [], providerRef: null, source: "provider" };
}

/**
 * Map a /v1/moderations response (results[0] with `flagged`, `categories` and
 * `category_scores`) into the app's MessageScanResult vocabulary.
 */
export function classifyOpenAiModeration(payload: unknown): MessageScanResult {
  if (!payload || typeof payload !== "object") return errorResult();
  const p = payload as Record<string, unknown>;
  const results = Array.isArray(p.results) ? p.results : [];
  const result = results[0] as Record<string, unknown> | undefined;
  if (!result || typeof result !== "object") return errorResult();
  const providerRef = typeof p.id === "string" ? p.id : null;
  if (result.flagged !== true) return { classification: "clean", confidence: null, matchedRules: [], providerRef, source: "provider" };
  const categories = (result.categories ?? {}) as Record<string, unknown>;
  const scores = (result.category_scores ?? {}) as Record<string, unknown>;
  const flagged = CATEGORY_FLAG_MAP.filter(([category]) => categories[category] === true);
  if (flagged.length === 0) {
    return { classification: "other", confidence: null, matchedRules: ["openai:flagged"], providerRef, source: "provider" };
  }
  const [category, classification] = flagged[0];
  const score = typeof scores[category] === "number" ? clamp01(scores[category] as number) : null;
  const matchedRules = flagged.map(([cat]) => {
    const value = typeof scores[cat] === "number" ? `:${(scores[cat] as number).toFixed(3)}` : "";
    return `openai:${cat}${value}`;
  });
  return { classification, confidence: score, matchedRules, providerRef, source: "provider" };
}

/**
 * Scan message content with the OpenAI Moderation endpoint. Failures fail
 * closed as "error" so the caller can flag the message for human review.
 */
export async function scanMessageWithOpenAi(
  content: string,
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
): Promise<MessageScanResult> {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    logWarn("message_moderation.unconfigured", { provider: OPENAI_PROVIDER, reason: "openai_api_key_missing" });
    return errorResult();
  }
  const model = env.OPENAI_MODERATION_MODEL ?? OPENAI_MODERATION_DEFAULT_MODEL;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SCAN_TIMEOUT_MS);
  try {
    const response = await fetcher(OPENAI_MODERATION_URL, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, input: content }),
    });
    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      logWarn("message_moderation.provider_http", { provider: OPENAI_PROVIDER, status: response.status, error: errorBody.slice(0, 300) });
      return { classification: "error", confidence: null, matchedRules: [], providerRef: `openai_http_${response.status}`, source: "provider" };
    }
    const payload = await response.json();
    logInfo("message_moderation.scan_complete", { provider: OPENAI_PROVIDER, model });
    return classifyOpenAiModeration(payload);
  } catch (error) {
    logWarn("message_moderation.scan_failed", { provider: OPENAI_PROVIDER, error: error instanceof Error ? error.message : "unknown" });
    return errorResult();
  } finally {
    clearTimeout(timer);
  }
}
