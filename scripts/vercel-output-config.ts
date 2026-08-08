type VercelSourceConfig = {
  crons?: Array<{ path: string; schedule: string }>;
};

type BuildOutputConfig = {
  version: 3;
  routes: Array<Record<string, string>>;
  crons?: Array<{ path: string; schedule: string }>;
};

/** Translate only Build Output API v3-supported deployment metadata. */
export function buildOutputConfig(source: VercelSourceConfig): BuildOutputConfig {
  const config: BuildOutputConfig = {
    version: 3,
    routes: [{ handle: "filesystem" }, { src: "/(.*)", dest: "/render" }],
  };
  if (source.crons?.length) config.crons = source.crons;
  return config;
}

if (import.meta.main) {
  const source = await Bun.file("vercel.json").json() as VercelSourceConfig;
  await Bun.write(".vercel/output/config.json", `${JSON.stringify(buildOutputConfig(source), null, 2)}\n`);
}
