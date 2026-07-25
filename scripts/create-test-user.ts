/**
 * One-off script: Create a premium test user for the GradeDate app owner.
 *
 * Usage: bun run scripts/create-test-user.ts
 *
 * Creates user:
 *   Email:    admin@gradedate.app
 *   Password: GradeDate2024!
 *   Subscription: active (premium)
 *   Location: Austin, TX (zip 78701)
 */

import { neon } from "@neondatabase/serverless";
import { webcrypto } from "node:crypto";

// ── Password hashing (PBKDF2 — identical to api-handler.ts) ────────

const encoder = new TextEncoder();

async function hashPassword(password: string): Promise<string> {
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await webcrypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derived = await webcrypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  const hashHex = Buffer.from(new Uint8Array(derived)).toString("hex");
  const saltHex = Buffer.from(salt).toString("hex");
  return `${saltHex}:${hashHex}`;
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  // Validate it looks like a PostgreSQL URL
  if (!databaseUrl.startsWith("postgres://") && !databaseUrl.startsWith("postgresql://")) {
    console.error(
      "DATABASE_URL does not appear to be a valid PostgreSQL connection string.\n" +
      `Current value starts with: ${databaseUrl.substring(0, 50)}...\n` +
      "Expected format: postgresql://user:password@host/dbname\n\n" +
      "The database connection may not be properly configured. " +
      "Use 'discover_tools' to connect a Neon database first, or ensure DATABASE_URL is set correctly."
    );
    process.exit(1);
  }

  const sql = neon(databaseUrl);

  const email = "admin@gradedate.app";
  const password = "GradeDate2024!";

  // Check if user already exists
  const existing = await sql`SELECT id, email FROM users WHERE email = ${email}`;
  if (existing.length > 0) {
    console.log(`User already exists: id=${existing[0].id}, email=${existing[0].email}`);
    console.log("Updating to premium status...");

    await sql`
      UPDATE users SET
        subscription_status = 'active',
        subscription_updated_at = NOW(),
        subscription_expires_at = NOW() + INTERVAL '10 years',
        is_founder = true,
        regrades_available = 999999,
        display_name = 'GradeDate Admin',
        bio = 'GradeDate app owner and administrator.',
        location_city = 'Austin',
        location_state = 'TX',
        latitude = 30.2672,
        longitude = -97.7431,
        max_distance = 250,
        gender = 'other',
        looking_for = 'everyone',
        daily_likes_remaining = 999999
      WHERE id = ${existing[0].id}
    `;

    // Verify
    const updated = await sql`SELECT id, email, subscription_status, is_founder, display_name FROM users WHERE id = ${existing[0].id}`;
    console.log("Updated user:", JSON.stringify(updated[0], null, 2));
  } else {
    // Create new user
    console.log("Creating new premium test user...");
    const passwordHash = await hashPassword(password);

    const rows = await sql`
      INSERT INTO users (
        email, password_hash, subscription_status, subscription_updated_at,
        subscription_expires_at, display_name, bio,
        location_city, location_state, latitude, longitude, max_distance,
        gender, looking_for, is_founder, regrades_available,
        daily_likes_remaining, date_of_birth
      ) VALUES (
        ${email}, ${passwordHash}, 'active', NOW(),
        NOW() + INTERVAL '10 years', 'GradeDate Admin',
        'GradeDate app owner and administrator.',
        'Austin', 'TX', 30.2672, -97.7431, 250,
        'other', 'everyone', true, 999999,
        999999, '1990-01-01'
      )
      RETURNING id, email, subscription_status, is_founder, display_name
    `;

    const user = rows[0];
    console.log("Created user:", JSON.stringify(user, null, 2));
  }

  console.log("\n✅ Done!");
  console.log(`   Email:    ${email}`);
  console.log(`   Password: ${password}`);
  console.log(`   Status:   active (premium with founder privileges)`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
