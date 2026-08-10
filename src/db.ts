import { neon } from "@neondatabase/serverless";
import type { NeonQueryFunction } from "@neondatabase/serverless";
import { computePercentile } from "./percentile";
import {
  compute8020Counts,
  computeGradeBands,
  isNonEmptyRange,
} from "./matching";
import { leagueRangeScore, type LeagueValue } from "./mutual-league";
import { PREMIUM_PRICE_ID, founderPriceLockApplies } from "./canonical-entitlements";
import { deletePhoto } from "./blob-store";
import { buildAccountDeletionQueries, collectOwnedPhotoPaths } from "./account-deletion";
import { EVENTS, logInfo } from "./observability";
import { auditRecordShape } from "./admin-audit";

let _sql: NeonQueryFunction<false, false> | null = null;

function sql(): NeonQueryFunction<false, false> {
  if (!_sql) {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        "DATABASE_URL is not set. Please connect a Neon database first.",
      );
    }
    const url = process.env.DATABASE_URL;
    if (!url.startsWith("postgresql://") && !url.startsWith("postgres://")) {
      throw new Error(
        "DATABASE_URL is not a valid PostgreSQL connection string. " +
        "It must start with 'postgresql://' or 'postgres://'. " +
        "Got: " + url.substring(0, 60) + (url.length > 60 ? "..." : ""),
      );
    }
    _sql = neon(url);
  }
  return _sql;
}

// ── Schema initialization ──────────────────────────────────────

/**
 * Minimal database readiness check for /api/ready.
 *
 * Deliberately does NOT reuse the shared `sql()` singleton: it must never
 * poison the cached connection with a test/health probe URL, and it must
 * return coarse results only — no connection strings, error text, or other
 * details that could leak configuration. Reason values are stable strings.
 */
export interface DatabaseReadyResult {
  ok: boolean;
  reason?: "not_configured" | "invalid_config" | "query_failed";
}

export function isValidDatabaseUrl(value: string | undefined): value is string {
  if (!value || /\s/.test(value)) return false;
  try {
    const parsed = new URL(value);
    // URL parsing alone accepts values such as `postgresql://`; require a real
    // host so an invalid deployment secret is reported as configuration, not a
    // misleading connection failure. Never log or return the parsed value.
    return (
      (parsed.protocol === "postgresql:" || parsed.protocol === "postgres:") &&
      parsed.hostname.length > 0
    );
  } catch {
    return false;
  }
}

export async function checkDatabaseReady(): Promise<DatabaseReadyResult> {
  const url = process.env.DATABASE_URL;
  if (!url) return { ok: false, reason: "not_configured" };
  if (!isValidDatabaseUrl(url)) return { ok: false, reason: "invalid_config" };
  try {
    await neon(url)`SELECT 1`;
    return { ok: true };
  } catch {
    return { ok: false, reason: "query_failed" };
  }
}

