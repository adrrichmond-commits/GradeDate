import { logInfo, logWarn } from "./observability";
import { REKOGNITION_PROVIDER, rekognitionConfigured, scanPhotoWithRekognition } from "./rekognition-moderation";

export const PHOTO_FLAG_TYPES = ["csam_or_underage", "trafficking_or_exploitation", "impersonation", "nsfw"] as const;
export type PhotoFlagType = (typeof PHOTO_FLAG_TYPES)[number];
export type PhotoScanClassification = PhotoFlagType | "clean" | "error";
export type PhotoScanResult = { classification: PhotoScanClassification; confidence: number | null; providerRef: string | null };

const MAX_SCAN_MS = 15_000;
function number(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : null; }
function text(value: unknown): string { return typeof value === "string" ? value.toLowerCase() : ""; }

/** Normalize common provider response shapes into the small policy vocabulary. */
export function classifyPhotoScan(payload: unknown): PhotoScanResult {
  if (!payload || typeof payload !== "object") return { classification: "error", confidence: null, providerRef: null };
  const p = payload as Record<string, unknown>;
  const labels = Array.isArray(p.labels) ? p.labels : Array.isArray(p.categories) ? p.categories : [];
  const entries = labels.map((label) => typeof label === "string" ? { name: label, confidence: null } : (label as Record<string, unknown>));
  const direct = text(p.classification || p.category || p.result);
  const candidates = [direct, ...entries.map((e) => text(e.name || e.label || e.category))];
  const match = (words: string[]) => candidates.find((v) => words.some((w) => v.includes(w)));
  let classification: PhotoScanClassification = "clean";
  if (match(["csam", "child sexual", "underage", "minor", "juvenile"])) classification = "csam_or_underage";
  else if (match(["traffick", "exploitation", "forced labor", "sexual exploit"])) classification = "trafficking_or_exploitation";
  else if (match(["imperson", "fake identity", "deepfake"])) classification = "impersonation";
  else if (match(["nsfw", "sexual", "nudity", "explicit"])) classification = "nsfw";
  const confidence = number(p.confidence) ?? number(p.score) ?? number(entries.find((e) => text(e.name || e.label || e.category) === (classification === "clean" ? direct : candidates.find((v) => v.includes(classification.split("_")[0]))))?.confidence);
  return { classification, confidence, providerRef: typeof p.id === "string" ? p.id : typeof p.reference === "string" ? p.reference : null };
}

export function photoModerationConfigured(env: Record<string, string | undefined> = process.env): boolean { return !!env.MODERATION_PHOTO_PROVIDER; }

function isHttpUrl(value: string): boolean { return /^https?:\/\//i.test(value); }

/**
 * Scan photo bytes with the configured provider.
 *  - MODERATION_PHOTO_PROVIDER=aws-rekognition -> AWS Rekognition
 *    DetectModerationLabels (requires AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY;
 *    missing keys fail closed as "error" so uploads are flagged for review).
 *  - MODERATION_PHOTO_PROVIDER=http(s)://... -> legacy generic HTTP provider.
 *  - Unknown provider values fail closed as "error".
 *  - Unset provider -> disabled (returns "clean" without calling anything).
 */
export async function scanPhoto(bytes: Uint8Array, contentType: string, env: Record<string, string | undefined> = process.env, fetcher: typeof fetch = fetch): Promise<PhotoScanResult> {
  const provider = env.MODERATION_PHOTO_PROVIDER;
  if (!provider) { logInfo("photo_moderation.disabled", {}); return { classification: "clean", confidence: null, providerRef: null }; }
  if (provider === REKOGNITION_PROVIDER) {
    if (!rekognitionConfigured(env)) {
      logWarn("photo_moderation.unconfigured", { provider, reason: "aws_credentials_missing" });
      return { classification: "error", confidence: null, providerRef: "aws_credentials_missing" };
    }
    return scanPhotoWithRekognition(bytes, contentType, env, fetcher);
  }
  if (!isHttpUrl(provider)) {
    logWarn("photo_moderation.unconfigured", { provider, reason: "unknown_provider" });
    return { classification: "error", confidence: null, providerRef: "unknown_provider" };
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), MAX_SCAN_MS);
    try {
      const response = await fetcher(provider, { method: "POST", signal: controller.signal, headers: { "content-type": "application/json", ...(env.MODERATION_PHOTO_API_KEY ? { authorization: `Bearer ${env.MODERATION_PHOTO_API_KEY}` } : {}) }, body: JSON.stringify({ image_base64: Buffer.from(bytes).toString("base64"), content_type: contentType }) });
      if (!response.ok) throw new Error(`provider_http_${response.status}`);
      return classifyPhotoScan(await response.json());
    } finally { clearTimeout(timer); }
  } catch (error) { logWarn("photo_moderation.scan_failed", { error: error instanceof Error ? error.message : "unknown" }); return { classification: "error", confidence: null, providerRef: null }; }
}

export function policyForPhotoScan(result: PhotoScanResult): { quarantine: boolean; flag: boolean; lockAccount: boolean } {
  if (result.classification === "clean") return { quarantine: false, flag: false, lockAccount: false };
  return { quarantine: true, flag: true, lockAccount: result.classification === "csam_or_underage" };
}
