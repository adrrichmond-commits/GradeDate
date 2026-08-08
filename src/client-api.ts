export type ApiErrorKind =
  | "network"
  | "service_unavailable"
  | "unauthorized"
  | "forbidden"
  | "rate_limited"
  | "malformed"
  | "api";

export class ApiRequestError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  readonly retryAfterSeconds: number | null;
  readonly code?: string;

  constructor(kind: ApiErrorKind, message: string, status: number | null = null, retryAfterSeconds: number | null = null, code?: string) {
    super(message);
    this.name = "ApiRequestError";
    this.kind = kind;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
    this.code = code;
  }
}

const RETRY_AFTER_MAX_SECONDS = 60 * 60;

export function parseRetryAfter(value: string | null, nowMs = Date.now()): number | null {
  if (!value) return null;
  const seconds = Number(value.trim());
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(Math.ceil(seconds), RETRY_AFTER_MAX_SECONDS);
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return null;
  return Math.min(Math.max(0, Math.ceil((timestamp - nowMs) / 1000)), RETRY_AFTER_MAX_SECONDS);
}

function messageFor(status: number, fallback: string): string {
  if (status === 401) return "Please sign in again to continue.";
  if (status === 403) return "You do not have permission to do that.";
  if (status === 429) return "Too many requests. Please try again soon.";
  if (status >= 500) return "GradeDate is having trouble right now. Please try again.";
  return fallback;
}

export async function apiFetch<T = unknown>(input: RequestInfo | URL, init?: RequestInit, fallback = "We couldn't complete that request."): Promise<T> {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch {
    throw new ApiRequestError("network", "We couldn't connect. Check your connection and try again.");
  }

  const retryAfterSeconds = response.status === 429 || response.status === 503
    ? parseRetryAfter(response.headers.get("Retry-After"))
    : null;
  const contentType = response.headers.get("content-type") || "";
  let payload: unknown = null;
  if (contentType.toLowerCase().includes("json")) {
    try { payload = await response.json(); } catch {
      throw new ApiRequestError("malformed", "The service returned an unexpected response. Please try again.", response.status, retryAfterSeconds);
    }
  } else if (!response.ok) {
    const kind: ApiErrorKind = response.status >= 500 ? "service_unavailable" : response.status === 401 ? "unauthorized" : response.status === 403 ? "forbidden" : response.status === 429 ? "rate_limited" : "malformed";
    throw new ApiRequestError(kind, messageFor(response.status, fallback), response.status, retryAfterSeconds);
  } else {
    try { return (await response.json()) as T; } catch {
      throw new ApiRequestError("malformed", "The service returned an unexpected response. Please try again.", response.status);
    }
  }

  if (!response.ok) {
    const kind: ApiErrorKind = response.status >= 500 ? "service_unavailable" : response.status === 401 ? "unauthorized" : response.status === 403 ? "forbidden" : response.status === 429 ? "rate_limited" : "api";
    const code = payload && typeof payload === "object" && "code" in payload && typeof payload.code === "string" ? payload.code : undefined;
    throw new ApiRequestError(kind, messageFor(response.status, fallback), response.status, retryAfterSeconds, code);
  }
  return payload as T;
}

export function safeApiError(error: unknown, fallback = "We couldn't complete that request."): string {
  return error instanceof ApiRequestError ? error.message : fallback;
}
