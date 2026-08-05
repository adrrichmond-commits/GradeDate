// Simple in-memory rate limiter — works on both Bun and Node (Vercel).
// Tracks requests per client key using a fixed window.

interface RateLimitEntry { count: number; resetAt: number }
const store = new Map<string, RateLimitEntry>();
setInterval(() => { const now = Date.now(); for (const [key, entry] of store) if (now > entry.resetAt) store.delete(key); }, 60_000).unref?.();

export interface RateLimitConfig { maxRequests: number; windowMs: number }
export function rateLimit(key: string, action: string, config: RateLimitConfig): { allowed: boolean; retryAfterSec: number } {
  const bucket = `${key}:${action}`;
  const now = Date.now();
  let entry = store.get(bucket);
  if (!entry || now > entry.resetAt) { entry = { count: 1, resetAt: now + config.windowMs }; store.set(bucket, entry); return { allowed: true, retryAfterSec: 0 }; }
  entry.count++;
  if (entry.count > config.maxRequests) return { allowed: false, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) };
  return { allowed: true, retryAfterSec: 0 };
}

/** Prefer trusted proxy IP, then the per-browser CSRF cookie. */
export function getClientKey(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || req.headers.get("x-real-ip")?.trim();
  if (ip && ip !== "127.0.0.1" && ip !== "::1" && ip !== "unknown") return `ip:${ip}`;
  const cookie = req.headers.get("cookie") || "";
  const csrf = cookie.match(/(?:^|;\s*)gradedate_csrf=([^;]+)/)?.[1];
  return csrf ? `csrf:${csrf}` : "anonymous:no-client-cookie";
}

function getRateLimitResponse(result: { retryAfterSec: number }): Response {
  const retryAfter = Math.max(1, result.retryAfterSec);
  return new Response(JSON.stringify({ error: `Too many requests. Please try again in ${retryAfter} seconds.`, code: "RATE_LIMITED", retry_after_sec: retryAfter }), { status: 429, headers: { "Content-Type": "application/json", "Retry-After": String(retryAfter) } });
}
const AUTH_LIMIT = { maxRequests: 10, windowMs: 15 * 60 * 1000 };
const STRICT_LIMIT = { maxRequests: 5, windowMs: 15 * 60 * 1000 };
export function checkAuthRateLimit(req: Request): Response | null { const result = rateLimit(getClientKey(req), "auth", AUTH_LIMIT); return result.allowed ? null : getRateLimitResponse(result); }
export function checkStrictRateLimit(req: Request): Response | null { const result = rateLimit(getClientKey(req), "strict", STRICT_LIMIT); return result.allowed ? null : getRateLimitResponse(result); }
export function checkRateLimit(req: Request, action: string, config: RateLimitConfig): Response | null { const result = rateLimit(getClientKey(req), action, config); return result.allowed ? null : getRateLimitResponse(result); }