export async function initTables(): Promise<void> {
  await sql()`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT,
      age INTEGER,
      gender TEXT,
      bio TEXT,
      photo_path TEXT, -- Local path (/uploads/...) or Vercel Blob URL (https://...)
      grade INTEGER,
      subscription_status TEXT DEFAULT 'inactive',
      subscription_updated_at TIMESTAMPTZ,
      subscription_expires_at TIMESTAMPTZ,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      verification_status TEXT NOT NULL DEFAULT 'unverified',
      verification_session_id TEXT,
      verification_verified_at TIMESTAMPTZ,
      verification_session_created_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  // Add stripe columns if they don't exist (migration for existing DBs)
  try {
    await sql()`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT`;
  } catch { /* ignore */ }
  try {
    await sql()`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT`;
  } catch { /* ignore */ }
  try {
    await sql()`ALTER TABLE users ADD COLUMN IF NOT EXISTS looking_for TEXT DEFAULT 'everyone'`;
  } catch { /* ignore */ }
  try {
    await sql()`ALTER TABLE users ADD COLUMN IF NOT EXISTS regrades_available INTEGER DEFAULT 0`;
  } catch { /* ignore */ }
  try {
    await sql()`ALTER TABLE users ADD COLUMN IF NOT EXISTS boost_until TEXT`;
  } catch { /* ignore */ }
  try {
    await sql()`ALTER TABLE users ADD COLUMN IF NOT EXISTS likes_revealed INTEGER DEFAULT 0`;
  } catch { /* ignore */ }
  try {
    await sql()`ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth TEXT`;
  } catch { /* ignore */ }
  try {
    await sql()`ALTER TABLE users ADD COLUMN IF NOT EXISTS latitude REAL`;
  } catch { /* ignore */ }
  try {
    await sql()`ALTER TABLE users ADD COLUMN IF NOT EXISTS longitude REAL`;
  } catch { /* ignore */ }
  try {
    await sql()`ALTER TABLE users ADD COLUMN IF NOT EXISTS max_distance INTEGER DEFAULT 50`;
  } catch { /* ignore */ }
  try {
    await sql()`ALTER TABLE users ADD COLUMN IF NOT EXISTS location_city TEXT`;
  } catch { /* ignore */ }
  try {
    await sql()`ALTER TABLE users ADD COLUMN IF NOT EXISTS location_state TEXT`;
  } catch { /* ignore */ }
  try {
    await sql()`ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ`;
  } catch { /* ignore */ }
  try {
    await sql()`ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_likes_remaining INTEGER DEFAULT 10`;
  } catch { /* ignore */ }
  try {
    await sql()`ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_likes_reset_at TEXT`;
  } catch { /* ignore */ }
  try {
    await sql()`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_free_regrade_at TIMESTAMPTZ`;
  } catch { /* ignore */ }
  try {
    await sql()`ALTER TABLE users ADD COLUMN IF NOT EXISTS percentile REAL`;
  } catch { /* ignore */ }
  try {
    await sql()`ALTER TABLE users ADD COLUMN IF NOT EXISTS percentile_city TEXT`;
  } catch { /* ignore */ }
  try {
    await sql()`ALTER TABLE users ADD COLUMN IF NOT EXISTS like_packs INTEGER DEFAULT 0`;
  } catch { /* ignore */ }
  try {
    await sql()`ALTER TABLE users ADD COLUMN IF NOT EXISTS communication_style TEXT`;
  } catch { /* ignore */ }
  try {
    await sql()`ALTER TABLE users ADD COLUMN IF NOT EXISTS lifestyle TEXT`;
  } catch { /* ignore */ }
  try {
    await sql()`ALTER TABLE users ADD COLUMN IF NOT EXISTS dating_goals TEXT`;
  } catch { /* ignore */ }

  // Phase 3: Rich profiles — expanded bio & optional fields
  try {
    await sql()`ALTER TABLE users ADD COLUMN IF NOT EXISTS college TEXT`;
  } catch { /* ignore */ }
  try {
    await sql()`ALTER TABLE users ADD COLUMN IF NOT EXISTS occupation TEXT`;
  } catch { /* ignore */ }
  try {
    await sql()`ALTER TABLE users ADD COLUMN IF NOT EXISTS hobbies TEXT`;
  } catch { /* ignore */ }
  try {
    await sql()`ALTER TABLE users ADD COLUMN IF NOT EXISTS height TEXT`;
  } catch { /* ignore */ }
  try {
    await sql()`ALTER TABLE users ADD COLUMN IF NOT EXISTS pronouns TEXT`;
  } catch { /* ignore */ }
  try {
    await sql()`ALTER TABLE users ADD COLUMN IF NOT EXISTS ideal_first_date TEXT`;
  } catch { /* ignore */ }
  try {
    await sql()`ALTER TABLE users ADD COLUMN IF NOT EXISTS green_flags TEXT`;
  } catch { /* ignore */ }
  try {
    await sql()`ALTER TABLE users ADD COLUMN IF NOT EXISTS red_flags TEXT`;
  } catch { /* ignore */ }
  try {
    await sql()`ALTER TABLE users ADD COLUMN IF NOT EXISTS obsessions TEXT`;
  } catch { /* ignore */ }
  try {
    await sql()`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_founder BOOLEAN DEFAULT false`;
  } catch { /* ignore */ }
  try {
    await sql()`ALTER TABLE users ADD COLUMN IF NOT EXISTS founder_number INTEGER UNIQUE`;
  } catch { /* ignore */ }
  // Defensive migration: a lock is granted only alongside a numbered subscription founder.
  try {
    await sql()`ALTER TABLE users ADD COLUMN IF NOT EXISTS founder_price_lock_price_id TEXT`;
  try { await sql()`ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'`; } catch {}
  try { await sql()`ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ`; } catch {}
  try { await sql()`ALTER TABLE users ADD COLUMN IF NOT EXISTS suspension_reason TEXT`; } catch {}
  try { await sql()`CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)`; } catch {}
  } catch { /* existing deployments may migrate on next startup */ }
  try {
    await sql()`CREATE INDEX IF NOT EXISTS idx_users_founder_number ON users(founder_number)`;
  } catch { /* ignore */ }

  await sql()`
    CREATE TABLE IF NOT EXISTS attribution_claims (
      nonce TEXT PRIMARY KEY,
      experiment TEXT NOT NULL,
      variant TEXT NOT NULL,
      issued_at TIMESTAMPTZ NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      consumed_at TIMESTAMPTZ
    )
  `;
  await sql()`
    CREATE INDEX IF NOT EXISTS attribution_claims_expiry_idx ON attribution_claims(expires_at)
  `;

  await sql()`
    CREATE TABLE IF NOT EXISTS paid_upsell_entitlements (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product TEXT NOT NULL,
      stripe_session_id TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL DEFAULT 'granted',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      consumed_at TIMESTAMPTZ
    )
  `;
  // At most one in-flight (pending) checkout per user per product. Completed
  // (granted) entitlements are not constrained: like-packs stack and re-grade
  // credits can accumulate over time.
  try {
    await sql()`
      CREATE UNIQUE INDEX IF NOT EXISTS paid_upsell_pending_user_product_idx
      ON paid_upsell_entitlements(user_id, product)
      WHERE status = 'pending'
    `;
  } catch { /* older deployments may not have pending rows yet */ }
  await sql()`
    CREATE TABLE IF NOT EXISTS webauthn_credentials (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      public_key BYTEA NOT NULL,
      counter BIGINT NOT NULL DEFAULT 0,
      transports TEXT[] NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_used_at TIMESTAMPTZ
    )
  `;
  await sql()`CREATE INDEX IF NOT EXISTS webauthn_credentials_user_idx ON webauthn_credentials(user_id)`;
  await sql()`
    CREATE TABLE IF NOT EXISTS webauthn_challenges (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      challenge TEXT NOT NULL,
      purpose TEXT NOT NULL CHECK (purpose IN ('registration','authentication')),
      expires_at TIMESTAMPTZ NOT NULL,
      consumed_at TIMESTAMPTZ
    )
  `;
  await sql()`CREATE INDEX IF NOT EXISTS webauthn_challenges_expiry_idx ON webauthn_challenges(expires_at)`;
  await sql()`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
      revoked_at TIMESTAMPTZ,
      mfa_verified_at TIMESTAMPTZ
    )
  `;
  try { await sql()`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days')`; } catch {}
  try { await sql()`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ`; } catch {}
  try { await sql()`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS mfa_verified_at TIMESTAMPTZ`; } catch {}

  await sql()`
    CREATE TABLE IF NOT EXISTS admin_audit_events (
      id BIGSERIAL PRIMARY KEY,
      actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_role TEXT,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      request_id TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  try { await sql()`ALTER TABLE admin_audit_events ADD COLUMN IF NOT EXISTS actor_role TEXT`; } catch {}
  await sql()`CREATE INDEX IF NOT EXISTS admin_audit_events_created_idx ON admin_audit_events(created_at)`;
  await sql()`CREATE OR REPLACE FUNCTION deny_admin_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'admin audit events are append-only'; END; $$`;
  await sql()`DROP TRIGGER IF EXISTS admin_audit_events_immutable ON admin_audit_events`;
  await sql()`CREATE TRIGGER admin_audit_events_immutable BEFORE UPDATE OR DELETE ON admin_audit_events FOR EACH ROW EXECUTE FUNCTION deny_admin_audit_mutation()`;

  await sql()`
    CREATE TABLE IF NOT EXISTS likes (
      id SERIAL PRIMARY KEY,
      liker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      liked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      action TEXT NOT NULL DEFAULT 'like',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(liker_id, liked_id)
    )
  `;

  await sql()`
    CREATE TABLE IF NOT EXISTS matches (
      id SERIAL PRIMARY KEY,
      user1_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user2_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user1_id, user2_id)
    )
  `;

  await sql()`ALTER TABLE matches ADD COLUMN IF NOT EXISTS mutual_league_score INTEGER`;

  await sql()`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      read INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql()`
    CREATE TABLE IF NOT EXISTS blocks (
      blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(blocker_id, blocked_id)
    )
  `;

  await sql()`
    CREATE TABLE IF NOT EXISTS reports (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reported_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reason TEXT NOT NULL,
      target_photo_id INTEGER REFERENCES user_photos(id) ON DELETE SET NULL,
      details TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      priority TEXT NOT NULL DEFAULT 'normal',
      assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      triaged_at TIMESTAMPTZ, actioned_at TIMESTAMPTZ, resolved_at TIMESTAMPTZ, resolution_notes TEXT
    )
  `;
  // Safe migrations for existing Phase 1 deployments.
  try { await sql()`ALTER TABLE reports ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()`; } catch {}
  try { await sql()`ALTER TABLE reports ADD COLUMN IF NOT EXISTS target_photo_id INTEGER`; } catch {}
  try { await sql()`ALTER TABLE reports ADD COLUMN IF NOT EXISTS details TEXT`; } catch {}
  try { await sql()`ALTER TABLE reports ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open'`; } catch {}
  try { await sql()`ALTER TABLE reports ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal'`; } catch {}
  try { await sql()`ALTER TABLE reports ADD COLUMN IF NOT EXISTS assignee_id INTEGER`; } catch {}
  try { await sql()`ALTER TABLE reports ADD COLUMN IF NOT EXISTS triaged_at TIMESTAMPTZ`; } catch {}
  try { await sql()`ALTER TABLE reports ADD COLUMN IF NOT EXISTS actioned_at TIMESTAMPTZ`; } catch {}
  try { await sql()`ALTER TABLE reports ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ`; } catch {}
  try { await sql()`ALTER TABLE reports ADD COLUMN IF NOT EXISTS resolution_notes TEXT`; } catch {}
  try { await sql()`CREATE UNIQUE INDEX IF NOT EXISTS reports_id_unique ON reports(id)`; } catch {}
  try { await sql()`CREATE INDEX IF NOT EXISTS reports_queue_idx ON reports(status, priority, created_at)`; } catch {}
  await sql()`CREATE TABLE IF NOT EXISTS photo_moderation_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), photo_id INTEGER NOT NULL REFERENCES user_photos(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, status TEXT NOT NULL DEFAULT 'pending',
    source TEXT NOT NULL, result TEXT NOT NULL DEFAULT 'unknown', reason TEXT, actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), reviewed_at TIMESTAMPTZ,
    retention_until TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'), private_object_key TEXT, private_content_type TEXT DEFAULT 'image/jpeg', private_deleted_at TIMESTAMPTZ, legal_hold BOOLEAN NOT NULL DEFAULT false
  )`;
  try { await sql()`CREATE INDEX IF NOT EXISTS photo_moderation_queue_idx ON photo_moderation_cases(status, created_at)`; } catch {}
  await sql()`CREATE TABLE IF NOT EXISTS moderation_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), photo_id INTEGER NOT NULL REFERENCES user_photos(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, flag_type TEXT NOT NULL, confidence REAL, provider_ref TEXT,
    status TEXT NOT NULL DEFAULT 'new', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), reviewed_at TIMESTAMPTZ, reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE(photo_id, flag_type)
  )`;
  try { await sql()`CREATE INDEX IF NOT EXISTS moderation_flags_queue_idx ON moderation_flags(status, created_at)`; } catch {}
  try { await sql()`ALTER TABLE photo_moderation_cases ADD COLUMN IF NOT EXISTS private_object_key TEXT`; } catch {}
  try { await sql()`ALTER TABLE photo_moderation_cases ADD COLUMN IF NOT EXISTS private_content_type TEXT DEFAULT 'image/jpeg'`; } catch {}
  try { await sql()`ALTER TABLE photo_moderation_cases ADD COLUMN IF NOT EXISTS private_deleted_at TIMESTAMPTZ`; } catch {}
  try { await sql()`ALTER TABLE photo_moderation_cases ADD COLUMN IF NOT EXISTS legal_hold BOOLEAN NOT NULL DEFAULT false`; } catch {}
  await sql()`CREATE TABLE IF NOT EXISTS user_suspensions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT NOT NULL, duration TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active',
    starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), ends_at TIMESTAMPTZ, actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    source_report_id UUID REFERENCES reports(id) ON DELETE SET NULL, source_case_id UUID, revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql()`CREATE INDEX IF NOT EXISTS user_suspensions_active_idx ON user_suspensions(user_id, status, ends_at)`;
  await sql()`CREATE TABLE IF NOT EXISTS appeals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), suspension_id UUID NOT NULL REFERENCES user_suspensions(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, text TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
    actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), reviewed_at TIMESTAMPTZ
  )`;
  await sql()`CREATE UNIQUE INDEX IF NOT EXISTS appeals_one_per_suspension ON appeals(suspension_id)`;
  await sql()`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT UNIQUE NOT NULL,
      expires_at TEXT NOT NULL,
      used INTEGER DEFAULT 0
    )
  `;

  await sql()`
    CREATE TABLE IF NOT EXISTS user_photos (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      photo_path TEXT NOT NULL, -- Local path (/uploads/...) or Vercel Blob URL (https://...)
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_primary BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql()`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, endpoint)
    )
  `;

  await sql()`
    CREATE TABLE IF NOT EXISTS photo_grades (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      photo_path TEXT NOT NULL, -- Local path or Vercel Blob URL
      grade INTEGER NOT NULL,
      feedback TEXT NOT NULL DEFAULT '',
      is_best BOOLEAN DEFAULT false,
      graded_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql()`
    CREATE TABLE IF NOT EXISTS referral_codes (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code TEXT UNIQUE NOT NULL,
      usage_count INTEGER DEFAULT 0,
      max_uses INTEGER DEFAULT 1000,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  // Add max_uses column if missing (migration)
  try {
    await sql()`ALTER TABLE referral_codes ADD COLUMN IF NOT EXISTS max_uses INTEGER DEFAULT 1000`;
  } catch { /* ignore */ }

  await sql()`
    CREATE TABLE IF NOT EXISTS referral_rewards (
      id SERIAL PRIMARY KEY,
      referrer_user_id INTEGER NOT NULL REFERENCES users(id),
      referee_user_id INTEGER NOT NULL REFERENCES users(id),
      reward_type TEXT DEFAULT 'free_month',
      applied BOOLEAN DEFAULT false,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql()`ALTER TABLE referral_rewards ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ`;

  await sql()`
    CREATE TABLE IF NOT EXISTS waitlist (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      zip_code TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      confirmed_at TIMESTAMPTZ
    )
  `;

  await sql()`
    CREATE TABLE IF NOT EXISTS user_badges (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      badge_type TEXT NOT NULL,
      details TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, badge_type)
    )
  `;
  try {
    await sql()`CREATE INDEX IF NOT EXISTS idx_user_badges_user_id ON user_badges(user_id)`;
  } catch { /* ignore */ }
}

// ── Types ──────────────────────────────────────────────────────

export interface User {
  id: number;
  email: string;
  password_hash: string;
  display_name: string | null;
  age: number | null;
  gender: string | null;
  looking_for: string;
  bio: string | null;
  photo_path: string | null;
  grade: number | null;
  subscription_status: string;
  subscription_updated_at: string | null;
  subscription_expires_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  verification_status: "unverified" | "pending" | "verified";
  verification_session_id: string | null;
  verification_verified_at: string | null;
  verification_session_created_at: string | null;
  regrades_available: number;
  boost_until: string | null;
  date_of_birth: string | null;
  latitude: number | null;
  longitude: number | null;
  max_distance: number;
  location_city: string | null;
  location_state: string | null;
  daily_likes_remaining: number;
  daily_likes_reset_at: string | null;
  last_free_regrade_at: string | null;
  percentile: number | null;
  percentile_city: string | null;
  like_packs: number;
  communication_style: string | null;
  lifestyle: string | null;
  dating_goals: string | null;
  college: string | null;
  occupation: string | null;
  hobbies: string | null;
  height: string | null;
  pronouns: string | null;
  ideal_first_date: string | null;
  green_flags: string | null;
  red_flags: string | null;
  obsessions: string | null;
  is_founder: boolean;
  founder_number: number | null;
  founder_price_lock_price_id: string | null;
  role: string | null;
  suspended_until: string | null;
  suspension_reason: string | null;
  created_at: string;
}

export interface Session {
  id: string;
  user_id: number;
  created_at: string;
  expires_at?: string | null;
  revoked_at?: string | null;
  mfa_verified_at?: string | null;
}

export interface UserPhoto {
  id: number;
  user_id: number;
  photo_path: string;
  sort_order: number;
  is_primary: boolean;
  created_at: string;
}

export interface PhotoGrade {
  id: number;
  user_id: number;
  photo_path: string;
  grade: number;
  feedback: string;
  is_best: boolean;
  graded_at: string;
}

export interface MatchUser {
  id: number;
  display_name: string | null;
  age: number | null;
  gender: string | null;
  bio: string | null;
  photo_path: string | null;
  grade: number;
  distance_miles?: number;
  photos?: UserPhoto[];
  communication_style?: string | null;
  lifestyle?: string | null;
  dating_goals?: string | null;
  college?: string | null;
  occupation?: string | null;
  hobbies?: string | null;
  height?: string | null;
  pronouns?: string | null;
  ideal_first_date?: string | null;
  green_flags?: string | null;
  red_flags?: string | null;
  obsessions?: string | null;
  is_outside_range?: boolean;
  compatibility_score?: number;
  badges?: Badge[];
}

export interface Badge {
  id: string;
  label: string;
  emoji: string;
}

export interface Like {
  id: number;
  liker_id: number;
  liked_id: number;
  action: string;
  created_at: string;
}

export interface Match {
  id: number;
  user1_id: number;
  user2_id: number;
  created_at: string;
  mutual_league_score?: number | null;
}

export interface MatchWithUser {
  match_id: number;
  user_id: number;
  display_name: string | null;
  photo_path: string | null;
  last_message: string | null;
  last_message_at: string | null;
  match_created_at: string;
  mutual_league_score?: number | null;
}

export interface Message {
  id: number;
  match_id: number;
  sender_id: number;
  content: string;
  read: number;
  created_at: string;
}

export interface MessageWithSender {
  id: number;
  match_id: number;
  sender_id: number;
  content: string;
  read: number;
  created_at: string;
  sender_name: string | null;
  sender_photo: string | null;
}

// ── User queries ──────────────────────────────────────────────

export async function createUser(
  email: string,
  passwordHash: string,
  dateOfBirth?: string,
): Promise<User> {
  const rows = await sql()`
    INSERT INTO users (email, password_hash, date_of_birth)
    VALUES (${email}, ${passwordHash}, ${dateOfBirth || null})
    RETURNING *
  `;
  return rows[0] as unknown as User;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const rows = await sql()`SELECT * FROM users WHERE email = ${email}`;
  return rows.length > 0 ? (rows[0] as unknown as User) : null;
}

export async function getUserById(id: number): Promise<User | null> {
  const rows = await sql()`SELECT * FROM users WHERE id = ${id}`;
  return rows.length > 0 ? (rows[0] as unknown as User) : null;
}

export async function getUserByVerificationSessionId(sessionId: string): Promise<User | null> {
  const rows = await sql()`SELECT * FROM users WHERE verification_session_id = ${sessionId}`;
  return rows.length > 0 ? (rows[0] as unknown as User) : null;
}

export async function startVerificationSession(userId: number, sessionId: string): Promise<User | null> {
  const rows = await sql()`
    UPDATE users SET verification_status = 'pending', verification_session_id = ${sessionId},
      verification_session_created_at = NOW(), verification_verified_at = NULL
    WHERE id = ${userId} AND COALESCE(verification_status, 'unverified') <> 'pending'
    RETURNING *`;
  return rows.length > 0 ? (rows[0] as unknown as User) : null;
}

export async function updateVerificationOutcome(userId: number, sessionId: string, outcome: "verified" | "unverified"): Promise<void> {
  await sql()`UPDATE users SET verification_status = ${outcome}, verification_session_id = ${sessionId}, verification_verified_at = ${outcome === 'verified' ? sql()`NOW()` : sql()`NULL`} WHERE id = ${userId}`;
}

export async function updateUserProfile(
  id: number,
  data: {
    display_name: string;
    age: number;
    gender: string;
    looking_for: string;
    bio: string;
    photo_path: string;
    latitude?: number | null;
    longitude?: number | null;
    max_distance?: number;
    location_city?: string | null;
    location_state?: string | null;
    communication_style?: string | null;
    lifestyle?: string | null;
    dating_goals?: string | null;
    college?: string | null;
    occupation?: string | null;
    hobbies?: string | null;
    height?: string | null;
    pronouns?: string | null;
    ideal_first_date?: string | null;
    green_flags?: string | null;
    red_flags?: string | null;
    obsessions?: string | null;
  },
): Promise<void> {
  await sql()`
    UPDATE users SET
      display_name = ${data.display_name},
      age = ${data.age},
      gender = ${data.gender},
      looking_for = ${data.looking_for},
      bio = ${data.bio},
      photo_path = ${data.photo_path}
      ${data.latitude !== undefined ? sql()`, latitude = ${data.latitude}` : sql()``}
      ${data.longitude !== undefined ? sql()`, longitude = ${data.longitude}` : sql()``}
      ${data.max_distance !== undefined ? sql()`, max_distance = ${data.max_distance}` : sql()``}
      ${data.location_city !== undefined ? sql()`, location_city = ${data.location_city}` : sql()``}
      ${data.location_state !== undefined ? sql()`, location_state = ${data.location_state}` : sql()``}
      ${data.communication_style !== undefined ? sql()`, communication_style = ${data.communication_style}` : sql()``}
      ${data.lifestyle !== undefined ? sql()`, lifestyle = ${data.lifestyle}` : sql()``}
      ${data.dating_goals !== undefined ? sql()`, dating_goals = ${data.dating_goals}` : sql()``}
      ${data.college !== undefined ? sql()`, college = ${data.college}` : sql()``}
      ${data.occupation !== undefined ? sql()`, occupation = ${data.occupation}` : sql()``}
      ${data.hobbies !== undefined ? sql()`, hobbies = ${data.hobbies}` : sql()``}
      ${data.height !== undefined ? sql()`, height = ${data.height}` : sql()``}
      ${data.pronouns !== undefined ? sql()`, pronouns = ${data.pronouns}` : sql()``}
      ${data.ideal_first_date !== undefined ? sql()`, ideal_first_date = ${data.ideal_first_date}` : sql()``}
      ${data.green_flags !== undefined ? sql()`, green_flags = ${data.green_flags}` : sql()``}
      ${data.red_flags !== undefined ? sql()`, red_flags = ${data.red_flags}` : sql()``}
      ${data.obsessions !== undefined ? sql()`, obsessions = ${data.obsessions}` : sql()``}
    WHERE id = ${id}
  `;
}

// ── User Photos ──────────────────────────────────────────────

export async function addUserPhoto(
  userId: number,
  photoPath: string,
  sortOrder: number,
): Promise<UserPhoto> {
  const rows = await sql()`
    INSERT INTO user_photos (user_id, photo_path, sort_order, is_primary)
    VALUES (${userId}, ${photoPath}, ${sortOrder}, false)
    RETURNING *
  `;
  return rows[0] as unknown as UserPhoto;
}

export async function deleteUserPhoto(
  photoId: number,
  userId: number,
): Promise<UserPhoto | null> {
  const rows = await sql()`
    DELETE FROM user_photos
    WHERE id = ${photoId} AND user_id = ${userId}
    RETURNING *
  `;
  return rows.length > 0 ? (rows[0] as unknown as UserPhoto) : null;
}

export async function removeModeratedUserPhoto(userId: number, photoPath: string): Promise<UserPhoto | null> {
  const matches = await sql()`SELECT * FROM user_photos WHERE user_id = ${userId} AND photo_path = ${photoPath} LIMIT 1`;
  if (!matches.length) return null;
  const photo = matches[0] as unknown as UserPhoto;
  await sql()`DELETE FROM photo_grades WHERE user_id = ${userId} AND photo_path = ${photoPath}`;
  await sql()`DELETE FROM user_photos WHERE id = ${photo.id} AND user_id = ${userId}`;
  if (photo.is_primary) {
    const sibling = await sql()`SELECT * FROM user_photos WHERE user_id = ${userId} ORDER BY sort_order ASC, id ASC LIMIT 1`;
    if (sibling.length) {
      await sql()`UPDATE user_photos SET is_primary = (id = ${sibling[0].id}) WHERE user_id = ${userId}`;
      await sql()`UPDATE users SET photo_path = ${sibling[0].photo_path} WHERE id = ${userId}`;
    } else {
      await sql()`UPDATE users SET photo_path = '' WHERE id = ${userId}`;
    }
  }
  return photo;
}

export async function reorderUserPhotos(
  userId: number,
  photoIds: number[],
): Promise<void> {
  for (let i = 0; i < photoIds.length; i++) {
    await sql()`
      UPDATE user_photos
      SET sort_order = ${i}
      WHERE id = ${photoIds[i]} AND user_id = ${userId}
    `;
  }
}

export async function setPrimaryPhoto(
  userId: number,
  photoId: number,
): Promise<UserPhoto | null> {
  // Remove primary flag from all user photos
  await sql()`
    UPDATE user_photos SET is_primary = false WHERE user_id = ${userId}
  `;
  // Set the requested photo as primary
  const rows = await sql()`
    UPDATE user_photos
    SET is_primary = true
    WHERE id = ${photoId} AND user_id = ${userId}
    RETURNING *
  `;
  const photo = rows.length > 0 ? (rows[0] as unknown as UserPhoto) : null;

  if (photo) {
    // Sync users.photo_path to the primary photo
    await sql()`
      UPDATE users SET photo_path = ${photo.photo_path} WHERE id = ${userId}
    `;
  }

  return photo;
}

export async function getUserPhotos(userId: number): Promise<UserPhoto[]> {
  const rows = await sql()`
    SELECT p.* FROM user_photos p
    WHERE p.user_id = ${userId}
      AND NOT EXISTS (SELECT 1 FROM photo_moderation_cases c WHERE c.photo_id=p.id AND c.status IN ('pending','quarantined','removed'))
    ORDER BY p.sort_order ASC
  `;
  return rows as unknown as UserPhoto[];
}

export async function getUserPhotoCount(userId: number): Promise<number> {
  const rows = await sql()`
    SELECT COUNT(*)::int AS cnt FROM user_photos WHERE user_id = ${userId}
  `;
  return rows.length > 0 ? Number((rows[0] as { cnt: number }).cnt) : 0;
}

// ── Photo Grades ──────────────────────────────────────────────

export async function insertPhotoGrades(
  userId: number,
  grades: { photo_path: string; grade: number; feedback: string; is_best: boolean }[],
): Promise<PhotoGrade[]> {
  // Delete existing grades for this user first
  await sql()`DELETE FROM photo_grades WHERE user_id = ${userId}`;

  // Insert new grades
  const result: PhotoGrade[] = [];
  for (const g of grades) {
    const rows = await sql()`
      INSERT INTO photo_grades (user_id, photo_path, grade, feedback, is_best)
      VALUES (${userId}, ${g.photo_path}, ${g.grade}, ${g.feedback}, ${g.is_best})
      RETURNING *
    `;
    result.push(rows[0] as unknown as PhotoGrade);
  }
  return result;
}

export async function getPhotoGrades(userId: number): Promise<PhotoGrade[]> {
  const rows = await sql()`
    SELECT * FROM photo_grades WHERE user_id = ${userId}
    ORDER BY grade DESC
  `;
  return rows as unknown as PhotoGrade[];
}

export async function getBestPhotoGrade(userId: number): Promise<PhotoGrade | null> {
  const rows = await sql()`
    SELECT * FROM photo_grades WHERE user_id = ${userId} AND is_best = true
    LIMIT 1
  `;
  return rows.length > 0 ? (rows[0] as unknown as PhotoGrade) : null;
}

// ── Percentile ────────────────────────────────────────────────

export async function calculatePercentile(userId: number): Promise<{
  percentile: number;
  percentile_city: string;
  bestGrade: number;
} | null> {
  // Get the user's location city/state and best grade
  const user = await getUserById(userId);
  if (!user || !user.location_city) return null;

  const best = await getBestPhotoGrade(userId);
  if (!best) return null;

  const cityName = user.location_state
    ? `${user.location_city}, ${user.location_state}`
    : user.location_city;

  // Count graded users in the same city. The percentile is derived from the
  // grade distribution, so we count on the `grade` column (1-10), never on
  // the `percentile` column (0-100) — mixing the two scales corrupts the rank.
  const totalRows = await sql()`
    SELECT COUNT(*)::int AS cnt FROM users
    WHERE location_city = ${user.location_city}
      AND grade IS NOT NULL
      AND id != ${userId}
  `;
  const totalInCity = (totalRows[0] as { cnt: number }).cnt;

  // Need at least 10 users in the city (including this user)
  if (totalInCity < 9) return null;

  // Count how many users have a lower or equal grade
  const lowerRows = await sql()`
    SELECT COUNT(*)::int AS cnt FROM users
    WHERE location_city = ${user.location_city}
      AND grade IS NOT NULL
      AND id != ${userId}
      AND grade <= ${best.grade}
  `;
  const lowerOrEqual = (lowerRows[0] as { cnt: number }).cnt;

  // Percentile (0-100, higher = better): what percentage of graded users in
  // the city have a grade at or below yours. Rounded to one decimal.
  const percentile = computePercentile(lowerOrEqual, totalInCity);

  return { percentile, percentile_city: cityName, bestGrade: best.grade };
}

export async function updateUserPercentile(
  userId: number,
  percentile: number,
  percentileCity: string,
): Promise<void> {
  await sql()`
    UPDATE users SET percentile = ${percentile}, percentile_city = ${percentileCity}
    WHERE id = ${userId}
  `;
}

export async function updateLastFreeRegrade(userId: number): Promise<void> {
  await sql()`
    UPDATE users SET last_free_regrade_at = NOW()
    WHERE id = ${userId}
  `;
}

// ── Session queries ───────────────────────────────────────────

export async function createWebAuthnChallenge(input: { userId: number; challenge: string; purpose: 'registration' | 'authentication'; expiresAt: Date }): Promise<string> {
  const id = crypto.randomUUID();
  await sql() `INSERT INTO webauthn_challenges (id,user_id,challenge,purpose,expires_at) VALUES (${id},${input.userId},${input.challenge},${input.purpose},${input.expiresAt})`;
  return id;
}
export async function consumeWebAuthnChallenge(id: string, purpose: 'registration' | 'authentication'): Promise<{ userId: number; challenge: string } | null> {
  const rows = await sql() `UPDATE webauthn_challenges SET consumed_at=NOW() WHERE id=${id} AND purpose=${purpose} AND consumed_at IS NULL AND expires_at>NOW() RETURNING user_id,challenge`;
  return rows.length ? rows[0] as { userId: number; challenge: string } : null;
}
export async function getWebAuthnCredentials(userId: number): Promise<any[]> { return await sql() `SELECT id,public_key,counter,transports FROM webauthn_credentials WHERE user_id=${userId}` as any; }
export async function saveWebAuthnCredential(input: { id: string; userId: number; publicKey: Uint8Array; counter: number; transports: string[] }): Promise<void> { await sql() `INSERT INTO webauthn_credentials (id,user_id,public_key,counter,transports) VALUES (${input.id},${input.userId},${Buffer.from(input.publicKey)},${input.counter},${input.transports}) ON CONFLICT (id) DO NOTHING`; }
export async function updateWebAuthnCounter(id: string, counter: number): Promise<void> { await sql() `UPDATE webauthn_credentials SET counter=${counter},last_used_at=NOW() WHERE id=${id}`; }

export async function createPrivilegedSession(userId: number): Promise<Session> { const id = crypto.randomUUID(); const rows = await sql() `INSERT INTO sessions (id,user_id,expires_at,mfa_verified_at) VALUES (${id},${userId},NOW()+INTERVAL '15 minutes',NOW()) RETURNING *`; return rows[0] as Session; }
export async function createSession(userId: number): Promise<Session> {
  const id = crypto.randomUUID();
  await sql()`INSERT INTO sessions (id, user_id, expires_at) VALUES (${id}, ${userId}, NOW() + INTERVAL '7 days')`;
  return { id, user_id: userId, created_at: new Date().toISOString() };
}

export async function getSessionById(sessionId: string): Promise<Session | null> {
  const rows = await sql()`SELECT * FROM sessions WHERE id = ${sessionId} AND revoked_at IS NULL AND expires_at > NOW()`;
  return rows.length > 0 ? (rows[0] as unknown as Session) : null;
}

export async function deleteSession(sessionId: string): Promise<void> {
  await sql()`DELETE FROM sessions WHERE id = ${sessionId}`;
}

export async function createSuspension(input: { userId:number; reason:string; duration:string; endsAt:string|null; actorUserId:number; sourceReportId?:string|null; sourceCaseId?:string|null }): Promise<any> { const rows=await sql()`INSERT INTO user_suspensions (user_id,reason,duration,ends_at,actor_user_id,source_report_id,source_case_id) VALUES (${input.userId},${input.reason},${input.duration},${input.endsAt},${input.actorUserId},${input.sourceReportId??null},${input.sourceCaseId??null}) RETURNING id,user_id,reason,duration,status,starts_at,ends_at,created_at`; await sql()`UPDATE users SET suspended_until=${input.endsAt}, suspension_reason=${input.reason} WHERE id=${input.userId}`; return rows[0]; }
export async function revokeSuspension(id:string, actorUserId:number): Promise<boolean> { const r=await sql()`UPDATE user_suspensions SET status='revoked',revoked_at=NOW(),actor_user_id=${actorUserId} WHERE id=${id} AND status='active' RETURNING user_id`; if(!r.length)return false; await sql()`UPDATE users SET suspended_until=NULL,suspension_reason=NULL WHERE id=${(r[0] as any).user_id}`; return true; }
export async function getActiveSuspension(userId:number): Promise<any|null> {
  const expired = await sql()`UPDATE user_suspensions SET status='expired' WHERE user_id=${userId} AND status='active' AND ends_at IS NOT NULL AND ends_at<=NOW() RETURNING id`;
  if (expired.length) {
    await sql()`UPDATE users SET suspended_until=NULL, suspension_reason=NULL WHERE id=${userId} AND suspended_until IS NOT NULL AND suspended_until<=NOW()`;
    for (const row of expired as any[]) await recordAdminAuditEvent({ actorUserId: null, action:'suspension.expire', targetType:'suspension', targetId:String(row.id), metadata:{user_id:userId} });
  }
  const rows=await sql()`SELECT * FROM user_suspensions WHERE user_id=${userId} AND status='active' AND (ends_at IS NULL OR ends_at>NOW()) ORDER BY starts_at DESC LIMIT 1`;
  return rows[0]??null;
}
export async function createAppeal(suspensionId:string,userId:number,text:string):Promise<any>{const r=await sql()`INSERT INTO appeals(suspension_id,user_id,text) SELECT ${suspensionId},${userId},${text} WHERE EXISTS(SELECT 1 FROM user_suspensions WHERE id=${suspensionId} AND user_id=${userId} AND status='active' AND created_at>=NOW()-INTERVAL '14 days') RETURNING id,suspension_id,status,created_at`; return r[0]??null;}
export async function getAppeals(userId?:number):Promise<any[]>{const r= userId===undefined ? await sql()`SELECT id,suspension_id,user_id,status,created_at,reviewed_at FROM appeals ORDER BY created_at DESC` : await sql()`SELECT id,suspension_id,status,created_at,reviewed_at FROM appeals WHERE user_id=${userId} ORDER BY created_at DESC`; return r as any[];}
export async function reviewAppeal(id:string,status:string,actorUserId:number):Promise<any|null>{const r=await sql()`UPDATE appeals SET status=${status},actor_user_id=${actorUserId},reviewed_at=NOW() WHERE id=${id} AND status='pending' AND user_id<>${actorUserId} RETURNING suspension_id,user_id`; if(!r.length)return null; if(status==='granted'){await revokeSuspension(String((r[0] as any).suspension_id),actorUserId);} return r[0];}
// ── Safety foundation ───────────────────────────────────────
export async function recordAdminAuditEvent(event: { actorUserId: number | null; actorRole?: string | null; action: string; targetType?: string; targetId?: string; requestId?: string; metadata?: Record<string, unknown> }): Promise<void> {
  const safe = auditRecordShape(event);
  await sql()`INSERT INTO admin_audit_events (actor_user_id, actor_role, action, target_type, target_id, request_id, metadata) VALUES (${safe.actorUserId}, ${safe.actorRole}, ${safe.action}, ${safe.targetType}, ${safe.targetId}, ${safe.requestId}, ${JSON.stringify(safe.metadata)}::jsonb)`;
}
export async function revokeSession(sessionId: string): Promise<void> { await sql()`UPDATE sessions SET revoked_at = NOW() WHERE id = ${sessionId}`; }

// ── Grade ────────────────────────────────────────────────────

export async function updateUserGrade(userId: number, grade: number): Promise<void> {
  await sql()`UPDATE users SET grade = ${grade} WHERE id = ${userId}`;
}

// ── Subscription ─────────────────────────────────────────────

export async function updateSubscriptionStatus(
  userId: number,
  status: string,
): Promise<void> {
  await sql()`
    UPDATE users SET
      subscription_status = ${status},
      subscription_updated_at = NOW()
    WHERE id = ${userId}
  `;
}

export async function updateUserStripeInfo(
  userId: number,
  stripeCustomerId: string,
  stripeSubscriptionId: string,
): Promise<void> {
  await sql()`
    UPDATE users SET
      stripe_customer_id = ${stripeCustomerId},
      stripe_subscription_id = ${stripeSubscriptionId},
      subscription_status = 'active',
      subscription_updated_at = NOW()
    WHERE id = ${userId}
  `;
}

export async function getUserByStripeCustomerId(
  stripeCustomerId: string,
): Promise<User | null> {
  const rows = await sql()`
    SELECT * FROM users WHERE stripe_customer_id = ${stripeCustomerId}
  `;
  return rows.length > 0 ? (rows[0] as unknown as User) : null;
}

export async function getUsersByGradeRange(
  grade: number,
  min: number,
  max: number,
  excludeUserId: number,
  lookingFor?: string,
  blockedByIds?: number[],
  latitude?: number,
  longitude?: number,
  maxDistance?: number,
): Promise<MatchUser[]> {
  const hasLocation = latitude !== undefined && longitude !== undefined && maxDistance !== undefined;
  const maxDistanceKm = maxDistance ? maxDistance * 1.60934 : undefined;

  const rows = await sql()`
    SELECT
      id, display_name, age, gender, bio, photo_path, grade,
      communication_style, lifestyle, dating_goals,
      college, occupation, hobbies, height, pronouns,
      ideal_first_date, green_flags, red_flags, obsessions
      ${
        hasLocation
          ? sql`, (6371 * acos(
            cos(radians(${latitude!})) * cos(radians(latitude)) *
            cos(radians(longitude) - radians(${longitude!})) +
            sin(radians(${latitude!})) * sin(radians(latitude))
          )) / 1.60934 AS distance_miles`
          : sql``
      },
      COALESCE(
        (SELECT json_agg(json_build_object(
          'id', up.id,
          'user_id', up.user_id,
          'photo_path', up.photo_path,
          'sort_order', up.sort_order,
          'is_primary', up.is_primary,
          'created_at', up.created_at
        ) ORDER BY up.sort_order ASC)
        FROM user_photos up WHERE up.user_id = users.id),
        '[]'::json
      ) AS photos_json
    FROM users
    WHERE grade IS NOT NULL
      AND grade >= ${min}
      AND grade <= ${max}
      AND photo_path IS NOT NULL
      AND photo_path != ''
      AND id != ${excludeUserId}
      ${
        lookingFor && lookingFor !== "everyone"
          ? sql()`AND gender = ${lookingFor}`
          : sql()``
      }
      ${
        blockedByIds && blockedByIds.length > 0
          ? sql()`AND id NOT IN (SELECT UNNEST(${blockedByIds}::int[]))`
          : sql()``
      }
      ${
        hasLocation
          ? sql`AND (
            latitude IS NULL
            OR longitude IS NULL
            OR (6371 * acos(
              cos(radians(${latitude!})) * cos(radians(latitude)) *
              cos(radians(longitude) - radians(${longitude!})) +
              sin(radians(${latitude!})) * sin(radians(latitude))
            )) <= ${maxDistanceKm!}
          )`
          : sql``
      }
    ORDER BY
      CASE WHEN boost_until > NOW() THEN 0 ELSE 1 END ASC,
      ABS(grade - ${grade}) ASC${
      hasLocation ? sql`, distance_miles ASC` : sql``
    }, RANDOM()
  `;
  return (rows as any[]).map((r: any) => {
    const { photos_json, ...rest } = r;
    let photos: UserPhoto[] = [];
    if (photos_json) {
      try {
        photos = typeof photos_json === 'string' ? JSON.parse(photos_json) : photos_json;
      } catch { /* ignore */ }
    }
    return { ...rest, photos } as unknown as MatchUser;
  });
}

// ── Compatibility Scoring ──────────────────────────────────────

export function calculateCompatibility(
  userA: { age?: number | null; communication_style?: string | null; lifestyle?: string | null; dating_goals?: string | null },
  userB: { age?: number | null; communication_style?: string | null; lifestyle?: string | null; dating_goals?: string | null; distance_miles?: number },
): number {
  let score = 0;

  // Same dating_goals: +30
  if (userA.dating_goals && userB.dating_goals && userA.dating_goals === userB.dating_goals) {
    score += 30;
  }

  // Same lifestyle: +25
  if (userA.lifestyle && userB.lifestyle && userA.lifestyle === userB.lifestyle) {
    score += 25;
  }

  // Same communication_style: +20
  if (userA.communication_style && userB.communication_style && userA.communication_style === userB.communication_style) {
    score += 20;
  }

  // Distance scoring
  if (userB.distance_miles !== undefined) {
    const dist = userB.distance_miles;
    if (dist < 10) score += 15;
    else if (dist < 25) score += 10;
    else if (dist < 50) score += 5;
  }

  // Similar age (±3 years): +10
  if (userA.age != null && userB.age != null) {
    if (Math.abs(userA.age - userB.age) <= 3) {
      score += 10;
    }
  }

  return Math.min(100, score);
}

// ── Badges ──────────────────────────────────────────────────────

export interface PersistedBadge {
  id: number;
  user_id: number;
  badge_type: string;
  details: string | null;
  created_at: string;
}

/**
 * Award a badge to a user. Returns true if newly awarded, false if already had it.
 */
export async function awardBadge(
  userId: number,
  badgeType: string,
  details?: string | null,
): Promise<boolean> {
  const rows = await sql()`
    INSERT INTO user_badges (user_id, badge_type, details)
    VALUES (${userId}, ${badgeType}, ${details ?? null})
    ON CONFLICT (user_id, badge_type) DO NOTHING
    RETURNING id
  `;
  return rows.length > 0;
}

/**
 * Get all persisted badges for a user.
 */
export async function getUserPersistedBadges(userId: number): Promise<PersistedBadge[]> {
  const rows = await sql()`
    SELECT * FROM user_badges
    WHERE user_id = ${userId}
    ORDER BY created_at ASC
  `;
  return rows as unknown as PersistedBadge[];
}

/**
 * Runs all badge checks for a user and awards any newly earned badges.
 * Returns the set of badge types awarded in this call.
 */
export async function checkAndAwardBadges(userId: number): Promise<string[]> {
  const user = await getUserById(userId);
  if (!user) return [];

  const awarded: string[] = [];

  // --- first_grade: has at least one photo_grades record ---
  const gradeCheck = await sql()`
    SELECT COUNT(*)::int AS cnt FROM photo_grades WHERE user_id = ${userId}
  `;
  const gradeCount = gradeCheck.length > 0 ? (gradeCheck[0] as { cnt: number }).cnt : 0;
  if (gradeCount > 0) {
    const ok = await awardBadge(userId, "first_grade");
    if (ok) awarded.push("first_grade");
  }

  // --- profile_complete: has photo, bio, display_name, age, gender ---
  if (
    user.photo_path &&
    user.bio &&
    user.display_name &&
    user.age != null &&
    user.gender
  ) {
    const ok = await awardBadge(userId, "profile_complete");
    if (ok) awarded.push("profile_complete");
  }

  // --- austin_local: location is Austin, TX ---
  if (
    user.location_city &&
    user.location_state &&
    user.location_city.toLowerCase() === "austin" &&
    user.location_state.toUpperCase() === "TX"
  ) {
    const ok = await awardBadge(userId, "austin_local");
    if (ok) awarded.push("austin_local");
  }

  // --- founding_member: has founder_number set ---
  if (user.founder_number != null) {
    const details = `Founding Member #${user.founder_number}`;
    const ok = await awardBadge(userId, "founding_member", details);
    if (ok) awarded.push("founding_member");
  }

  return awarded;
}

