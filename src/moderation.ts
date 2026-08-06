export type ModerationResult = "SAFE" | "NSFW" | "UNKNOWN";

/** Strictly interpret the provider's contract. Anything else fails closed. */
export function parseModerationContent(content: unknown): ModerationResult {
  if (typeof content !== "string") return "UNKNOWN";
  const normalized = content.trim().toUpperCase();
  if (normalized === "SAFE") return "SAFE";
  if (normalized === "NSFW") return "NSFW";
  return "UNKNOWN";
}

export const MODERATION_UNAVAILABLE_CODE = "MODERATION_UNAVAILABLE";
