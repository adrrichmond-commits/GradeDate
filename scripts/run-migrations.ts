import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL not set");

const sql = neon(databaseUrl);

await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_founder BOOLEAN DEFAULT false`;
await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS regrades_available INTEGER DEFAULT 0`;
await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_likes_remaining INTEGER DEFAULT 10`;

console.log("Migrations applied successfully.");
