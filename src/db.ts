import { neon } from "@neondatabase/serverless";
import type { NeonQueryFunction } from "@neondatabase/serverless";

let _sql: NeonQueryFunction<false, false> | null = null;

function sql(): NeonQueryFunction<false, false> {
  if (!_sql) {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        "DATABASE_URL is not set. Please connect a Neon database first.",
      );
    }
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql;
}

// ── Schema initialization ──────────────────────────────────────

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
      photo_path TEXT,
      grade INTEGER,
      subscription_status TEXT DEFAULT 'inactive',
      subscription_updated_at TIMESTAMPTZ,
      subscription_expires_at TIMESTAMPTZ,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
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

  await sql()`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

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
      reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reported_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reason TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

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
      photo_path TEXT NOT NULL,
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
      photo_path TEXT NOT NULL,
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
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql()`
    CREATE TABLE IF NOT EXISTS referral_rewards (
      id SERIAL PRIMARY KEY,
      referrer_user_id INTEGER NOT NULL REFERENCES users(id),
      referee_user_id INTEGER NOT NULL REFERENCES users(id),
      reward_type TEXT DEFAULT 'free_month',
      applied BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql()`
    CREATE TABLE IF NOT EXISTS waitlist (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      zip_code TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      confirmed_at TIMESTAMPTZ
    )
  `;
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
  regrades_available: number;
  boost_until: string | null;
  likes_revealed: number;
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
  created_at: string;
}

export interface Session {
  id: string;
  user_id: number;
  created_at: string;
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
}

export interface MatchWithUser {
  match_id: number;
  user_id: number;
  display_name: string | null;
  photo_path: string | null;
  last_message: string | null;
  last_message_at: string | null;
  match_created_at: string;
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
    SELECT * FROM user_photos
    WHERE user_id = ${userId}
    ORDER BY sort_order ASC
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

  // Count users in the same city who have a percentile/grade
  const totalRows = await sql()`
    SELECT COUNT(*)::int AS cnt FROM users
    WHERE location_city = ${user.location_city}
      AND percentile IS NOT NULL
      AND id != ${userId}
  `;
  const totalInCity = (totalRows[0] as { cnt: number }).cnt;

  // Need at least 10 users in the city (including this user)
  if (totalInCity < 9) return null;

  // Count how many users have a lower or equal grade
  const lowerRows = await sql()`
    SELECT COUNT(*)::int AS cnt FROM users
    WHERE location_city = ${user.location_city}
      AND percentile IS NOT NULL
      AND id != ${userId}
      AND percentile <= ${best.grade}
  `;
  const lowerOrEqual = (lowerRows[0] as { cnt: number }).cnt;

