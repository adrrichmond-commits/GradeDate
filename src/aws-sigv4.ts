/**
 * Minimal AWS Signature Version 4 request signer (raw HTTPS path for the
 * Rekognition moderation adapter — no AWS SDK dependency).
 *
 * Implements the documented SigV4 algorithm:
 *   canonical request -> string to sign -> signing key -> signature.
 * Only the parts Rekognition needs are supported (POST with a JSON payload and
 * fixed service headers); the signer is generic enough to be unit-tested
 * against the AWS-documented example vectors.
 */
import { createHash, createHmac } from "node:crypto";

export type SigV4Options = {
  method: string;
  service: string;
  region: string;
  host: string;
  /** Path including leading slash (query strings are not supported). */
  path: string;
  /** Extra headers to sign (content-type, x-amz-target, ...). host and x-amz-date are added automatically. */
  headers?: Record<string, string>;
  body: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Injectable clock for deterministic tests. */
  now?: Date;
};

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

function uriEncode(input: string): string {
  // SigV4 requires every character to be percent-encoded (except unreserved
  // A-Z a-z 0-9 - _ . ~).
  return encodeURIComponent(input).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/**
 * Percent-encode a canonical URI path: encode each path segment but keep the
 * "/" separators literal. The canonical URI for the root path is "/" — never
 * "%2F". (Per the SigV4 spec, the canonical URI is the URI-encoded version of
 * the absolute path component: encode the path segments, preserve separators.)
 */
export function uriEncodePath(path: string): string {
  return path.split("/").map(uriEncode).join("/");
}

/**
 * Build the AWS SigV4 headers (authorization, x-amz-date) for a request.
 * Returns a header map ready to spread into a fetch() call.
 */
export function signAwsSigV4(options: SigV4Options): Record<string, string> {
  const now = options.now ?? new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);

  const extraHeaders = options.headers ?? {};
  // Normalize header names to lowercase so lookups and the canonical form agree.
  const allHeaders: Record<string, string> = {
    host: options.host,
    "x-amz-date": amzDate,
    ...Object.fromEntries(Object.entries(extraHeaders).map(([name, value]) => [name.toLowerCase(), value])),
  };
  // Canonical header names are lowercase and sorted.
  const headerNames = Object.keys(allHeaders)
    .map((name) => name.toLowerCase())
    .sort();
  const canonicalHeaders = headerNames.map((name) => `${name}:${allHeaders[name].trim()}\n`).join("");
  const signedHeaders = headerNames.join(";");

  const canonicalRequest = [
    options.method.toUpperCase(),
    uriEncodePath(options.path),
    "", // query string (not used)
    canonicalHeaders,
    signedHeaders,
    sha256Hex(options.body),
  ].join("\n");

  const scope = `${dateStamp}/${options.region}/${options.service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = hmac(`AWS4${options.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, options.region);
  const kService = hmac(kRegion, options.service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = hmac(kSigning, stringToSign).toString("hex");

  return {
    authorization: `AWS4-HMAC-SHA256 Credential=${options.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    "x-amz-date": amzDate,
    ...Object.fromEntries(Object.entries(extraHeaders).map(([name, value]) => [name.toLowerCase(), value])),
  };
}