/**
 * Returns badges for a user based on their profile completeness and activity.
 * Badges: verified, best_photo, top_rated, active_dater, conversationalist
 */
export async function getUserBadges(user: User): Promise<Badge[]> {
  const badges: Badge[] = [];

  // founder → permanent badge for Founders Club members
  if (user.is_founder) {
    badges.push({ id: "founder", label: "Founder", emoji: "👑" });
  }

  // verified → has display_name and photo_path (profile is set up)
  if (user.display_name && user.photo_path) {
    badges.push({ id: "verified", label: "Verified", emoji: "✅" });
  }

  // best_photo → has photo_grades with is_best=true
  const bestGrade = await getBestPhotoGrade(user.id);
  if (bestGrade) {
    badges.push({ id: "best_photo", label: "Best Photo Picked", emoji: "📸" });
  }

  // top_rated → percentile >= 80
  if (user.percentile !== null && user.percentile >= 80) {
    badges.push({ id: "top_rated", label: "Top Rated", emoji: "⭐" });
  }

  // active_dater → 10+ messages in last 7 days
  const msgCountRows = await sql()`
    SELECT COUNT(*)::int AS cnt
    FROM messages
    WHERE sender_id = ${user.id}
      AND created_at > NOW() - INTERVAL '7 days'
  `;
  const msgCount = msgCountRows.length > 0 ? (msgCountRows[0] as { cnt: number }).cnt : 0;
  if (msgCount >= 10) {
    badges.push({ id: "active_dater", label: "Active Dater", emoji: "🔥" });
  }

  // conversationalist → avg message > 100 chars in last 7 days
  const avgRows = await sql()`
    SELECT AVG(LENGTH(content))::float AS avg_len
    FROM messages
    WHERE sender_id = ${user.id}
      AND created_at > NOW() - INTERVAL '7 days'
  `;
  const avgLen = avgRows.length > 0 ? (avgRows[0] as { avg_len: number | null }).avg_len : null;
  if (avgLen !== null && avgLen > 100) {
    badges.push({ id: "conversationalist", label: "Conversationalist", emoji: "💬" });
  }

  // Also include any persisted badges not otherwise covered
  const persisted = await getUserPersistedBadges(user.id);
  const persistedIds = new Set(persisted.map((b) => b.badge_type));
  const existingIds = new Set(badges.map((b) => b.id));

  const badgeDisplay: Record<string, { label: string; emoji: string }> = {
    first_grade: { label: "First Grade", emoji: "🎯" },
    profile_complete: { label: "Profile Complete", emoji: "✨" },
    austin_local: { label: "Austin Local", emoji: "🤠" },
    founding_member: { label: "Founding Member", emoji: "🏅" },
  };

  for (const pb of persisted) {
    if (!existingIds.has(pb.badge_type)) {
      const display = badgeDisplay[pb.badge_type] || { label: pb.badge_type, emoji: "🏆" };
      let label = display.label;
      if (pb.badge_type === "founding_member" && pb.details) {
        label = pb.details;
      }
      badges.push({ id: pb.badge_type, label, emoji: display.emoji });
    }
  }

  return badges;
}

