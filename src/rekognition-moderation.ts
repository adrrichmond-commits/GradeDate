/**
 * AWS Rekognition photo-moderation adapter (DetectModerationLabels).
 *
 * Selected by MODERATION_PHOTO_PROVIDER=aws-rekognition. Credentials come from
 * AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY (already set in the Vercel project
 * env for the read-only IAM user `gradedate-moderation`); region from
 * AWS_REGION (default us-east-1).
 *
 * Policy mapping (owner-approved 2026-08-11):
 *  - Zero-tolerance labels (CSAM/underage — "Child Nudity" etc.; trafficking/
 *    exploitation) at >= PHOTO_MODERATION_LOCK_THRESHOLD (default 90) are
 *    classified csam_or_underage / trafficking_or_exploitation, which the
 *    existing policy path auto-hides + quarantines + locks the account.
 *  - Zero-tolerance labels below the lock threshold (but >= flag threshold)
 *    and all other unsafe classes (explicit nudity, weapons, violence, drugs,
 *    ...) are classified nsfw -> flag -> human review queue, never auto-lock.
 *  - Labels below PHOTO_MODERATION_FLAG_THRESHOLD (default 80) are ignored.
 */
import { signAwsSigV4 } from "./aws-sigv4";
import { logInfo, logWarn } from "./observability";
import type { PhotoScanClassification, PhotoScanResult } from "./photo-moderation";

export const REKOGNITION_PROVIDER = "aws-rekognition";
export const REKOGNITION_DEFAULT_FLAG_THRESHOLD = 80;
export const REKOGNITION_DEFAULT_LOCK_THRESHOLD = 90;
export const REKOGNITION_DEFAULT_REGION = "us-east-1";

const SCAN_TIMEOUT_MS = 15_000;

type RekognitionLabel = { Name?: string; Confidence?: number };

function parseThreshold(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : fallback;
}

export function rekognitionThresholds(env: Record<string, string | undefined> = process.env): { flag: number; lock: number } {
  return {
    flag: parseThreshold(env.PHOTO_MODERATION_FLAG_THRESHOLD, REKOGNITION_DEFAULT_FLAG_THRESHOLD),
    lock: parseThreshold(env.PHOTO_MODERATION_LOCK_THRESHOLD, REKOGNITION_DEFAULT_LOCK_THRESHOLD),
  };
}

/** Rekognition label names that match the zero-tolerance policy vocabulary. */
export const ZERO_TOLERANCE_LABEL_RE = /child|underage|minor|juvenile/i;
export const EXPLOITATION_LABEL_RE = /traffick|exploitation|forced labor|sexual exploit/i;

export function isZeroToleranceLabel(name: string): boolean {
  return ZERO_TOLERANCE_LABEL_RE.test(name) || EXPLOITATION_LABEL_RE.test(name);
}

export function zeroToleranceClassification(name: string): PhotoScanClassification {
  return EXPLOITATION_LABEL_RE.test(name) ? "trafficking_or_exploitation" : "csam_or_underage";
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Map raw DetectModerationLabels response labels to the policy vocabulary,
 * applying the env-tunable flag/lock confidence thresholds.
 */
export function classifyRekognitionLabels(labels: RekognitionLabel[] | undefined, env: Record<string, string | undefined> = process.env): PhotoScanResult {
  const { flag, lock } = rekognitionThresholds(env);
  const hits = (labels ?? [])
    .filter((label) => typeof label?.Name === "string" && typeof label?.Confidence === "number" && (label.Confidence as number) >= flag)
    .sort((a, b) => (b.Confidence as number) - (a.Confidence as number));
  if (hits.length === 0) return { classification: "clean", confidence: null, providerRef: null };

  const zeroTolerance = hits.filter((label) => isZeroToleranceLabel(label.Name as string));
  const lockHit = zeroTolerance.find((label) => (label.Confidence as number) >= lock);

  let classification: PhotoScanClassification = "nsfw";
  if (lockHit) {
    // Zero-tolerance detection at/above the lock threshold -> auto-lock path.
    classification = zeroToleranceClassification(lockHit.Name as string);
  } else if (zeroTolerance.length > 0) {
    // Possible zero-tolerance content below the auto-lock threshold: keep the
    // protective quarantine/review behavior (nsfw is flagged + quarantined)
    // without automating an account lock on weaker confidence.
    classification = "nsfw";
  }

  const primaryConfidence = (hits[0].Confidence as number) / 100;
  const providerRef = hits.map((label) => `${label.Name}(${Math.round(label.Confidence as number)})`).join(", ");
  return { classification, confidence: clamp01(primaryConfidence), providerRef };
}

/** True when the Rekognition provider is selected AND both AWS credentials are present. */
export function rekognitionConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return env.MODERATION_PHOTO_PROVIDER === REKOGNITION_PROVIDER && !!env.AWS_ACCESS_KEY_ID && !!env.AWS_SECRET_ACCESS_KEY;
}

/**
 * Run DetectModerationLabels against AWS Rekognition using a raw SigV4-signed
 * HTTPS call. Returns a PhotoScanResult; provider failures fail closed as
 * "error" (the caller flags them for human review).
 */
export async function scanPhotoWithRekognition(
  bytes: Uint8Array,
  _contentType: string,
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
): Promise<PhotoScanResult> {
  const region = env.AWS_REGION ?? REKOGNITION_DEFAULT_REGION;
  const { flag } = rekognitionThresholds(env);
  const accessKeyId = env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = env.AWS_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    logWarn("photo_moderation.unconfigured", { provider: REKOGNITION_PROVIDER, reason: "aws_credentials_missing" });
    return { classification: "error", confidence: null, providerRef: "aws_credentials_missing" };
  }
  const body = JSON.stringify({ Image: { Bytes: Buffer.from(bytes).toString("base64") }, MinConfidence: Math.round(flag) });
  const host = `rekognition.${region}.amazonaws.com`;
  const signedHeaders = signAwsSigV4({
    method: "POST",
    service: "rekognition",
    region,
    host,
    path: "/",
    headers: {
      "content-type": "application/x-amz-json-1.1",
      "x-amz-target": "RekognitionService.DetectModerationLabels",
    },
    body,
    accessKeyId,
    secretAccessKey,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SCAN_TIMEOUT_MS);
  try {
    const response = await fetcher(`https://${host}/`, {
      method: "POST",
      signal: controller.signal,
      headers: signedHeaders,
      body,
    });
    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      // Surface the provider's error code (e.g. AccessDeniedException) in logs
      // for triage; only a coarse status is carried back on the result.
      logWarn("photo_moderation.provider_http", { provider: REKOGNITION_PROVIDER, status: response.status, error: errorBody.slice(0, 300) });
      return { classification: "error", confidence: null, providerRef: `rekognition_http_${response.status}` };
    }
    const payload = (await response.json()) as { ModerationLabels?: RekognitionLabel[] };
    logInfo("photo_moderation.scan_complete", { provider: REKOGNITION_PROVIDER, labelCount: Array.isArray(payload.ModerationLabels) ? payload.ModerationLabels.length : 0 });
    return classifyRekognitionLabels(payload.ModerationLabels, env);
  } catch (error) {
    logWarn("photo_moderation.scan_failed", { provider: REKOGNITION_PROVIDER, error: error instanceof Error ? error.message : "unknown" });
    return { classification: "error", confidence: null, providerRef: null };
  } finally {
    clearTimeout(timer);
  }
}
