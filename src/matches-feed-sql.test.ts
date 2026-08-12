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
