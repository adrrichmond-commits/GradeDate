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


// Live prod incident 2026-08-17: admin Reports tab 500'd with the generic
// "admin service returned an error". The reports table (created by an older
// schema) was missing `target_message_id`, which only existed via a
// try/catch-swallowed startup ALTER (db.ts ~407). If a cold-start initTables
// aborted before that line, the ALTER was skipped silently and the queue
// SELECT threw `column "target_message_id" does not exist` -> non-JSON 500 ->
// generic client message. Photos tab worked because it never reads that column.
//
// Fix (PR #166): target_message_id is now part of the reports CREATE TABLE
// (fresh DBs are complete), the reports ALTER block logs skipped migrations
// (db.migration_skipped) instead of swallowing them, and the tests below
// enforce that every column referenced by an admin queue SELECT is declared in
// its table's CREATE TABLE or an ADD COLUMN ALTER - so this class of silent
// schema drift cannot recur.
const QUEUE_COLUMNS: Array<{ fn: string; table: string; cols: string[] }> = [
  { fn: "getReportQueue", table: "reports", cols: ["id", "reported_id", "reason", "target_photo_id", "target_message_id", "status", "priority", "assignee_id", "created_at", "triaged_at", "actioned_at", "resolved_at"] },
  { fn: "getModerationFlagQueue", table: "moderation_flags", cols: ["id", "photo_id", "user_id", "flag_type", "confidence", "provider_ref", "status", "created_at", "reviewed_at", "reviewed_by"] },
  { fn: "getPhotoModerationQueue", table: "photo_moderation_cases", cols: ["id", "photo_id", "user_id", "status", "source", "result", "reason", "actor_user_id", "created_at", "updated_at", "reviewed_at", "retention_until", "private_content_type", "legal_hold"] },
];
function createTableBlock(src: string, table: string): string {
  const i = src.indexOf("CREATE TABLE IF NOT EXISTS " + table + " (");
  if (i < 0) return "";
  const j = src.indexOf("`;", i);
  return j > i ? src.slice(i, j) : "";
}
describe("admin queue SELECT columns are covered by schema declarations", () => {
  for (const { fn, table, cols } of QUEUE_COLUMNS) {
    test(fn + " SELECT columns are declared in CREATE TABLE or an ADD COLUMN ALTER", () => {
      const start = dbSource.indexOf("export async function " + fn);
      expect(start, fn + " should exist").toBeGreaterThan(-1);
      const create = createTableBlock(dbSource, table);
      expect(create, "CREATE TABLE block for " + table).not.toBe("");
      const altered = new Set<string>();
      for (const am of dbSource.matchAll(new RegExp("ALTER TABLE " + table + " ADD COLUMN IF NOT EXISTS (\\w+)", "g"))) altered.add(am[1]);
      for (const col of cols) {
        const inCreate = new RegExp("\\b" + col + "\\b").test(create);
        expect(inCreate || altered.has(col), fn + ": column '" + col + "' must be in CREATE TABLE " + table + " or an ADD COLUMN ALTER").toBe(true);
      }
    });
  }
  test("reports CREATE TABLE includes target_message_id (2026-08-17 regression)", () => {
    expect(createTableBlock(dbSource, "reports")).toMatch(/target_message_id INTEGER REFERENCES messages\(id\) ON DELETE SET NULL/);
  });
  test("reports migrations log skips instead of silently swallowing (db.migration_skipped)", () => {
    expect(dbSource).toMatch(/logWarn\("db\.migration_skipped"/);
    expect(dbSource).not.toMatch(/ALTER TABLE reports ADD COLUMN[^`]*`; \} catch \{\}/);
  });
});
