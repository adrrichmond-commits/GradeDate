import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

// Live prod regression (owner report 2026-08-16): EVERY tab of the admin page
// failed with "The admin service returned an error. Please try again." The
// mount probe GET /api/admin/photo-moderation (no ?status=) 500'd, so the page
// showed the generic banner and every tab failed the same way.
//
// Root cause (verified live against the prod DB): the queue queries used
//   WHERE (${status ?? null} IS NULL OR status=${status ?? null})
// When called without a status, the parameterized SQL becomes `$1 IS NULL`
// with no type context → Postgres error 42P18 `indeterminate_datatype`
// ("could not determine data type of parameter $1"). NOT a schema problem:
// all columns exist. Fix: `status = COALESCE(${status ?? null}, status)` —
// a NULL filter matches every row (status is NOT NULL in all four tables),
// a concrete status filters, and $1's type is inferred from the COALESCE.
const dbSource = readFileSync(new URL("./db.ts", import.meta.url), "utf8");

const BROKEN = /\$\{(?:status|status\?\?null)\}\s+IS\s+NULL\s+OR/i;

describe("admin queue optional-status filters (42P18 regression)", () => {
  test("no query uses the untyped `$1 IS NULL` pattern anywhere in db.ts", () => {
    const lines = dbSource.split("\n");
    const offenders = lines.filter((line) => BROKEN.test(line));
    expect(offenders).toEqual([]);
  });

  test("all four queue functions filter with status = COALESCE(status param, status)", () => {
    const queues = [
      "getReportQueue",
      "getModerationFlagQueue",
      "getPhotoModerationQueue",
      "getMessageModerationFlagQueue",
    ];
    for (const name of queues) {
      const start = dbSource.indexOf(`export async function ${name}`);
      expect(start, `${name} should exist`).toBeGreaterThan(-1);
      const end = dbSource.indexOf(";", start);
      const body = dbSource.slice(start, end);
      expect(body, `${name} should use COALESCE`).toMatch(/COALESCE\(\$\{status\s*\?\?\s*null\}, (?:status|f\.status)\)/);
      expect(body, `${name} should NOT use the broken pattern`).not.toMatch(BROKEN);
    }
  });

  test("no other optional-filter query keeps the broken shape", () => {
    // Any future queue function must not reintroduce `($x IS NULL OR col=$x)`.
    expect(dbSource).not.toMatch(/IS NULL OR [a-z_.]*status/);
  });
});