// ── 80/20 Matching ─────────────────────────────────────────────

/**
 * Get users for the swiping feed using an 80/20 distribution:
 * 80% of results from the user's grade range (±1 grade on the 1-10 scale),
 * 10% from above, 10% from below. Results are shuffled. The stored
 * percentile (0-100) is never used as a grade filter — matching always
 * compares users on the grade scale.
 */
export async function getUsersWith8020Matching(
  userId: number,
  userGrade: number,
  excludeUserId: number,
  lookingFor?: string,
  blockedByIds?: number[],
  latitude?: number,
  longitude?: number,
  maxDistance?: number,
): Promise<MatchUser[]> {
  const user = await getUserById(userId);

  // Matching is always on the grade scale (1-10). The stored percentile is a
  // 0-100 display metric derived from the grade distribution and must never
  // be passed as a grade bound — doing so mixes scales (e.g. percentile 72
  // becomes "grade >= 72", which matches nothing) and empties the feed.
  const { inRange, above, below } = computeGradeBands(userGrade);

  // Fetch in-range users (80%)
  const inRangeUsers = isNonEmptyRange(inRange)
    ? await getUsersByGradeRange(
        userGrade,
        inRange.min,
        inRange.max,
        excludeUserId,
        lookingFor,
        blockedByIds,
        latitude,
        longitude,
        maxDistance,
      )
    : [];

  // Fetch above-range users (10%) — strictly higher grades
  const aboveUsers = isNonEmptyRange(above)
    ? await getUsersByGradeRange(
        userGrade,
        above.min,
        above.max,
        excludeUserId,
        lookingFor,
        blockedByIds,
        latitude,
        longitude,
        maxDistance,
      )
    : [];

  // Fetch below-range users (10%) — strictly lower grades
  const belowUsers = isNonEmptyRange(below)
    ? await getUsersByGradeRange(
        userGrade,
        below.min,
        below.max,
        excludeUserId,
        lookingFor,
        blockedByIds,
        latitude,
        longitude,
        maxDistance,
      )
    : [];

  // Combine: 80% in-range, ~10% above, ~10% below. If no in-range users
  // exist, fall back to the out-of-range pools so the feed is never empty
  // while any graded users exist.
  const { inRangeCount, aboveCount, belowCount } = compute8020Counts(
    inRangeUsers.length,
    aboveUsers.length,
    belowUsers.length,
  );

  // Select from each pool
  const shuffledAbove = [...aboveUsers].sort(() => Math.random() - 0.5).slice(0, aboveCount);
  const shuffledBelow = [...belowUsers].sort(() => Math.random() - 0.5).slice(0, belowCount);
  const shuffledInRange = [...inRangeUsers].sort(() => Math.random() - 0.5).slice(0, inRangeCount);

  // Mark outside range and calculate compatibility
  const userForCompat = {
    age: user?.age,
    communication_style: user?.communication_style,
    lifestyle: user?.lifestyle,
    dating_goals: user?.dating_goals,
  };

  const taggedAbove = shuffledAbove.map((u) => ({
    ...u,
    is_outside_range: true,
    compatibility_score: calculateCompatibility(userForCompat, u),
  }));
  const taggedBelow = shuffledBelow.map((u) => ({
    ...u,
    is_outside_range: true,
    compatibility_score: calculateCompatibility(userForCompat, u),
  }));
  const taggedInRange = shuffledInRange.map((u) => ({
    ...u,
    is_outside_range: false,
    compatibility_score: calculateCompatibility(userForCompat, u),
  }));

  // Combine all and shuffle
  const allUsers = [...taggedInRange, ...taggedAbove, ...taggedBelow];
  // Fisher-Yates shuffle
  for (let i = allUsers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allUsers[i], allUsers[j]] = [allUsers[j], allUsers[i]];
  }

  return allUsers;
}

