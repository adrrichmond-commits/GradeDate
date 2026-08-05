export type LikeBackResult =
  | { kind: "matched"; matchId: number }
  | { kind: "liked" }
  | { kind: "error"; message: string };

export function resolveLikeBackResult(
  responseOk: boolean,
  data: { matched?: unknown; match_id?: unknown; error?: unknown } | null,
): LikeBackResult {
  if (!responseOk) {
    return {
      kind: "error",
      message:
        typeof data?.error === "string" && data.error.trim()
          ? data.error
          : "We couldn't like this profile. Please try again.",
    };
  }
  if (data?.matched === true && typeof data.match_id === "number") {
    return { kind: "matched", matchId: data.match_id };
  }
  return { kind: "liked" };
}
