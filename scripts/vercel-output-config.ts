/** Retention cron for quarantined-photo cleanup. Declared here — not read from
 *  vercel.json — so git-triggered builds (which read both vercel.json and
 *  .vercel/output/config.json) never register the same cron twice. CLI prebuilt
 *  deploys consume only the generated config below. */
export const RETENTION_CRON = { path: "/api/cron/retention", schedule: "0 3 * * *" };

type VercelSourceConfig = {
  crons?: Array<{ path: string; schedule: string }>;
};
type BuildOutputConfig = {
  version: 3;
  routes: Array<Record<string, string>>;
  crons: Array<{ path: string; schedule: string }>;
};
/** Translate only Build Output API v3-supported deployment metadata. The retention
 *  cron is always included and is never sourced from vercel.json, which no longer
 *  declares a crons key. */
export function buildOutputConfig(_source: VercelSourceConfig = {}): BuildOutputConfig {
  return {
    version: 3,
    routes: [{ handle: "filesystem" }, { src: "/(.*)", dest: "/render" }],
    crons: [RETENTION_CRON],
  };
}
if (import.meta.main) {
  await Bun.write(".vercel/output/config.json", `${JSON.stringify(buildOutputConfig(), null, 2)}\n`);
}