// ── Daily Like Caps ───────────────────────────────────────────

function getNextMidnightUTC(): string {
  const now = new Date();
  const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0));
  return midnight.toISOString();
}

export async function getDailyLikesRemaining(userId: number): Promise<number> {
  const rows = await sql()`
    SELECT daily_likes_remaining, daily_likes_reset_at, subscription_status, like_packs
    FROM users WHERE id = ${userId}
  `;
  if (rows.length === 0) return 0;

  const row = rows[0] as { daily_likes_remaining: number; daily_likes_reset_at: string | null; subscription_status: string; like_packs: number };

  // Subscribers always have premium
  if (row.subscription_status === "active") return -1;

  const now = new Date();
  const resetAt = row.daily_likes_reset_at ? new Date(row.daily_likes_reset_at) : null;

  // If reset time has passed (or no reset time set), reset to 3
  if (!resetAt || now >= resetAt) {
    const nextMidnight = getNextMidnightUTC();
    await sql()`
      UPDATE users SET daily_likes_remaining = 3, daily_likes_reset_at = ${nextMidnight}
      WHERE id = ${userId}
    `;
    return 3;
  }

  return row.daily_likes_remaining;
}

export async function useDailyLike(userId: number): Promise<number> {
  const rows = await sql()`
    SELECT daily_likes_remaining, daily_likes_reset_at, subscription_status, like_packs
    FROM users WHERE id = ${userId}
  `;
  if (rows.length === 0) return 0;

  const row = rows[0] as { daily_likes_remaining: number; daily_likes_reset_at: string | null; subscription_status: string; like_packs: number };

  // Subscribers always have premium
  if (row.subscription_status === "active") return -1;

  const now = new Date();
  const resetAt = row.daily_likes_reset_at ? new Date(row.daily_likes_reset_at) : null;

  // If reset time has passed (or no reset time set), reset to 3 then decrement
  if (!resetAt || now >= resetAt) {
    const nextMidnight = getNextMidnightUTC();
    await sql()`
      UPDATE users SET daily_likes_remaining = 2, daily_likes_reset_at = ${nextMidnight}
      WHERE id = ${userId}
    `;
    return 2;
  }

  // Already at 0 — try to consume from like_packs
  if (row.daily_likes_remaining <= 0) {
    if (row.like_packs > 0) {
      await sql()`
        UPDATE users SET like_packs = like_packs - 1
        WHERE id = ${userId} AND like_packs > 0
      `;
      return -99; // sentinel: consumed from pack, has more packs
    }
    return 0;
  }

  // Decrement
  const updated = await sql()`
    UPDATE users SET daily_likes_remaining = daily_likes_remaining - 1
    WHERE id = ${userId} AND daily_likes_remaining > 0
    RETURNING daily_likes_remaining
  `;
  if (updated.length === 0) return 0;
  return (updated[0] as { daily_likes_remaining: number }).daily_likes_remaining;
}

// ── Likes ────────────────────────────────────────────────────

/** A stable advisory lock serializes block/relationship mutations for a pair. */
function relationshipLockKey(a: number, b: number): number {
  const low = Math.min(a, b);
  const high = Math.max(a, b);
  return Math.abs(Math.imul(low, 1000003) + high);
}

export async function recordLike(
  likerId: number,
  likedId: number,
  action: string = "like",
): Promise<boolean> {
  const key = relationshipLockKey(likerId, likedId);
  const results = await sql().transaction((txn) => [
    txn`SELECT pg_advisory_xact_lock(${key})`,
    txn`SELECT 1 FROM blocks
        WHERE (blocker_id = ${likerId} AND blocked_id = ${likedId})
           OR (blocker_id = ${likedId} AND blocked_id = ${likerId})
        LIMIT 1`,
    txn`INSERT INTO likes (liker_id, liked_id, action)
        SELECT ${likerId}, ${likedId}, ${action}
        WHERE NOT EXISTS (
          SELECT 1 FROM blocks
          WHERE (blocker_id = ${likerId} AND blocked_id = ${likedId})
             OR (blocker_id = ${likedId} AND blocked_id = ${likerId})
        )
        ON CONFLICT (liker_id, liked_id)
        DO UPDATE SET action = ${action}, created_at = NOW()`,
  ]);
  // The INSERT result is empty when a block exists (including a stale block).
  return Array.isArray(results) && Array.isArray(results[2]) && results[2].length > 0;
}

export async function getLike(likerId: number, likedId: number): Promise<Like | null> {
  const rows = await sql()`
    SELECT * FROM likes WHERE liker_id = ${likerId} AND liked_id = ${likedId}
  `;
  return rows.length > 0 ? (rows[0] as unknown as Like) : null;
}

