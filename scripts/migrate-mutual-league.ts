import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL not set");

const sql = neon(databaseUrl);
await sql`ALTER TABLE matches ADD COLUMN IF NOT EXISTS mutual_league_score INTEGER DEFAULT NULL`;
console.log("mutual_league_score migration applied.");
