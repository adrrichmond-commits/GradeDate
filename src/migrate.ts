// Standalone migration script. Run with: bun run src/migrate.ts
// Requires DATABASE_URL to be set in the environment.

import { initTables } from "./db.ts";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Please connect a Neon database first.");
    process.exit(1);
  }

  console.log("Running migrations...");
  await initTables();
  console.log("Migrations complete. All tables created.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