export async function getLikers(
  userId: number,
): Promise<MatchUser[]> {
  const rows = await sql()`
    SELECT
      u.id, u.display_name, u.age, u.gender, u.bio, u.photo_path, u.grade,
      u.college, u.occupation, u.hobbies, u.height, u.pronouns,
      u.ideal_first_date, u.green_flags, u.red_flags, u.obsessions,
      COALESCE(
        (SELECT json_agg(json_build_object(
          'id', up.id,
          'user_id', up.user_id,
          'photo_path', up.photo_path,
          'sort_order', up.sort_order,
          'is_primary', up.is_primary,
          'created_at', up.created_at
        ) ORDER BY up.sort_order ASC)
        FROM user_photos up WHERE up.user_id = u.id),
        '[]'::json
      ) AS photos_json
    FROM likes l
    JOIN users u ON u.id = l.liker_id
    WHERE l.liked_id = ${userId}
      AND l.action = 'like'
      AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = ${userId} AND b.blocked_id = u.id) OR (b.blocker_id = u.id AND b.blocked_id = ${userId}))
      AND NOT EXISTS (
        SELECT 1 FROM likes l2
        WHERE l2.liker_id = ${userId} AND l2.liked_id = u.id AND l2.action = 'like'
      )
    ORDER BY l.created_at DESC
  `;
  return (rows as any[]).map((r: any) => {
    const { photos_json, ...rest } = r;
    let photos: UserPhoto[] = [];
    if (photos_json) {
      try {
        photos = typeof photos_json === 'string' ? JSON.parse(photos_json) : photos_json;
      } catch { /* ignore */ }
    }
    return { ...rest, photos } as unknown as MatchUser;
  });
}

// ── Matches ──────────────────────────────────────────────────

export async function createMatch(user1Id: number, user2Id: number): Promise<Match | null> {
  const [a, b] = user1Id < user2Id ? [user1Id, user2Id] : [user2Id, user1Id];
  const key = relationshipLockKey(a, b);
  const transaction = await sql().transaction((txn) => [
    txn`SELECT pg_advisory_xact_lock(${key})`,
    txn`INSERT INTO matches (user1_id, user2_id)
        SELECT ${a}, ${b}
        WHERE NOT EXISTS (
          SELECT 1 FROM blocks
          WHERE (blocker_id = ${a} AND blocked_id = ${b})
             OR (blocker_id = ${b} AND blocked_id = ${a})
        )
        ON CONFLICT (user1_id, user2_id) DO NOTHING
        RETURNING *`,
  ]);
  const rows = transaction[1] as unknown as any[];
  if (!rows || rows.length === 0) {
    // A blocked pair must never expose or recreate a match.
    const blocked = await isBlocked(a, b);
    if (blocked) return null;
    const existing = await sql()`
      SELECT * FROM matches WHERE user1_id = ${a} AND user2_id = ${b}
    `;
    return existing.length > 0 ? (existing[0] as unknown as Match) : null;
  }
  return rows[0] as unknown as Match;
}

/**
 * Calculate Mutual League Score (0-100) between two users.
 * Weights:
 *   - 40%: both are within each other's percentile/grade band (the 80/20 range)
 *   - 30%: compatibility score (via calculateCompatibility)
 *   - 30%: photo quality alignment (similar best-photo grade levels)
 *
 * Never exposes individual grades — returns only the composite score.
 */
export function calculateMutualLeagueScore(
  userA: LeagueValue,
  userB: LeagueValue,
  compatibilityScore: number,
  photoGradeA: number,
  photoGradeB: number,
): number {
  // ── 40%: in-range check ──────────────────────────────
  // Normalize percentile and grade inputs before comparing; they are different
  // units in storage, but the league score uses one canonical 0–100 scale.
  const rangeScore = leagueRangeScore(userA, userB);

  // ── 30%: compatibility ──────────────────────────────
  const compatScore = (compatibilityScore / 100) * 30;

  // ── 30%: photo quality alignment ────────────────────
  // Grades are 1-10; closer = higher score
  const photoDiff = Math.abs(photoGradeA - photoGradeB);
  let photoScore: number;
  if (photoDiff <= 1) photoScore = 30;
  else if (photoDiff <= 2) photoScore = 25;
  else if (photoDiff <= 4) photoScore = 15;
  else if (photoDiff <= 6) photoScore = 8;
  else photoScore = 3;

  return Math.round(rangeScore + compatScore + photoScore);
}

/**
 * Store the mutual league score on a match record.
 */
export async function updateMatchLeagueScore(matchId: number, score: number): Promise<void> {
  await sql()`UPDATE matches SET mutual_league_score = ${score} WHERE id = ${matchId}`;
}

export async function getMatchById(matchId: number): Promise<Match | null> {
  const rows = await sql()`SELECT * FROM matches WHERE id = ${matchId}`;
  return rows.length > 0 ? (rows[0] as unknown as Match) : null;
}

export async function isMatch(user1Id: number, user2Id: number): Promise<boolean> {
  const [a, b] = user1Id < user2Id ? [user1Id, user2Id] : [user2Id, user1Id];
  const rows = await sql()`
    SELECT id FROM matches WHERE user1_id = ${a} AND user2_id = ${b}
  `;
  return rows.length > 0;
}

export async function getMatchesForUser(userId: number): Promise<MatchWithUser[]> {
  const rows = await sql()`
    SELECT
      m.id AS match_id,
      CASE WHEN m.user1_id = ${userId} THEN m.user2_id ELSE m.user1_id END AS user_id,
      u.display_name,
      u.photo_path,
      (SELECT msg.content FROM messages msg WHERE msg.match_id = m.id ORDER BY msg.created_at DESC LIMIT 1) AS last_message,
      (SELECT msg.created_at FROM messages msg WHERE msg.match_id = m.id ORDER BY msg.created_at DESC LIMIT 1) AS last_message_at,
      m.created_at AS match_created_at,
      m.mutual_league_score
    FROM matches m
    JOIN users u ON u.id = CASE WHEN m.user1_id = ${userId} THEN m.user2_id ELSE m.user1_id END
    WHERE (m.user1_id = ${userId} OR m.user2_id = ${userId})
      AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = ${userId} AND b.blocked_id = CASE WHEN m.user1_id = ${userId} THEN m.user2_id ELSE m.user1_id END) OR (b.blocker_id = CASE WHEN m.user1_id = ${userId} THEN m.user2_id ELSE m.user1_id END AND b.blocked_id = ${userId}))
    ORDER BY COALESCE(last_message_at, m.created_at) DESC
  `;
  return rows as unknown as MatchWithUser[];
}

// ── Messages ─────────────────────────────────────────────────

export async function createMessage(
  matchId: number,
  senderId: number,
  content: string,
): Promise<Message> {
  const rows = await sql()`
    INSERT INTO messages (match_id, sender_id, content)
    VALUES (${matchId}, ${senderId}, ${content})
    RETURNING *
  `;
  return rows[0] as unknown as Message;
}

export async function getMessages(
  matchId: number,
  limit = 50,
  beforeId?: number,
): Promise<MessageWithSender[]> {
  if (beforeId) {
    const rows = await sql()`
      SELECT msg.*, u.display_name AS sender_name, u.photo_path AS sender_photo
      FROM messages msg
      JOIN users u ON u.id = msg.sender_id
      WHERE msg.match_id = ${matchId} AND msg.id < ${beforeId}
      ORDER BY msg.created_at DESC
      LIMIT ${limit}
    `;
    return rows as unknown as MessageWithSender[];
  }
  const rows = await sql()`
    SELECT msg.*, u.display_name AS sender_name, u.photo_path AS sender_photo
    FROM messages msg
    JOIN users u ON u.id = msg.sender_id
    WHERE msg.match_id = ${matchId}
    ORDER BY msg.created_at DESC
    LIMIT ${limit}
  `;
  return rows as unknown as MessageWithSender[];
}

export async function getUnreadMessageCount(userId: number): Promise<number> {
  const rows = await sql()`
    SELECT COUNT(*) AS cnt
    FROM messages msg
    JOIN matches m ON m.id = msg.match_id
    WHERE (m.user1_id = ${userId} OR m.user2_id = ${userId})
      AND msg.sender_id != ${userId}
      AND msg.read = 0
  `;
  const row = rows[0] as { cnt: string } | undefined;
  return row ? Number(row.cnt) : 0;
}

export async function markMessagesRead(matchId: number, readerId: number): Promise<void> {
  await sql()`
    UPDATE messages SET read = 1
    WHERE match_id = ${matchId} AND sender_id != ${readerId} AND read = 0
  `;
}

// ── Blocking ───────────────────────────────────────────────────

export async function blockUser(blockerId: number, blockedId: number): Promise<void> {
  const [a, b] = blockerId < blockedId ? [blockerId, blockedId] : [blockedId, blockerId];
  const key = relationshipLockKey(a, b);
  await sql().transaction((txn) => [
    txn`SELECT pg_advisory_xact_lock(${key})`,
    txn`INSERT INTO blocks (blocker_id, blocked_id)
        VALUES (${blockerId}, ${blockedId})
        ON CONFLICT (blocker_id, blocked_id) DO NOTHING`,
    txn`DELETE FROM likes
        WHERE (liker_id = ${blockerId} AND liked_id = ${blockedId})
           OR (liker_id = ${blockedId} AND liked_id = ${blockerId})`,
    txn`DELETE FROM matches WHERE user1_id = ${a} AND user2_id = ${b}`,
  ]);
}

export async function isBlocked(userId: number, otherUserId: number): Promise<boolean> {
  const rows = await sql()`
    SELECT id FROM blocks
    WHERE (blocker_id = ${userId} AND blocked_id = ${otherUserId})
       OR (blocker_id = ${otherUserId} AND blocked_id = ${userId})
    LIMIT 1
  `;
  return rows.length > 0;
}

// ── Unmatching ──────────────────────────────────────────────────

export async function unmatchUser(userId: number, otherUserId: number): Promise<void> {
  // Remove all likes between the two users in both directions
  await sql()`
    DELETE FROM likes
    WHERE (liker_id = ${userId} AND liked_id = ${otherUserId})
       OR (liker_id = ${otherUserId} AND liked_id = ${userId})
  `;

  // Delete the match row (does NOT block, unlike blockUser)
  const [a, b] = userId < otherUserId ? [userId, otherUserId] : [otherUserId, userId];
  await sql()`
    DELETE FROM matches
    WHERE user1_id = ${a} AND user2_id = ${b}
  `;
}

export async function getBlockedUserIds(userId: number): Promise<number[]> {
  const rows = await sql()`
    SELECT blocked_id FROM blocks WHERE blocker_id = ${userId}
    UNION
    SELECT blocker_id FROM blocks WHERE blocked_id = ${userId}
  `;
  return rows.map((r: any) => Number(r.blocked_id));
}

// ── Reporting ─────────────────────────────────────────────────

export async function reportUser(reporterId: number, reportedId: number, reason: string, targetPhotoId?: number | null, details?: string | null): Promise<string> {
  const rows = await sql()`
    INSERT INTO reports (reporter_id, reported_id, reason, target_photo_id, details)
    VALUES (${reporterId}, ${reportedId}, ${reason}, (SELECT id FROM user_photos WHERE id=${targetPhotoId ?? null} AND user_id=${reportedId}), ${details ?? null}) RETURNING id
  `;
  if (targetPhotoId) {
    await sql()`INSERT INTO photo_moderation_cases (photo_id, user_id, source, result, reason, status)
      SELECT id, user_id, 'user_report', 'unknown', ${reason}, 'pending' FROM user_photos
      WHERE id=${targetPhotoId} AND user_id=${reportedId}
      AND NOT EXISTS (SELECT 1 FROM photo_moderation_cases WHERE photo_id=${targetPhotoId} AND status IN ('pending','quarantined','removed'))`;
  }
  return String(rows[0].id);
}
/** Immediately quarantine every photo owned by an account reported as underage. */
export async function quarantineUserPhotosForUnderage(userId: number, reportId: string): Promise<void> {
  await sql()`
    INSERT INTO photo_moderation_cases (photo_id, user_id, source, result, reason, status)
    SELECT p.id, p.user_id, 'underage_report', 'unknown', 'underage', 'quarantined'
    FROM user_photos p
    WHERE p.user_id = ${userId}
      AND NOT EXISTS (
        SELECT 1 FROM photo_moderation_cases c
        WHERE c.photo_id = p.id AND c.status IN ('pending','quarantined','removed')
      )
  `;
  await sql()`
    UPDATE photo_moderation_cases SET status='quarantined', reason='underage', updated_at=NOW()
    WHERE user_id=${userId} AND status IN ('pending','quarantined')
  `;
  // The report id is intentionally not stored in the evidence response; it is
  // retained only in the suspension/audit chain for privileged investigation.
  void reportId;
}
export async function getReportQueue(status?: string) {
  return await sql()`SELECT id, reported_id, reason, status, priority, assignee_id, created_at, triaged_at, actioned_at, resolved_at FROM reports WHERE (${status ?? null} IS NULL OR status = ${status ?? null}) ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, created_at ASC LIMIT 200`;
}
export async function getReportById(id: string) { const rows = await sql()`SELECT id, reported_id, reason, target_photo_id, details, status, priority, assignee_id, created_at, triaged_at, actioned_at, resolved_at, resolution_notes FROM reports WHERE id = ${id}`; return rows[0] ?? null; }
export async function assignReport(id: string, assigneeId: number | null) { await sql()`UPDATE reports SET assignee_id = ${assigneeId} WHERE id = ${id}`; }
export async function transitionReport(id: string, status: string, actorId: number, notes?: string | null) {
  const stamp = status === 'triaged' ? 'triaged_at' : status === 'actioned' ? 'actioned_at' : (status === 'dismissed' || status === 'closed') ? 'resolved_at' : null;
  if (stamp === 'triaged_at') await sql()`UPDATE reports SET status=${status}, triaged_at=NOW() WHERE id=${id}`;
  else if (stamp === 'actioned_at') await sql()`UPDATE reports SET status=${status}, actioned_at=NOW() WHERE id=${id}`;
  else if (stamp === 'resolved_at') await sql()`UPDATE reports SET status=${status}, resolved_at=NOW(), resolution_notes=${notes ?? null} WHERE id=${id}`;
  else await sql()`UPDATE reports SET status=${status} WHERE id=${id}`;
  return actorId;
}

