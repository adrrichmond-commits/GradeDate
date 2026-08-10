import { describe, expect, test } from "bun:test";
import { buildOutputConfig, RETENTION_CRON } from "./vercel-output-config";

const BASE = {
  version: 3,
  routes: [{ handle: "filesystem" }, { src: "/(.*)", dest: "/render" }],
} as const;

describe("Vercel Build Output config", () => {
  test("always carries the retention cron into the prebuilt artifact", () => {
    expect(buildOutputConfig({})).toEqual({ ...BASE, crons: [RETENTION_CRON] });
  });

  test("retention cron is declared independently of vercel.json contents", () => {
    // Even if vercel.json were to carry crons again, the generated config
    // registers only the retention cron — never a copy read from the source file.
    expect(
      buildOutputConfig({ crons: [{ path: "/api/cron/retention", schedule: "0 3 * * *" }] }),
    ).toEqual({ ...BASE, crons: [RETENTION_CRON] });
    expect(
      buildOutputConfig({ crons: [{ path: "/api/cron/other", schedule: "0 4 * * *" }] }),
    ).toEqual({ ...BASE, crons: [RETENTION_CRON] });
  });

  test("does not add unsupported or empty metadata", () => {
    // Unknown source keys never leak into the Build Output config.
    const source = { crons: [], functions: { api: { memory: 1024 } } } as unknown as Parameters<
      typeof buildOutputConfig
    >[0];
    expect(buildOutputConfig(source)).toEqual({ ...BASE, crons: [RETENTION_CRON] });
  });
});
