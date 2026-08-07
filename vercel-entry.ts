// Vercel Build Output API function entry.
//
// The Build Output Node launcher invokes the default export as a classic Node
// `(req, res)` handler — NOT a web handler. TanStack Start emits a portable web
// fetch handler (dist/server/server.js), so we adapt: Node IncomingMessage → web
// Request, run the fetch handler, stream the web Response back onto ServerResponse.
// Node 22 has global Request/Response/Headers/ReadableStream.
//
// Bundled (with its deps + the SSR handler's dynamic ./assets chunks) into
// .vercel/output/functions/render.func/index.mjs by build-vercel.sh.
import type { IncomingMessage, ServerResponse } from "node:http";

import handler from "./dist/server/server.js";
import { initTables } from "./src/db.ts";
import { handleApiRoute } from "./src/api-handler.ts";
import { seoResponse, shouldNoIndex } from "./src/seo.ts";
import {
  EVENTS,
  logError,
  logInfo,
  logWarn,
  redactPath,
} from "./src/observability.ts";
import { unexpectedErrorHtml } from "./src/server-error-page.ts";

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

const fetchHandler = handler as {
  fetch: (request: Request) => Response | Promise<Response>;
};

const toWebRequest = (req: IncomingMessage, requestId: string): Request => {
  const host = req.headers.host ?? "localhost";
  const proto =
    (req.headers["x-forwarded-proto"] as string | undefined) ?? "https";
  const url = `${proto}://${host}${req.url ?? "/"}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) for (const v of value) headers.append(key, v);
    else if (value != null) headers.set(key, value);
  }
  headers.set("x-request-id", requestId);
  const method = req.method ?? "GET";
  const hasBody = method !== "GET" && method !== "HEAD";
  return new Request(url, {
    method,
    headers,
    ...(hasBody
      ? { body: req as unknown as ReadableStream, duplex: "half" }
      : {}),
  } as RequestInit);
};

// Ensure database tables exist on cold start
if (process.env.DATABASE_URL) {
  try {
    await initTables();
    logInfo(EVENTS.VERCEL_DB_INIT_OK, {});
  } catch (err) {
    logError(EVENTS.VERCEL_DB_INIT_FAILED, { err });
    // Don't crash — the site can serve static/SSR content without a DB
  }
}

async function streamResponse(
  webRes: Response,
  res: ServerResponse,
  pathname: string,
  requestId: string,
): Promise<void> {
  res.statusCode = webRes.status;
  webRes.headers.forEach((value, key) => res.setHeader(key, value));
  if (shouldNoIndex(pathname)) res.setHeader("X-Robots-Tag", "noindex, nofollow");
  // Apply security headers (won't override existing)
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    if (!webRes.headers.has(key)) res.setHeader(key, value);
  }
  res.setHeader("x-request-id", requestId);
  if (webRes.body) {
    const reader = webRes.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
  }
  res.end();
}

export default async function vercelHandler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const startedAt = performance.now();
  const requestId = crypto.randomUUID();
  let route = "ssr";
  let status = 200;
  try {
    const webReq = toWebRequest(req, requestId);
    const { pathname } = new URL(webReq.url);
    const coarsePath = redactPath(pathname);

    const seo = seoResponse(webReq);
    if (seo) {
      route = "seo";
      status = seo.status;
      return streamResponse(seo, res, pathname, requestId);
    }

    // 1. Route API requests to the API handler
    if (pathname.startsWith("/api/")) {
      const apiRes = await handleApiRoute(webReq);
      if (apiRes) {
        route = "api";
        status = apiRes.status;
        return streamResponse(apiRes, res, pathname, requestId);
      }
      // If the API handler returns null (unknown route), fall through to SSR
    }

    // 2. SSR handler for everything else
    const webRes = await fetchHandler.fetch(webReq);
    route = "ssr";
    status = webRes.status;
    return streamResponse(webRes, res, pathname, requestId);
  } catch (error) {
    // Log the detail server-side (captured by the host's function logs); never
    // return a stack trace to the public visitor of the site.
    route = "error";
    status = 500;
    logError(EVENTS.REQUEST_FAILED, {
      request_id: requestId,
      method: req.method,
      path: redactPath(req.url ?? "/"),
      duration_ms: Math.round(performance.now() - startedAt),
      err: error,
    });
    res.statusCode = 500;
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
      res.setHeader(key, value);
    }
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.setHeader("x-request-id", requestId);
    res.end(unexpectedErrorHtml());
    return;
  } finally {
    // Completions (including the error path above) get a structured log line.
    if (status !== 0) {
      logInfo(EVENTS.REQUEST_COMPLETE, {
        request_id: requestId,
        method: req.method,
        path: redactPath(req.url ?? "/"),
        route,
        status,
        duration_ms: Math.round(performance.now() - startedAt),
      });
    }
  }
}