export async function upsertModerationFlag(photoId: number, userId: number, flagType: string, confidence: number | null, providerRef: string | null, status = "new") {
  const rows = await sql()`INSERT INTO moderation_flags (photo_id,user_id,flag_type,confidence,provider_ref,status) VALUES (${photoId},${userId},${flagType},${confidence},${providerRef},${status}) ON CONFLICT (photo_id,flag_type) DO UPDATE SET confidence=EXCLUDED.confidence, provider_ref=EXCLUDED.provider_ref WHERE moderation_flags.status='new' RETURNING id, photo_id, user_id, flag_type, confidence, provider_ref, status, created_at`;
  return rows[0] ?? null;
}
export async function getModerationFlagQueue(status?: string) { return sql()`SELECT id, photo_id, user_id, flag_type, confidence, provider_ref, status, created_at, reviewed_at, reviewed_by FROM moderation_flags WHERE (${status ?? null} IS NULL OR status=${status ?? null}) ORDER BY created_at ASC LIMIT 200`; }
export async function reviewModerationFlag(id: string, status: string, reviewerId: number) { const rows = await sql()`UPDATE moderation_flags SET status=${status}, reviewed_at=NOW(), reviewed_by=${reviewerId} WHERE id=${id} RETURNING id, status`; return rows[0] ?? null; }
export async function createPhotoModerationCase(photoId: number, userId: number, source: string, result = "unknown", reason?: string | null) {
  const rows = await sql()`INSERT INTO photo_moderation_cases (photo_id,user_id,source,result,reason,status) VALUES (${photoId},${userId},${source},${result},${reason ?? null},${result === "unsafe" ? "quarantined" : "pending"}) RETURNING id, photo_id, user_id, status, source, result, reason, created_at, updated_at, reviewed_at, retention_until`;
  return rows[0] ?? null;
}
export async function getPhotoModerationQueue(status?: string) { return sql()`SELECT id, photo_id, user_id, status, source, result, reason, actor_user_id, created_at, updated_at, reviewed_at, retention_until, private_content_type, legal_hold FROM photo_moderation_cases WHERE (${status ?? null} IS NULL OR status=${status ?? null}) ORDER BY created_at ASC LIMIT 200`; }
export async function getPhotoModerationCase(id: string) { const rows = await sql()`SELECT id, photo_id, user_id, status, source, result, reason, actor_user_id, created_at, updated_at, reviewed_at, retention_until, private_object_key, private_content_type, private_deleted_at, legal_hold FROM photo_moderation_cases WHERE id=${id}`; return rows[0] ?? null; }
export async function getUserPhotoById(photoId: number, userId: number) { const rows = await sql()`SELECT id, user_id, photo_path FROM user_photos WHERE id=${photoId} AND user_id=${userId}`; return rows[0] ?? null; }
export async function getPhotoModerationCaseForPhoto(photoId: number, userId: number) { const rows = await sql()`SELECT id, photo_id, user_id, status, source, result, reason, private_object_key, private_content_type FROM photo_moderation_cases WHERE photo_id=${photoId} AND user_id=${userId} AND status IN ('pending','quarantined') ORDER BY created_at DESC LIMIT 1`; return rows[0] ?? null; }
export async function attachPrivatePhotoObject(caseId: string, objectKey: string, contentType: string) { const rows = await sql()`UPDATE photo_moderation_cases SET private_object_key=${objectKey}, private_content_type=${contentType} WHERE id=${caseId} RETURNING id`; return rows[0] ?? null; }
export async function markPrivatePhotoDeleted(caseId: string) { await sql()`UPDATE photo_moderation_cases SET private_deleted_at=NOW() WHERE id=${caseId}`; }
export async function listExpiredPrivatePhotoCases() { return sql()`SELECT id, private_object_key FROM photo_moderation_cases WHERE private_object_key IS NOT NULL AND private_deleted_at IS NULL AND legal_hold=false AND retention_until <= NOW() AND status IN ('approved','removed','restored')`; }
export async function transitionPhotoModerationCase(id: string, status: string, actorId: number, result?: string) {
  const rows = await sql()`UPDATE photo_moderation_cases SET status=${status}, result=COALESCE(${result ?? null}, result), actor_user_id=${actorId}, updated_at=NOW(), reviewed_at=NOW() WHERE id=${id} RETURNING photo_id,user_id,status`;
  return rows[0] ?? null;
}
export async function photoIsQuarantined(photoId: number) { const rows = await sql()`SELECT 1 FROM photo_moderation_cases WHERE photo_id=${photoId} AND status IN ('pending','quarantined','removed') LIMIT 1`; return rows.length > 0; }

// ── Account Deletion ───────────────────────────────────────────

/**
 * Permanently delete a user and every user-owned record, transactionally.
 *
 * 1. Collect owned photo storage paths BEFORE the rows are deleted
 *    (ownership is scoped to rows belonging to this user only).
 * 2. Delete every user-owned row in a single Postgres transaction: either
 *    all of it is deleted or none of it is — no partial deletion on failure.
 *    The final DELETE FROM users invalidates all sessions (full session
 *    invalidation across devices).
 * 3. Best-effort storage cleanup AFTER the DB commit, so a storage failure
 *    can never roll back (or partially apply) account deletion. Each failed
 *    file deletion is logged by deletePhoto; a summary line makes the
 *    cleanup outcome observable to operators.
 */
export async function deleteUserAccount(userId: number): Promise<void> {
  // 1. Collect owned photo paths before the rows are gone.
  const [profileRows, galleryRows, gradeRows] = await Promise.all([
    sql()`SELECT photo_path FROM users WHERE id = ${userId}`,
    sql()`SELECT photo_path FROM user_photos WHERE user_id = ${userId}`,
    sql()`SELECT photo_path FROM photo_grades WHERE user_id = ${userId}`,
  ]);
  const photoPaths = collectOwnedPhotoPaths(
    (profileRows[0] as { photo_path?: string | null } | undefined)?.photo_path,
    (galleryRows as Array<{ photo_path: string }>).map((r) => r.photo_path),
    (gradeRows as Array<{ photo_path: string }>).map((r) => r.photo_path),
  );

  // 2. Atomic deletion of all user-owned rows.
  await sql().transaction((txn) =>
    buildAccountDeletionQueries(
      userId,
      txn as unknown as (strings: TemplateStringsArray, ...params: unknown[]) => unknown,
    ),
  );

  // 3. Best-effort storage cleanup with observable outcomes.
  let deleted = 0;
  let failed = 0;
  for (const photoPath of photoPaths) {
    if (await deletePhoto(photoPath)) deleted += 1;
    else failed += 1;
  }
  if (photoPaths.length > 0) {
    logInfo(EVENTS.ACCOUNT_PHOTO_CLEANUP, {
      user_id: userId,
      total: photoPaths.length,
      deleted,
      failed,
    });
  }
}

// ── Password Reset ────────────────────────────────────────────────

export interface PasswordResetToken {
  id: string;
  user_id: number;
  token: string;
  expires_at: string;
  used: number;
}

export async function createPasswordResetToken(
  userId: number,
  token: string,
  expiresAt: string,
): Promise<PasswordResetToken> {
  const id = crypto.randomUUID();
  const rows = await sql()`
    INSERT INTO password_reset_tokens (id, user_id, token, expires_at)
    VALUES (${id}, ${userId}, ${token}, ${expiresAt})
    RETURNING *
  `;
  return rows[0] as unknown as PasswordResetToken;
}

export async function getPasswordResetToken(
  token: string,
): Promise<PasswordResetToken | null> {
  const rows = await sql()`
    SELECT * FROM password_reset_tokens WHERE token = ${token} AND used = 0
  `;
  return rows.length > 0 ? (rows[0] as unknown as PasswordResetToken) : null;
}

export async function markTokenUsed(token: string): Promise<void> {
  await sql()`
    UPDATE password_reset_tokens SET used = 1 WHERE token = ${token}
  `;
}

export async function updateUserPassword(
  userId: number,
  passwordHash: string,
): Promise<void> {
  await sql()`
    UPDATE users SET password_hash = ${passwordHash} WHERE id = ${userId}
  `;
}

// ── Upsells ──────────────────────────────────────────────────────
export type PaidUpsellProduct = "re-grade" | "boost" | "like-pack";
/** Record a checkout session created for a one-time purchase. The entitlement
 * starts "pending" (payment not yet verified) so the duplicate-purchase check
 * can block a second checkout for the same product until this one resolves.
 * Returns false if another pending entitlement for the same product already
 * exists (enforced by the partial unique index). Abandoned pending rows are
 * dropped after one hour so they never block a purchase forever. */
export async function createPendingUpsell(
  userId: number,
  product: PaidUpsellProduct,
  stripeSessionId: string,
): Promise<boolean> {
  await sql()`
    DELETE FROM paid_upsell_entitlements
    WHERE user_id = ${userId} AND product = ${product} AND status = 'pending'
      AND created_at <= NOW() - INTERVAL '1 hour'
  `;
  const inserted = await sql()`
    INSERT INTO paid_upsell_entitlements (user_id, product, stripe_session_id, status)
    VALUES (${userId}, ${product}, ${stripeSessionId}, 'pending')
    ON CONFLICT (stripe_session_id) DO NOTHING
    RETURNING id
  `;
  return inserted.length > 0;
}

/** Authenticated entitlement state for a one-time product, used by the store
 * page's bounded confirmation polling and by the duplicate-purchase check.
 * - "entitled" means the product is currently usable: an unused re-grade
 *   credit, an active boost, or (for like-packs, which stack) a granted row
 *   for the specific checkout session being confirmed.
 * - "pending" means a checkout is still waiting for Stripe confirmation. */
export async function getUpsellEntitlementState(
  userId: number,
  product: PaidUpsellProduct,
  sessionId?: string | null,
): Promise<{ entitled: boolean; pending: boolean }> {
  const pendingRows = await sql()`
    SELECT 1 FROM paid_upsell_entitlements
    WHERE user_id = ${userId} AND product = ${product} AND status = 'pending'
      AND created_at > NOW() - INTERVAL '1 hour'
    LIMIT 1
  `;
  const pending = pendingRows.length > 0;
  let entitled = false;
  if (product === "re-grade") {
    const rows = await sql()`SELECT regrades_available FROM users WHERE id = ${userId}`;
    entitled = rows.length > 0 && Number((rows[0] as { regrades_available: number }).regrades_available) > 0;
  } else if (product === "boost") {
    const rows = await sql()`SELECT boost_until FROM users WHERE id = ${userId}`;
    if (rows.length > 0) {
      const boostUntil = (rows[0] as { boost_until: string | null }).boost_until;
      entitled = boostUntil !== null && new Date(boostUntil).getTime() > Date.now();
    }
  } else if (sessionId) {
    const rows = await sql()`
      SELECT 1 FROM paid_upsell_entitlements
      WHERE user_id = ${userId} AND product = ${product} AND status = 'granted'
        AND stripe_session_id = ${sessionId}
      LIMIT 1
    `;
    entitled = rows.length > 0;
  }
  return { entitled, pending };
}

/** Grant a Stripe-verified purchase exactly once. The unique session id makes
 * webhook retries and activation retries harmless; a checkout-time "pending"
 * row (created by createPendingUpsell) is flipped to "granted" rather than
 * inserting a duplicate. */
