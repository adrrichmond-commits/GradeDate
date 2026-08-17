// Shared security headers for every response — single source of truth used by
// both the Vercel production entry (vercel-entry.ts) and the local dev server
// (serve.ts). Keep the CSP as tight as possible: the only external hosts are
// Stripe's recommended allowances for Stripe.js (script/connect/worker),
// Stripe Identity (frame hosts for the verification modal), and HeyCatch
// analytics (in.heycatch.ai — script load + event ingest).
export const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy":
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' https://js.stripe.com https://in.heycatch.ai; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' data: blob: https:; " +
    "connect-src 'self' https://api.stripe.com https://m.stripe.com https://m.stripe.network https://in.heycatch.ai; " +
    "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://verify.stripe.com https://cdn.verify.stripe.com https://m.stripe.network https://q.stripe.com; " +
    "worker-src 'self' blob:; " +
    "frame-ancestors 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self'",
};
