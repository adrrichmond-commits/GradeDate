/**
 * Config hygiene guards:
 *  - Real env files (.env, .env.local) must never be tracked by git.
 *  - Placeholder templates (.env.example, .env.local.example) must exist,
 *    be tracked, and contain only placeholders — never real secret values.
 *  - No tracked file may contain a secret assignment (e.g. `VAR=longvalue`)
 *    for any known credential.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const REPO_ROOT = path.join(import.meta.dir, "..");

/** Known credential env vars that must never appear with real values in tracked files. */
const SECRET_VARS = [
  "VAPID_PRIVATE_KEY",
  "VAPID_PUBLIC_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "BLOB_READ_WRITE_TOKEN",
  "RESEND_API_KEY",
  "OPENAI_API_KEY",
  "VERCEL_OIDC_TOKEN",
  "DATABASE_URL",
];

function gitLsFiles(): string[] {
  const proc = Bun.spawnSync(["git", "ls-files"], { cwd: REPO_ROOT });
  if (proc.exitCode !== 0) {
    throw new Error(`git ls-files failed (${proc.exitCode}): ${proc.stderr?.toString() ?? ""}`);
  }
  return proc.stdout.toString().split("\n").filter(Boolean);
}

function gitCheckIgnore(...paths: string[]): string[] {
  const proc = Bun.spawnSync(["git", "check-ignore", "--", ...paths], { cwd: REPO_ROOT });
  // exit 0 = all matched by an ignore rule; exit 1 = some not ignored.
  return proc.stdout.toString().split("\n").filter(Boolean);
}

describe("env file tracking hygiene", () => {
  const tracked = new Set(gitLsFiles());

  test(".env and .env.local are never tracked", () => {
    expect(tracked.has(".env")).toBe(false);
    expect(tracked.has(".env.local")).toBe(false);
    expect([...tracked].some((f) => f.startsWith(".env") && !f.endsWith(".example"))).toBe(false);
  });

  test(".env and .env.local are gitignored", () => {
    const ignored = gitCheckIgnore(".env", ".env.local");
    expect(ignored).toContain(".env");
    expect(ignored).toContain(".env.local");
  });

  test("placeholder templates exist and are tracked", () => {
    expect(tracked.has(".env.example")).toBe(true);
    expect(tracked.has(".env.local.example")).toBe(true);
  });

  test("example templates contain placeholders only, no secret values", () => {
    for (const file of [".env.example", ".env.local.example"]) {
      const content = readFileSync(path.join(REPO_ROOT, file), "utf8");
      for (const line of content.split("\n")) {
        const eq = line.indexOf("=");
        if (eq === -1) continue;
        const key = line.slice(0, eq).trim();
        if (!key || key.startsWith("#")) continue;
        const value = line.slice(eq + 1).trim();
        // Placeholders look like your_xxx_here or are commented-out lines.
        expect(
          value.startsWith("your_") || value === "" || line.trim().startsWith("#"),
          `${file}: ${key} must be a placeholder, got a ${value.length}-char value`,
        ).toBe(true);
      }
    }
  });

  test("no tracked file contains a real secret assignment", () => {
    const pattern = new RegExp(
      `(${SECRET_VARS.join("|")})\\s*=\\s*["']?(?!process\\.env\\.)[A-Za-z0-9+/_\\-.]{16,}`,
    );
    const offenders: string[] = [];
    for (const file of tracked) {
      // The templates are verified placeholder-only by the dedicated test above.
      if (file === ".env.example" || file === ".env.local.example") continue;
      let content: string;
      try {
        content = readFileSync(path.join(REPO_ROOT, file), "utf8");
      } catch {
        continue; // binary or unreadable (e.g. images) — skip
      }
      if (pattern.test(content)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