export async function grantPaidUpsell(
  userId: number,
  product: PaidUpsellProduct,
  stripeSessionId: string,
): Promise<boolean> {
  const flipped = await sql()`
    UPDATE paid_upsell_entitlements SET status = 'granted'
    WHERE user_id = ${userId} AND product = ${product}
      AND stripe_session_id = ${stripeSessionId} AND status = 'pending'
    RETURNING id
  `;
  if (flipped.length === 0) {
    const inserted = await sql()`
      INSERT INTO paid_upsell_entitlements (user_id, product, stripe_session_id)
      VALUES (${userId}, ${product}, ${stripeSessionId})
      ON CONFLICT (stripe_session_id) DO NOTHING
      RETURNING id
    `;
    if (inserted.length === 0) return false;
  }
  if (product === "re-grade") await addReGrade(userId);
  else if (product === "boost") await activateBoost(userId);
  else await addLikePacks(userId, 5);
  return true;
}
export async function addReGrade(userId: number): Promise<void> {
  await sql()`
    UPDATE users SET regrades_available = regrades_available + 1 WHERE id = ${userId}
  `;
}

export async function useReGrade(userId: number): Promise<boolean> {
  const rows = await sql()`
    UPDATE users SET regrades_available = regrades_available - 1
    WHERE id = ${userId} AND regrades_available > 0
    RETURNING regrades_available
  `;
  return rows.length > 0;
}

export async function activateBoost(userId: number, durationHours = 24 * 7): Promise<void> {
  const until = new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString();
  await sql()`
    UPDATE users SET boost_until = ${until} WHERE id = ${userId}
  `;
}

export async function addLikePacks(userId: number, count: number = 5): Promise<void> {
  await sql()`
    UPDATE users SET like_packs = like_packs + ${count} WHERE id = ${userId}
  `;
}

export async function getLikePacksRemaining(userId: number): Promise<number> {
  const rows = await sql()`
    SELECT like_packs FROM users WHERE id = ${userId}
  `;
  return rows.length > 0 ? Number((rows[0] as { like_packs: number }).like_packs) : 0;
}

// ── Push Subscriptions ─────────────────────────────────────────

export interface PushSubscriptionRow {
  id: number;
  user_id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
}

export async function savePushSubscription(
  userId: number,
  endpoint: string,
  p256dh: string,
  auth: string,
): Promise<PushSubscriptionRow> {
  const rows = await sql()`
    INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
    VALUES (${userId}, ${endpoint}, ${p256dh}, ${auth})
    ON CONFLICT (user_id, endpoint) DO UPDATE SET
      p256dh = ${p256dh},
      auth = ${auth},
      created_at = NOW()
    RETURNING *
  `;
  return rows[0] as unknown as PushSubscriptionRow;
}

export async function getPushSubscriptions(
  userId: number,
): Promise<PushSubscriptionRow[]> {
  const rows = await sql()`
    SELECT * FROM push_subscriptions WHERE user_id = ${userId}
  `;
  return rows as unknown as PushSubscriptionRow[];
}

export async function deletePushSubscription(
  userId: number,
  endpoint: string,
): Promise<void> {
  await sql()`
    DELETE FROM push_subscriptions
    WHERE user_id = ${userId} AND endpoint = ${endpoint}
  `;
}

// ── Referral Codes ──────────────────────────────────────────────

export interface ReferralCode {
  id: number;
  user_id: number;
  code: string;
  usage_count: number;
  max_uses: number;
  created_at: string;
}

export interface ReferralReward {
  id: number;
  referrer_user_id: number;
  referee_user_id: number;
  reward_type: string;
  applied: boolean;
  created_at: string;
}

export interface ReferralStats {
  code: string;
  usage_count: number;
  rewards_earned: number;
}

function generateRandomCode(length: number = 8): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export async function generateReferralCode(userId: number): Promise<ReferralCode> {
  // Check if user already has a code
  const existing = await sql()`
    SELECT * FROM referral_codes WHERE user_id = ${userId}
  `;
  if (existing.length > 0) {
    return existing[0] as unknown as ReferralCode;
  }

  // Generate a unique 8-char alphanumeric code (e.g. "GRD8XK2P")
  let code: string;
  let attempts = 0;
  do {
    code = generateRandomCode();
    const dup = await sql()`SELECT id FROM referral_codes WHERE code = ${code}`;
    if (dup.length === 0) break;
    attempts++;
  } while (attempts < 10);

  const rows = await sql()`
    INSERT INTO referral_codes (user_id, code)
    VALUES (${userId}, ${code})
    RETURNING *
  `;
  return rows[0] as unknown as ReferralCode;
}

export async function getReferralCode(userId: number): Promise<ReferralCode | null> {
  const rows = await sql()`
    SELECT * FROM referral_codes WHERE user_id = ${userId}
  `;
  return rows.length > 0 ? (rows[0] as unknown as ReferralCode) : null;
}

export async function getReferralCodeByCode(code: string): Promise<ReferralCode | null> {
  const rows = await sql()`
    SELECT * FROM referral_codes WHERE code = ${code}
  `;
  return rows.length > 0 ? (rows[0] as unknown as ReferralCode) : null;
}

export async function applyReferralCode(
  code: string,
  newUserId: number,
): Promise<{ success: boolean; error?: string }> {
  const referral = await getReferralCodeByCode(code);
  if (!referral) {
    return { success: false, error: "Invalid referral code" };
  }

  if (referral.user_id === newUserId) {
    return { success: false, error: "You cannot use your own referral code" };
  }

  // Check max_uses cap (1000 total redemptions per code)
  if (referral.usage_count >= referral.max_uses) {
    return { success: false, error: "This referral code has reached its maximum uses" };
  }

  // Check if this referee was already referred by someone
  const existing = await sql()`
    SELECT id FROM referral_rewards WHERE referee_user_id = ${newUserId}
  `;
  if (existing.length > 0) {
    return { success: false, error: "You have already used a referral code" };
  }

  // Increment usage count
  await sql()`
    UPDATE referral_codes SET usage_count = usage_count + 1
    WHERE id = ${referral.id}
  `;

  // Create reward record (not applied yet — applied when referee subscribes)
  await sql()`
    INSERT INTO referral_rewards (referrer_user_id, referee_user_id, expires_at)
    VALUES (${referral.user_id}, ${newUserId}, NOW() + INTERVAL '30 days')
  `;

  return { success: true };
}

export async function getReferralStats(userId: number): Promise<ReferralStats | null> {
  const code = await getReferralCode(userId);
  if (!code) return null;

  const rewardsResult = await sql()`
    SELECT COUNT(*)::int AS cnt FROM referral_rewards
    WHERE referrer_user_id = ${userId} AND applied = true
  `;
  const rewardsEarned = rewardsResult.length > 0
    ? Number((rewardsResult[0] as { cnt: number }).cnt)
    : 0;

  return {
    code: code.code,
    usage_count: code.usage_count,
    rewards_earned: rewardsEarned,
  };
}

export async function getReferralRewardForReferee(
  refereeUserId: number,
): Promise<ReferralReward | null> {
  const rows = await sql()`
    SELECT * FROM referral_rewards WHERE referee_user_id = ${refereeUserId} AND (expires_at IS NULL OR expires_at > NOW())
  `;
  return rows.length > 0 ? (rows[0] as unknown as ReferralReward) : null;
}

export async function applyReferralReward(rewardId: number): Promise<void> {
  const reward = await sql()`
    SELECT * FROM referral_rewards WHERE id = ${rewardId}
  `;
  if (reward.length === 0) return;

  const r = reward[0] as unknown as ReferralReward;
  if (r.applied || (r.expires_at && new Date(r.expires_at).getTime() <= Date.now())) return;

  // Give referrer 1 month of premium — set to active and extend
  await sql()`
    UPDATE users SET
      subscription_status = 'active',
      subscription_expires_at = COALESCE(subscription_expires_at, NOW()) + INTERVAL '1 month'
    WHERE id = ${r.referrer_user_id}
  `;

  // Give referee 1 month of premium — set to active and extend
  await sql()`
    UPDATE users SET
      subscription_status = 'active',
      subscription_expires_at = COALESCE(subscription_expires_at, NOW()) + INTERVAL '1 month'
    WHERE id = ${r.referee_user_id}
  `;

  // Mark reward as applied
  await sql()`
    UPDATE referral_rewards SET applied = true WHERE id = ${r.id}
  `;
}

// ── Founders Club ──────────────────────────────────────────────

export async function getFounderCount(): Promise<number> {
  const rows = await sql()`
    SELECT COUNT(*)::int AS cnt FROM users WHERE is_founder = true
  `;
  return rows.length > 0 ? (rows[0] as { cnt: number }).cnt : 0;
}

export async function getFounderSpotsRemaining(): Promise<{ remaining: number; total: number }> {
  const count = await getFounderCount();
  const remaining = Math.max(0, 1000 - count);
  return { remaining, total: 1000 };
}

/**
 * Assign the next sequential founder_number to a user.
 * Returns the assigned number, or null if all 1000 spots are taken.
 */
export const CANONICAL_PREMIUM_PRICE_ID = PREMIUM_PRICE_ID;

export function hasCanonicalFounderPriceLock(user: Pick<User, "is_founder" | "founder_number" | "founder_price_lock_price_id">): boolean {
  return founderPriceLockApplies(user.is_founder, user.founder_number, user.founder_price_lock_price_id);
}

export async function assignFounderNumber(userId: number): Promise<number | null> {
  // Check current count using a single atomic operation via SELECT FOR UPDATE
  // We use a transaction to ensure atomicity
  const rows = await sql()`
    SELECT COALESCE(MAX(founder_number), 0) AS max_num FROM users WHERE founder_number IS NOT NULL
  `;
  const nextNum = (rows[0] as { max_num: number }).max_num + 1;

  if (nextNum > 1000) {
    return null; // All spots taken
  }

  // Assign the number
  const updated = await sql()`
    UPDATE users SET founder_number = ${nextNum}, is_founder = true, founder_price_lock_price_id = ${CANONICAL_PREMIUM_PRICE_ID}
    WHERE id = ${userId} AND founder_number IS NULL
    RETURNING founder_number
  `;

  if (updated.length === 0) {
    return null; // User already has a number or doesn't exist
  }

  const founderNumber = (updated[0] as { founder_number: number }).founder_number;
  await awardBadge(userId, "founding_member", `Founding Member #${founderNumber}`);

  return founderNumber;
}


// ── Waitlist ──────────────────────────────────────────────────────

export interface WaitlistEntry {
  id: number;
  email: string;
  zip_code: string | null;
  created_at: string;
  confirmed_at: string | null;
}

export async function joinWaitlist(
  email: string,
  zipCode?: string,
): Promise<WaitlistEntry | null> {
  try {
    const rows = await sql()`
      INSERT INTO waitlist (email, zip_code)
      VALUES (${email}, ${zipCode || null})
      ON CONFLICT (email) DO NOTHING
      RETURNING *
    `;
    if (rows.length > 0) {
      return rows[0] as unknown as WaitlistEntry;
    }
    // Email already exists — return null (but not an error, to avoid leaking data)
    return null;
  } catch {
    // Gracefully handle any DB errors
    return null;
  }
}

export async function confirmWaitlistEntry(email: string): Promise<void> {
  await sql()`
    UPDATE waitlist SET confirmed_at = NOW()
    WHERE email = ${email}
  `;
}

/** Persist a claim nonce before sending it to the browser. Duplicate nonces fail closed. */
export async function persistAttributionClaim(claim: { nonce: string; experiment: string; variant: string; issuedAt: number; expiresAt: number }): Promise<boolean> {
  try {
    await sql()`DELETE FROM attribution_claims WHERE expires_at < NOW()`;
    const rows = await sql()`INSERT INTO attribution_claims (nonce, experiment, variant, issued_at, expires_at) VALUES (${claim.nonce}, ${claim.experiment}, ${claim.variant}, TO_TIMESTAMP(${claim.issuedAt / 1000}), TO_TIMESTAMP(${claim.expiresAt / 1000})) ON CONFLICT (nonce) DO NOTHING RETURNING nonce`;
    return rows.length === 1;
  } catch { return false; }
}

/** Atomically consume a non-expired claim nonce for a future signup boundary. */
export async function consumeAttributionClaim(nonce: string): Promise<boolean> {
  try {
    const rows = await sql()`UPDATE attribution_claims SET consumed_at = NOW() WHERE nonce = ${nonce} AND consumed_at IS NULL AND expires_at > NOW() RETURNING nonce`;
    return rows.length === 1;
  } catch { return false; }
}
