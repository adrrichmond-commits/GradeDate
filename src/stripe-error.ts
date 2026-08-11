/**
 * Stripe checkout error handling (pure, unit-testable).
 *
 * Stripe SDK errors carry user-safe messages (e.g. "No such price: 'price_…'"
 * or "Invalid API Key provided") plus structured fields. We surface the
 * message in the JSON error body so a failed checkout is diagnosable from the
 * client response, log the structured fields server-side, and reflect the
 * error's own status code when it is a 4xx/5xx (otherwise 500). The API key
 * itself is never included anywhere.
 */

export interface StripeErrorDetails {
  message: string;
  code?: string;
  type?: string;
  statusCode?: number;
  requestId?: string;
}

function asRecord(err: unknown): Record<string, unknown> {
  return err !== null && typeof err === "object" ? (err as Record<string, unknown>) : {};
}

function stringField(err: unknown, key: string): string | undefined {
  const value = asRecord(err)[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Readable Stripe error message — safe to return to the client verbatim. */
export function stripeErrorMessage(err: unknown): string {
  return stringField(err, "message") ?? "Stripe checkout failed. Please try again.";
}

/** Stripe error's own HTTP status when it is a 4xx/5xx, otherwise 500. */
export function stripeErrorStatus(err: unknown): number {
  const status = asRecord(err).statusCode;
  if (typeof status === "number" && status >= 400 && status < 600) return status;
  return 500;
}

/** Structured details for server-side logging (never includes the API key). */
export function stripeErrorDetails(err: unknown): StripeErrorDetails {
  const details: StripeErrorDetails = { message: stripeErrorMessage(err) };
  const code = stringField(err, "code");
  const type = stringField(err, "type");
  const requestId = stringField(err, "requestId");
  const statusCode = asRecord(err).statusCode;
  if (code) details.code = code;
  if (type) details.type = type;
  if (requestId) details.requestId = requestId;
  if (typeof statusCode === "number") details.statusCode = statusCode;
  return details;
}

/** Stripe failure details included in the client-facing JSON error body. */
export function stripeErrorClientFields(err: unknown): { type?: string; request_id?: string } {
  const { type, requestId } = stripeErrorDetails(err);
  const fields: { type?: string; request_id?: string } = {};
  if (type) fields.type = type;
  if (requestId) fields.request_id = requestId;
  return fields;
}
