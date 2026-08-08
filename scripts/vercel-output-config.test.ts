import { describe, expect, test } from "bun:test";
import { buildOutputConfig } from "./vercel-output-config";

describe("Vercel Build Output config", () => {
  test("carries supported cron metadata into the prebuilt artifact", () => {
    expect(buildOutputConfig({ crons: [{ path: "/api/cron/retention", schedule: "0 3 * * *" }] })).toEqual({
      version: 3,
      routes: [{ handle: "filesystem" }, { src: "/(.*)", dest: "/render" }],
      crons: [{ path: "/api/cron/retention", schedule: "0 3 * * *" }],
    });
  });

  test("does not add unsupported or empty metadata", () => {
    expect(buildOutputConfig({})).toEqual({
      version: 3,
      routes: [{ handle: "filesystem" }, { src: "/(.*)", dest: "/render" }],
    });
  });
});
