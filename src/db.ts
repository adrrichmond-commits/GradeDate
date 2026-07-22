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
      id, display_name, age, gender, bio, photo_path, grade
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
    ORDER BY ABS(grade - ${grade}) ASC${
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
