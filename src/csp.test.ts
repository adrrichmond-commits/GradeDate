import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SECURITY_HEADERS } from "./csp";

// The production CSP is the shared SECURITY_HEADERS constant from src/csp.ts,
// imported by both vercel-entry.ts (Vercel production entry) and serve.ts
// (local dev). This test pins the Stripe allowances so the age-verification
// flow (Stripe.js + Stripe Identity modal) can load, while the rest of the
// policy stays tight.
function cspDirectives(): Map<string, string> {
  const csp = SECURITY_HEADERS["Content-Security-Policy"];
  const directives = new Map<string, string>();
  for (const part of csp.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const [name, ...rest] = trimmed.split(/\s+/);
    directives.set(name, rest.join(" "));
  }
  return directives;
}

describe("Content-Security-Policy allows Stripe", () => {
  test("script-src allows js.stripe.com", () => {
    expect(cspDirectives().get("script-src")).toContain("https://js.stripe.com");
  });

  test("connect-src allows the Stripe API hosts", () => {
    const connect = cspDirectives().get("connect-src")!;
    expect(connect).toContain("https://api.stripe.com");
    expect(connect).toContain("https://m.stripe.com");
    expect(connect).toContain("https://m.stripe.network");
  });

  test("frame-src allows the Stripe Identity modal hosts", () => {
    const frame = cspDirectives().get("frame-src")!;
    for (const host of [
      "https://js.stripe.com",
      "https://hooks.stripe.com",
      "https://verify.stripe.com",
      "https://cdn.verify.stripe.com",
      "https://m.stripe.network",
      "https://q.stripe.com",
    ]) {
      expect(frame).toContain(host);
    }
  });

  test("worker-src allows blob: workers (Stripe.js)", () => {
    expect(cspDirectives().get("worker-src")).toBe("'self' blob:");
  });
});

describe("Content-Security-Policy allows HeyCatch analytics", () => {
  test("script-src allows in.heycatch.ai (runtime helper script)", () => {
    expect(cspDirectives().get("script-src")).toContain("https://in.heycatch.ai");
  });

  test("connect-src allows in.heycatch.ai (event ingest)", () => {
    expect(cspDirectives().get("connect-src")).toContain("https://in.heycatch.ai");
  });
});

describe("Content-Security-Policy stays tight", () => {
  test("hardening directives are still present", () => {
    const d = cspDirectives();
    expect(d.get("default-src")).toBe("'self'");
    expect(d.get("frame-ancestors")).toBe("'none'");
    expect(d.get("base-uri")).toBe("'self'");
    expect(d.get("form-action")).toBe("'self'");
  });

  test("unrelated directives are unchanged", () => {
    const d = cspDirectives();
    expect(d.get("style-src")).toBe(
      "'self' 'unsafe-inline' https://fonts.googleapis.com",
    );
    expect(d.get("font-src")).toBe("'self' https://fonts.gstatic.com");
    expect(d.get("img-src")).toBe("'self' data: blob: https:");
  });

  test("no unsafe-eval and no wildcard hosts", () => {
    const csp = SECURITY_HEADERS["Content-Security-Policy"];
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).not.toContain("*");
  });
});

describe("both servers use the shared headers", () => {
  const repoRoot = join(import.meta.dir, "..");

  test("vercel-entry.ts (production) imports from src/csp.ts", () => {
    const src = readFileSync(join(repoRoot, "vercel-entry.ts"), "utf8");
    expect(src).toContain('import { SECURITY_HEADERS } from "./src/csp.ts";');
    expect(src).not.toContain("const SECURITY_HEADERS");
  });

  test("serve.ts (local dev) imports from src/csp.ts", () => {
    const src = readFileSync(join(repoRoot, "serve.ts"), "utf8");
    expect(src).toContain('import { SECURITY_HEADERS } from "./src/csp.ts";');
    expect(src).not.toContain("const SECURITY_HEADERS");
  });
});
