import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const dbSource = readFileSync(new URL("./db.ts", import.meta.url), "utf8");

describe("attribution claim journal persistence contract", () => {
  test("uses nonce as the database-enforced unique key", () => {
    expect(dbSource).toContain("nonce TEXT PRIMARY KEY");
    expect(dbSource).toContain("ON CONFLICT (nonce) DO NOTHING RETURNING nonce");
  });
  test("cleans expired claims before inserting and rejects duplicate inserts", () => {
    expect(dbSource).toContain("DELETE FROM attribution_claims WHERE expires_at < NOW()");
    expect(dbSource).toContain("INSERT INTO attribution_claims");
    expect(dbSource).toContain("return rows.length === 1");
  });
  test("consumption is a single atomic non-expired compare-and-set", () => {
    expect(dbSource).toContain("UPDATE attribution_claims SET consumed_at = NOW()");
    expect(dbSource).toContain("consumed_at IS NULL AND expires_at > NOW()");
    expect(dbSource).toContain("RETURNING nonce");
  });
});
