/**
 * Unmatch confirmation flow (pure, unit-testable).
 *
 * Unmatching permanently deletes the match row and all chat history on the
 * server (see unmatchUser in db.ts) — there is no backend restore path. The
 * honest undo path is therefore a short-lived confirmation *before* the
 * permanent request is issued: the dialog lets the user change their mind
 * (CANCEL) without any data having been touched.
 *
 * This module also owns the client's reading of the unmatch API response so
 * the UI never removes a connection that the server failed to delete.
 */

export type UnmatchPhase = "idle" | "confirming" | "pending" | "done" | "failed";

export interface UnmatchState {
  phase: UnmatchPhase;
  /** The other user's id once the user has asked to unmatch. */
  targetUserId: number | null;
  /** User-facing error shown in the dialog when the API call fails. */
  error: string | null;
}

export const initialUnmatchState: UnmatchState = {
  phase: "idle",
  targetUserId: null,
  error: null,
};

export type UnmatchAction =
  | { type: "REQUEST"; targetUserId: number }
  | { type: "CANCEL" }
  | { type: "CONFIRM" }
  | { type: "SUCCEEDED" }
  | { type: "FAILED"; error: string };

export function unmatchReducer(state: UnmatchState, action: UnmatchAction): UnmatchState {
  switch (action.type) {
    case "REQUEST":
      // Never re-open the dialog while a request is in flight.
      if (state.phase === "pending") return state;
      return { phase: "confirming", targetUserId: action.targetUserId, error: null };
    case "CANCEL":
      // The undo path: only meaningful while the dialog is open. Ignored
      // during "pending" so Escape/backdrop can't abort a request mid-flight
      // in a way that leaves the UI believing nothing happened.
      if (state.phase === "pending" || state.phase === "idle" || state.phase === "done") return state;
      return { phase: "idle", targetUserId: null, error: null };
    case "CONFIRM":
      // Proceed only from a state that was actually requested: the initial
      // confirmation or a retry after a failed attempt.
      if ((state.phase !== "confirming" && state.phase !== "failed") || state.targetUserId === null) {
        return state;
      }
      return { ...state, phase: "pending", error: null };
    case "SUCCEEDED":
      if (state.phase !== "pending") return state;
      return { ...state, phase: "done", error: null };
    case "FAILED":
      // Only surface failures from the request we actually made.
      if (state.phase !== "pending") return state;
      return { ...state, phase: "failed", error: action.error };
    default:
      return state;
  }
}

/**
 * Validate the unmatch request body the way the API endpoint does.
 * Returns a user-facing error message, or null when the request is valid.
 * Shared with the server so the endpoint and its contract stay in one place.
 */
export function validateUnmatchRequest(userId: number, targetId: unknown): string | null {
  if (typeof targetId !== "number") {
    return "matchUserId is required";
  }
  if (targetId === userId) {
    return "You cannot unmatch yourself";
  }
  return null;
}

/**
 * Derive the outcome of an unmatch API response.
 * Returns null on success, otherwise the user-facing error message.
 */
export function unmatchFailureMessage(
  responseOk: boolean,
  data: { error?: unknown } | null,
): string | null {
  if (responseOk) return null;
  if (typeof data?.error === "string" && data.error.trim()) return data.error;
  return "We couldn't unmatch right now. Please try again.";
}
