import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const buildScript = readFileSync(new URL("../build-vercel.sh", import.meta.url), "utf8");

describe("Vercel Blob function packaging", () => {
  test("does not externalize @vercel/blob without shipping its package", () => {
    const externalized = /--external\s+@vercel\/blob\b/.test(buildScript);
    const copied = /cp\s+-R\s+node_modules\/@vercel\/blob\b/.test(buildScript);
    expect(externalized && !copied).toBe(false);
  });
});
