import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

// Regression for the live-QA finding (d4bc4f7f): GET /api/matches 500'd for a
// graded, verified user (free1, grade 5). Root cause: the feed's ORDER BY
// compared the boost_until column (stored as ISO-8601 TEXT) directly against
// NOW(), which throws "operator does not exist: text > timestamp with time
// zone" at plan time — for EVERY feed request. The fix casts to timestamptz.
//
// The codebase already uses source-scan tests (env-hygiene.test.ts), so this
// asserts the invariant directly on the query source.
const dbSource = readFileSync(new URL("./db.ts", import.meta.url), "utf8");

describe("matches feed boost ORDER BY", () => {
  test("boost_until is compared as timestamptz, never raw TEXT", () => {
    expect(dbSource).toContain("(boost_until)::timestamptz > NOW()");
  });

  test("the raw text-to-timestamp comparison that 500'd the feed is gone", () => {
    // Would match `boost_until > NOW()` but NOT `(boost_until)::timestamptz > NOW()`.
    expect(dbSource).not.toMatch(/boost_until\s*>\s*NOW\(\)/);
  });

  test("every ORDER BY boost_until comparison carries the cast", () => {
    const boostComparisons = dbSource
      .split("\n")
      .filter((line) => line.includes("boost_until") && line.includes("NOW()"));
    expect(boostComparisons.length).toBeGreaterThan(0);
    for (const line of boostComparisons) {
      expect(line).toContain("::timestamptz");
    }
  });
});

describe("matches feed SQL template hygiene", () => {
  // Live prod regression (2026-08-16 22:04:11): GET /api/matches → 500,
  // `NeonDbError: syntax error at or near "$1"` — PR #154 shipped the
  // boost_until explanation as `//` comment lines INSIDE the sql template
  // literal. `//` is not a valid PostgreSQL comment, so the literal text sent
  // to Postgres was a syntax error and the whole feed 500'd. The comment now
  // lives above the template as a JS comment; this test guards the invariant.
  test("no JS // comment lines inside the getUsersByGradeRange SQL template", () => {
    const funcStart = dbSource.indexOf(
      "export async function getUsersByGradeRange",
    );
    expect(funcStart).toBeGreaterThan(-1);
    const templateStart = dbSource.indexOf("const rows = await sql()", funcStart);
    const templateEnd = dbSource.indexOf("return (rows as any[])", funcStart);
    expect(templateStart).toBeGreaterThan(-1);
    expect(templateEnd).toBeGreaterThan(templateStart);
    const insideTemplate = dbSource.slice(templateStart, templateEnd);
    const commentLines = insideTemplate
      .split("\n")
      .filter((line) => line.trim().startsWith("//"));
    expect(commentLines).toEqual([]);
  });

  test("the boost_until explanation still exists as a JS comment above the query", () => {
    expect(dbSource).toContain(
      "// `//` is not a valid PostgreSQL comment and breaks the query (PR #154).",
    );
  });
});