  // Percentile: what percentage of users you rank above
  // (lowerOrEqual / totalInCity) * 100
  const percentile = Math.round((lowerOrEqual / totalInCity) * 1000) / 10;

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

export async function createSession(userId: number): Promise<Session> {
  const id = crypto.randomUUID();
  await sql()`INSERT INTO sessions (id, user_id) VALUES (${id}, ${userId})`;
  return { id, user_id: userId, created_at: new Date().toISOString() };
}

export async function getSessionById(sessionId: string): Promise<Session | null> {
  const rows = await sql()`SELECT * FROM sessions WHERE id = ${sessionId}`;
  return rows.length > 0 ? (rows[0] as unknown as Session) : null;
}

export async function deleteSession(sessionId: string): Promise<void> {
  await sql()`DELETE FROM sessions WHERE id = ${sessionId}`;
}

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

export async function activateAnnualSubscription(
  userId: number,
): Promise<void> {
  await sql()`
    UPDATE users SET
      subscription_status = 'active',
      subscription_updated_at = NOW(),
      subscription_expires_at = NOW() + INTERVAL '1 year'
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

/**
 * Returns badges for a user based on their profile completeness and activity.
 * Badges: verified, best_photo, top_rated, active_dater, conversationalist
 */
export async function getUserBadges(user: User): Promise<Badge[]> {
  const badges: Badge[] = [];

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

  return badges;
}

// ── 80/20 Matching ─────────────────────────────────────────────

/**
 * Get users for the swiping feed using an 80/20 distribution:
 * 80% of results from the user's percentile range (or grade range),
 * 10% from above, 10% from below. Results are shuffled.
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

  // Determine if we use percentile or grade-based range
  const usePercentile = user?.percentile != null;
  const percentile = user?.percentile ?? null;

  // In-range: ±5 percentile points or ±1 grade
  let inRangeMin: number;
  let inRangeMax: number;

  if (usePercentile && percentile != null) {
    inRangeMin = Math.max(0, percentile - 5);
    inRangeMax = Math.min(100, percentile + 5);
  } else {
    inRangeMin = Math.max(1, userGrade - 1);
    inRangeMax = Math.min(10, userGrade + 1);
  }

  // Fetch in-range users (80%)
  const inRangeUsers = await getUsersByGradeRange(
    userGrade,
    inRangeMin,
    inRangeMax,
    excludeUserId,
    lookingFor,
    blockedByIds,
    latitude,
    longitude,
    maxDistance,
  );

  // Fetch above-range users (10%)
  let aboveMin: number;
  let aboveMax: number;
  if (usePercentile) {
    aboveMin = inRangeMax;
    aboveMax = 100;
  } else {
    aboveMin = inRangeMax + 1 > 10 ? inRangeMax : inRangeMax + 1;
    aboveMax = 10;
  }
  const aboveUsers = aboveMin <= aboveMax
    ? await getUsersByGradeRange(
        userGrade,
        aboveMin,
        aboveMax,
        excludeUserId,
        lookingFor,
        blockedByIds,
        latitude,
        longitude,
        maxDistance,
      )
    : [];

  // Fetch below-range users (10%)
  let belowMin: number;
  let belowMax: number;
  if (usePercentile) {
    belowMin = 0;
    belowMax = inRangeMin;
  } else {
    belowMin = 1;
    belowMax = inRangeMin - 1 < 1 ? inRangeMin : inRangeMin - 1;
  }
  const belowUsers = belowMin <= belowMax
    ? await getUsersByGradeRange(
        userGrade,
        belowMin,
        belowMax,
        excludeUserId,
        lookingFor,
        blockedByIds,
        latitude,
        longitude,
        maxDistance,
      )
    : [];

  // Combine: 80% in-range, 10% above, 10% below
  // Calculate counts — if we don't have enough above/below, fill with in-range
  const totalInRange = inRangeUsers.length;
  const aboveCount = Math.max(0, Math.min(aboveUsers.length, Math.ceil(totalInRange * 0.125))); // ~10% of total
  const belowCount = Math.max(0, Math.min(belowUsers.length, Math.ceil(totalInRange * 0.125)));
  const inRangeCount = totalInRange; // Keep all in-range

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

  // Subscribers always have unlimited
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

  // Subscribers always have unlimited
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

export async function recordLike(
  likerId: number,
  likedId: number,
  action: string = "like",
): Promise<void> {
  await sql()`
    INSERT INTO likes (liker_id, liked_id, action)
    VALUES (${likerId}, ${likedId}, ${action})
    ON CONFLICT (liker_id, liked_id)
    DO UPDATE SET action = ${action}, created_at = NOW()
  `;
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
  const rows = await sql()`
    INSERT INTO matches (user1_id, user2_id)
    VALUES (${a}, ${b})
    ON CONFLICT (user1_id, user2_id) DO NOTHING
    RETURNING *
  `;
  if (rows.length > 0) {
    return rows[0] as unknown as Match;
  }
  // Already exists — fetch the existing match
  const existing = await sql()`
    SELECT * FROM matches WHERE user1_id = ${a} AND user2_id = ${b}
  `;
  return existing.length > 0 ? (existing[0] as unknown as Match) : null;
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
      m.created_at AS match_created_at
    FROM matches m
    JOIN users u ON u.id = CASE WHEN m.user1_id = ${userId} THEN m.user2_id ELSE m.user1_id END
    WHERE m.user1_id = ${userId} OR m.user2_id = ${userId}
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
  await sql()`
    INSERT INTO blocks (blocker_id, blocked_id)
    VALUES (${blockerId}, ${blockedId})
    ON CONFLICT (blocker_id, blocked_id) DO NOTHING
  `;

  // Remove all likes between the two users in both directions
  await sql()`
    DELETE FROM likes
    WHERE (liker_id = ${blockerId} AND liked_id = ${blockedId})
       OR (liker_id = ${blockedId} AND liked_id = ${blockerId})
  `;

  // Dissolve any existing match between the two users
  const [a, b] = blockerId < blockedId ? [blockerId, blockedId] : [blockedId, blockerId];
  await sql()`
    DELETE FROM matches
    WHERE user1_id = ${a} AND user2_id = ${b}
  `;
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

export async function reportUser(reporterId: number, reportedId: number, reason: string): Promise<void> {
  await sql()`
    INSERT INTO reports (reporter_id, reported_id, reason)
    VALUES (${reporterId}, ${reportedId}, ${reason})
  `;
}

// ── Account Deletion ───────────────────────────────────────────

export async function deleteUserAccount(userId: number): Promise<void> {
  // Delete from user_photos
  await sql()`DELETE FROM user_photos WHERE user_id = ${userId}`;
  // Delete from photo_grades
  await sql()`DELETE FROM photo_grades WHERE user_id = ${userId}`;
  // Delete from blocks where user is involved
  await sql()`DELETE FROM blocks WHERE blocker_id = ${userId} OR blocked_id = ${userId}`;
  // Delete from reports where user is involved
  await sql()`DELETE FROM reports WHERE reporter_id = ${userId} OR reported_id = ${userId}`;
  // Delete messages sent by user
  await sql()`DELETE FROM messages WHERE sender_id = ${userId}`;
  // Delete matches involving user (cascades to messages in those matches)
  await sql()`DELETE FROM matches WHERE user1_id = ${userId} OR user2_id = ${userId}`;
  // Delete likes
  await sql()`DELETE FROM likes WHERE liker_id = ${userId} OR liked_id = ${userId}`;
  // Delete referral data
  await sql()`DELETE FROM referral_rewards WHERE referrer_user_id = ${userId} OR referee_user_id = ${userId}`;
  await sql()`DELETE FROM referral_codes WHERE user_id = ${userId}`;
  // Delete sessions
  await sql()`DELETE FROM sessions WHERE user_id = ${userId}`;
  // Delete the user record itself
  await sql()`DELETE FROM users WHERE id = ${userId}`;
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

export async function activateBoost(userId: number, durationHours = 24): Promise<void> {
  const until = new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString();
  await sql()`
    UPDATE users SET boost_until = ${until} WHERE id = ${userId}
  `;
}

export async function revealLikes(userId: number): Promise<void> {
  await sql()`
    UPDATE users SET likes_revealed = 1 WHERE id = ${userId}
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

function generateRandomSuffix(length: number = 6): string {
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

  // Get the user's display name for the prefix
  const user = await getUserById(userId);
  const prefix = (user?.display_name || "USER")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12);

  // Generate a unique code
  let code: string;
  let attempts = 0;
  do {
    code = `${prefix}-${generateRandomSuffix()}`;
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
    INSERT INTO referral_rewards (referrer_user_id, referee_user_id)
    VALUES (${referral.user_id}, ${newUserId})
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
    SELECT * FROM referral_rewards WHERE referee_user_id = ${refereeUserId}
  `;
  return rows.length > 0 ? (rows[0] as unknown as ReferralReward) : null;
}

export async function applyReferralReward(rewardId: number): Promise<void> {
  const reward = await sql()`
    SELECT * FROM referral_rewards WHERE id = ${rewardId}
  `;
  if (reward.length === 0) return;

  const r = reward[0] as unknown as ReferralReward;
  if (r.applied) return;

  // Extend referrer's subscription by 1 month
  await sql()`
    UPDATE users SET
      subscription_expires_at = COALESCE(subscription_expires_at, NOW()) + INTERVAL '1 month'
    WHERE id = ${r.referrer_user_id}
  `;

  // Extend referee's subscription by 1 month
  await sql()`
    UPDATE users SET
      subscription_expires_at = COALESCE(subscription_expires_at, NOW()) + INTERVAL '1 month'
    WHERE id = ${r.referee_user_id}
  `;

  // Mark reward as applied
  await sql()`
    UPDATE referral_rewards SET applied = true WHERE id = ${r.id}
  `;
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
