/** A small, dependency-free HTML response for unexpected document failures. */

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

export function unexpectedErrorHtml(): string {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GradeDate — Something went wrong</title>
<style>body{margin:0;background:#030712;color:#f9fafb;font:16px/1.5 system-ui,-apple-system,sans-serif}main{box-sizing:border-box;display:grid;min-height:100vh;place-content:center;gap:1rem;max-width:42rem;margin:auto;padding:2rem}h1{margin:0;font-size:clamp(2rem,6vw,3.5rem);letter-spacing:-.04em}p{margin:0;color:#d1d5db}nav{display:flex;flex-wrap:wrap;gap:.75rem;margin-top:.75rem}a,button{border:1px solid #374151;border-radius:999px;background:#111827;color:#f9fafb;cursor:pointer;font:inherit;padding:.7rem 1.1rem;text-decoration:none}a:first-child{border-color:#f43f5e;background:#f43f5e;color:#fff}</style></head>
<body><main aria-labelledby="error-title"><p aria-hidden="true">GradeDate</p><h1 id="error-title">Something went wrong</h1><p>We couldn’t load this page. Please try again, or return home.</p><nav><form method="get" action=""><button type="submit">Try again</button></form><a href="/">Return home</a></nav></main></body></html>`;
}

export function unexpectedErrorResponse(requestId: string): Response {
  return new Response(unexpectedErrorHtml(), {
    status: 500,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "x-request-id": requestId,
    },
  });
}
