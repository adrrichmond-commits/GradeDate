import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("Vercel private review provider", () => {
  test("uses overwrite-safe writes for idempotent report retries", () => {
    const source = readFileSync(new URL("./private-review-blob-provider.ts", import.meta.url), "utf8");
    expect(source).toContain("addRandomSuffix: false, allowOverwrite: true");
  });
});
