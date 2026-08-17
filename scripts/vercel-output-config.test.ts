import { describe, expect, test } from "bun:test";
import { buildOutputConfig, RETENTION_CRON, SHORT_LINK_REDIRECT } from "./vercel-output-config";

const BASE = {
  version: 3,
  routes: [SHORT_LINK_REDIRECT, { handle: "filesystem" }, { src: "/(.*)", dest: "/render" }],
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

  describe("HeyCatch short-link redirect", () => {
    test("redirects single-character paths to the attribution URL with a 302", () => {
      expect(SHORT_LINK_REDIRECT.status).toBe(302);
      expect(SHORT_LINK_REDIRECT.headers?.Location).toBe(
        "/?utm_source=heycatch&utm_campaign=$char",
      );
    });

    test("sits before the filesystem/render routes so it wins", () => {
      const routes = buildOutputConfig({}).routes;
      expect(routes[0]).toEqual(SHORT_LINK_REDIRECT);
      expect(routes[1]).toEqual({ handle: "filesystem" });
      expect(routes[2]).toEqual({ src: "/(.*)", dest: "/render" });
    });

    test("matches exactly one alphanumeric character, optionally with a trailing slash", () => {
      const src = new RegExp(SHORT_LINK_REDIRECT.src);
      for (const ch of "abcdefghijklmnopqrstuvwxyz0123456789") {
        expect(src.test(`/${ch}`)).toBe(true);
        expect(src.test(`/${ch}/`)).toBe(true);
        expect(src.test(`/${ch}xyz`)).toBe(false);
      }
      expect(src.test("/")).toBe(false);
      expect(src.test("/ab")).toBe(false);
      expect(src.test("/api/health")).toBe(false);
      expect(src.test("/matches")).toBe(false);
      expect(src.test("/A")).toBe(false); // lowercase only, like the campaign char
    });

    test("captures the character into the named group used by the Location header", () => {
      const src = new RegExp(SHORT_LINK_REDIRECT.src);
      const match = "/z".match(src);
      expect(match?.groups?.char).toBe("z");
      const slashMatch = "/4/".match(src);
      expect(slashMatch?.groups?.char).toBe("4");
    });
  });
});
