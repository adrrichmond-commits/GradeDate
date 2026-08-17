/** Retention cron for quarantined-photo cleanup. Declared here — not read from
 *  vercel.json — so git-triggered builds (which read both vercel.json and
 *  .vercel/output/config.json) never register the same cron twice. CLI prebuilt
 *  deploys consume only the generated config below. */
export const RETENTION_CRON = { path: "/api/cron/retention", schedule: "0 3 * * *" };

/** HeyCatch short links: every single-character path (/a–/z, /0–/9) 302-redirects
 *  to the homepage with the campaign attribution, so printed QR codes / short
 *  URLs can be typed or scanned without a custom domain. Route order matters:
 *  this must precede the filesystem/render routes (the app has no real
 *  single-character routes, so no exclusions are needed). */
export const SHORT_LINK_REDIRECT = {
  src: "^/(?<char>[a-z0-9])(/)?$",
  headers: { Location: "/?utm_source=heycatch&utm_campaign=$char" },
  status: 302,
};

type VercelSourceConfig = {
  crons?: Array<{ path: string; schedule: string }>;
};
/** One Build Output API v3 route: either a handled/filesystem rewrite or a
 *  redirect (3xx status + Location header), both of which Vercel routes
 *  support with `src` regexes and named-group substitution. */
type BuildOutputRoute = {
  handle?: string;
  src?: string;
  dest?: string;
  headers?: { Location: string };
  status?: number;
};
type BuildOutputConfig = {
  version: 3;
  routes: BuildOutputRoute[];
  crons: Array<{ path: string; schedule: string }>;
};
/** Translate only Build Output API v3-supported deployment metadata. The retention
 *  cron is always included and is never sourced from vercel.json, which no longer
 *  declares a crons key. */
export function buildOutputConfig(_source: VercelSourceConfig = {}): BuildOutputConfig {
  return {
    version: 3,
    routes: [SHORT_LINK_REDIRECT, { handle: "filesystem" }, { src: "/(.*)", dest: "/render" }],
    crons: [RETENTION_CRON],
  };
}
if (import.meta.main) {
  await Bun.write(".vercel/output/config.json", `${JSON.stringify(buildOutputConfig(), null, 2)}\n`);
}
