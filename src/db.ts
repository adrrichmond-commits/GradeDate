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
}

// ── Types ──────────────────────────────────────────────────────

export interface User {
  id: number;
  email: string;
  password_hash: string;
  display_name: string | null;
  age: number | null;
  gender: string | null;
  bio: string | null;
  photo_path: string | null;
  grade: number | null;
  subscription_status: string;
  subscription_updated_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  created_at: string;
}

export interface Session {
  id: string;
  user_id: number;
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
): Promise<User> {
  const rows = await sql()`
    INSERT INTO users (email, password_hash)
    VALUES (${email}, ${passwordHash})
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
    bio: string;
    photo_path: string;
  },
): Promise<void> {
  await sql()`
    UPDATE users SET
      display_name = ${data.display_name},
      age = ${data.age},
      gender = ${data.gender},
      bio = ${data.bio},
      photo_path = ${data.photo_path}
    WHERE id = ${id}
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
): Promise<MatchUser[]> {
  const rows = await sql()`
    SELECT id, display_name, age, gender, bio, photo_path, grade
    FROM users
    WHERE grade IS NOT NULL
      AND grade >= ${min}
      AND grade <= ${max}
      AND photo_path IS NOT NULL
      AND photo_path != ''
      AND id != ${excludeUserId}
    ORDER BY ABS(grade - ${grade}) ASC, RANDOM()
  `;
  return rows as unknown as MatchUser[];
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
