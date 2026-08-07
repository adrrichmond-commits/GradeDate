// Production server for the built site. The TanStack Start build emits a portable
// fetch handler (dist/server/server.js) plus static client assets (dist/client);
// this wraps them in a Bun server on port 3000 — static files first, then API
// routes, then SSR for the rest. Run `bun run build` before starting. Restart it
// with `bun run publish`.
//
// Starting a new instance supersedes the old one: it frees the port no matter
// which user owns the current server (provisioning starts it as `engine`; a team
// member's `bun run publish` runs as their own user), so publish never collides
// with an already-running server. Every sandbox user has passwordless sudo, so
// the takeover works across user boundaries.
import handler from "./dist/server/server.js";
import { handleApiRoute } from "./src/api-handler.ts";
import { initTables } from "./src/db.ts";
import { sweepExpiredAnonUploads } from "./src/anon-upload-retention.ts";
import { existsSync } from "node:fs";
import path from "node:path";
import { seoResponse, shouldNoIndex } from "./src/seo.ts";
import {
  EVENTS,
  logError,
  logInfo,
  logWarn,
  redactPath,
} from "./src/observability.ts";
import { unexpectedErrorResponse } from "./src/server-error-page.ts";

// ── Security Headers ─────────────────────────────────────────
const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy":
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' data: blob: https:; " +
    "connect-src 'self'; " +
    "frame-ancestors 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self'",
};

function applySecurityHeaders(response: Response, pathname: string, requestId: string): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(key)) headers.set(key, value);
  }
  if (shouldNoIndex(pathname)) headers.set("X-Robots-Tag", "noindex, nofollow");
  if (!headers.has("x-request-id")) headers.set("x-request-id", requestId);
  return new Response(response.body, {
    status: response.status,
    headers,
  });
}

// Pinned, NOT read from the environment. The published preview URL
// (<label>.<PUBLIC_SITE_DOMAIN>) is reverse-proxied to 0.0.0.0:3000 inside the
// sandbox, so the default site MUST bind there. Bun auto-loads .env files, so
// honouring process.env.PORT/HOST would let a stray env var or a .env in the site
// dir silently move the site off :3000 (or onto loopback) and break the public URL.
const PORT = 3000;
const HOST = "0.0.0.0";
const CLIENT_DIR = `${import.meta.dir}/dist/client`;
const UPLOADS_DIR = `${import.meta.dir}/uploads`;

// Free PORT regardless of which user owns the current listener. lsof runs under
// sudo so it can see (and the kill can signal) a process owned by another user;
// the loop waits for the socket to actually release before we bind.
const freePort =
  `for _ in $(seq 1 25); do ` +
  `pids=$(lsof -t -iTCP:${String(PORT)} -sTCP:LISTEN 2>/dev/null || true); ` +
  `if [ -z "$pids" ]; then exit 0; fi; ` +
  `kill $pids 2>/dev/null || true; sleep 0.2; ` +
  `done`;

// Take over the port, re-freeing and retrying if another publish grabbed it in the
// gap between freeing and binding (last publish wins). Bun.serve throws EADDRINUSE
// synchronously, so without this a raced publish would die while the shell already
// reported success.

// Runtime startup flags: which providers are configured (presence only — never values).
function startupFlags(): Record<string, boolean> {
  return {
    database: Boolean(process.env.DATABASE_URL),
    blob_storage: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    stripe: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET),
    email: Boolean(process.env.RESEND_API_KEY),
    push: Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
    ai_grading: Boolean(process.env.OPENAI_API_KEY),
  };
}

// Initialize database tables
if (process.env.DATABASE_URL) {
  try {
    await initTables();
    logInfo(EVENTS.SERVER_DB_INIT_OK, {});
  } catch (err) {
    logWarn(EVENTS.SERVER_DB_INIT_FAILED, { err });
  }
} else {
  logWarn(EVENTS.SERVER_DB_UNCONFIGURED, {});
}

for (let attempt = 1; ; attempt++) {
  await Bun.$`sudo sh -c ${freePort}`.quiet().nothrow();
  try {
    Bun.serve({
      port: PORT,
      hostname: HOST,
      async fetch(req) {
        const startedAt = performance.now();
        const requestId = crypto.randomUUID();
        // Propagate the request id downstream so handlers can correlate their
        // business events with this request.
        const reqWithId = new Request(req, {
          headers: new Headers([...req.headers.entries(), ["x-request-id", requestId]]),
        });
        const { pathname } = new URL(reqWithId.url);
        const coarsePath = redactPath(pathname);

        const finish = (response: Response, route: string): Response => {
          const out = applySecurityHeaders(response, pathname, requestId);
          logInfo(EVENTS.REQUEST_COMPLETE, {
            request_id: requestId,
            method: reqWithId.method,
            path: coarsePath,
            route,
            status: out.status,
            duration_ms: Math.round(performance.now() - startedAt),
          });
          return out;
        };

        try {
          const seo = seoResponse(reqWithId);
          if (seo) return finish(seo, "seo");

          // 1. Serve uploaded files
          if (pathname.startsWith("/uploads/")) {
            const filePath = path.join(UPLOADS_DIR, pathname.slice("/uploads/".length));
            if (existsSync(filePath)) {
              const file = Bun.file(filePath);
              return finish(new Response(file), "static");
            }
            return finish(new Response("Not found", { status: 404 }), "404");
          }

          // 2. API routes
          const apiResponse = await handleApiRoute(reqWithId);
          if (apiResponse) return finish(apiResponse, "api");

          // 3. Static client assets
          if (pathname !== "/") {
            const file = Bun.file(CLIENT_DIR + pathname);
            if (await file.exists()) return finish(new Response(file), "static");
          }

          // 4. SSR handler
          const ssr = await (
            handler as { fetch: (r: Request) => Response | Promise<Response> }
          ).fetch(reqWithId);
          return finish(ssr, "ssr");
        } catch (err) {
          logError(EVENTS.REQUEST_FAILED, {
            request_id: requestId,
            method: reqWithId.method,
            path: coarsePath,
            duration_ms: Math.round(performance.now() - startedAt),
            err,
          });
          // Generic error body — never leak internals to the visitor.
          return finish(unexpectedErrorResponse(requestId), "error");
        }
      },
    });
    break;
  } catch (err) {
    if (attempt >= 10) throw err;
    await Bun.sleep(200);
  }
}

logInfo(EVENTS.SERVER_STARTED, { port: PORT, host: HOST, ...startupFlags() });
console.log(`team-site serving on http://${HOST}:${String(PORT)}`);

// Anonymous upload retention: sweep expired anon_* uploads (abandoned before
// grading) at startup and every 6 hours. Only anon_* files are ever touched;
// authenticated/profile photos are recorded in the database and never matched.
const ANON_SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const runAnonSweep = () => {
  sweepExpiredAnonUploads().catch((err) => {
    logError(EVENTS.SERVER_ANON_SWEEP_FAILED, { err });
  });
};
runAnonSweep();
setInterval(runAnonSweep, ANON_SWEEP_INTERVAL_MS);
