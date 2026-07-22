// Simple in-memory rate limiter — works on both Bun and Node (Vercel).
// Tracks requests per IP using a sliding window. Not distributed, but
// sufficient for a single-server deployment.

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean up expired entries periodically to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) {
      store.delete(key);
    }
  }
}, 60_000).unref?.();

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

export function rateLimit(
  ip: string,
  action: string,
  config: RateLimitConfig,
): { allowed: boolean; retryAfterSec: number } {
  const key = `${ip}:${action}`;
  const now = Date.now();

  let entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    entry = { count: 1, resetAt: now + config.windowMs };
    store.set(key, entry);
    return { allowed: true, retryAfterSec: 0 };
  }

  entry.count++;

  if (entry.count > config.maxRequests) {
    const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, retryAfterSec };
  }

  return { allowed: true, retryAfterSec: 0 };
}

function getClientIp(req: Request): string {
  // Vercel and proxies set x-forwarded-for
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  // Fallback: use the connecting IP or a placeholder
  return req.headers.get("x-real-ip") || "127.0.0.1";
}

// Pre-configured limiters for different actions
const AUTH_LIMIT = { maxRequests: 10, windowMs: 15 * 60 * 1000 }; // 10 per 15 min
const STRICT_LIMIT = { maxRequests: 5, windowMs: 15 * 60 * 1000 }; // 5 per 15 min

export function checkAuthRateLimit(req: Request): Response | null {
  const ip = getClientIp(req);
  const result = rateLimit(ip, "auth", AUTH_LIMIT);
  if (!result.allowed) {
    return new Response(
      JSON.stringify({ error: "Too many requests. Please try again later." }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(result.retryAfterSec),
        },
      },
    );
  }
  return null;
}

export function checkStrictRateLimit(req: Request): Response | null {
  const ip = getClientIp(req);
  const result = rateLimit(ip, "strict", STRICT_LIMIT);
  if (!result.allowed) {
    return new Response(
      JSON.stringify({ error: "Too many requests. Please try again later." }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(result.retryAfterSec),
        },
      },
    );
  }
  return null;
}
