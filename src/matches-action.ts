export type MatchAction = "like" | "pass";

/** Returns a user-facing error for a failed like/pass response, or null on success. */
export function getMatchActionError(
  responseOk: boolean,
  data: { error?: unknown; code?: unknown } | null,
  action: MatchAction,
): string | null {
  if (responseOk) return null;
  if (data?.code === "DAILY_LIMIT") return "DAILY_LIMIT";
  if (typeof data?.error === "string" && data.error.trim()) return data.error;
  return `We couldn't ${action === "like" ? "like" : "pass on"} this profile. Please try again.`;
}

export function matchActionFailureMessage(action: MatchAction): string {
  return `We couldn't ${action === "like" ? "like" : "pass on"} this profile. Please try again.`;
}
