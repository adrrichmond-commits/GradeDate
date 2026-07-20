import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(import.meta.dir, "..", "data");
mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, "gradedate.db");

let _db: Database | null = null;

function getDb(): Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.run("PRAGMA journal_mode=WAL");
    _db.run("PRAGMA foreign_keys=ON");
    initTables(_db);
  }
  return _db;
}

function initTables(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT,
      age INTEGER,
      gender TEXT,
      bio TEXT,
      photo_path TEXT,
      grade INTEGER,
      subscription_status TEXT DEFAULT 'inactive',
      subscription_updated_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Add subscription_updated_at column if missing (migration-safe)
  const cols = db
    .query("PRAGMA table_info(users)")
    .all() as { name: string }[];
  if (!cols.some((c) => c.name === "subscription_updated_at")) {
    db.run(
      "ALTER TABLE users ADD COLUMN subscription_updated_at TEXT",
    );
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS likes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      liker_id INTEGER NOT NULL,
      liked_id INTEGER NOT NULL,
      action TEXT NOT NULL DEFAULT 'like',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (liker_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (liked_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(liker_id, liked_id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user1_id INTEGER NOT NULL,
      user2_id INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user1_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (user2_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user1_id, user2_id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id INTEGER NOT NULL,
      sender_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
      FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
}

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
  created_at: string;
}

export interface Session {
  id: string;
  user_id: number;
  created_at: string;
}

// ── User queries ──────────────────────────────────────────────

export function createUser(
  email: string,
  passwordHash: string,
): User {
  const db = getDb();
  const stmt = db.prepare(
    "INSERT INTO users (email, password_hash) VALUES (?, ?)",
  );
  const result = stmt.run(email, passwordHash);
  return getUserById(Number(result.lastInsertRowid))!;
}

export function getUserByEmail(email: string): User | null {
  const db = getDb();
  return db
    .query("SELECT * FROM users WHERE email = ?")
    .get(email) as User | null;
}

export function getUserById(id: number): User | null {
  const db = getDb();
  return db
    .query("SELECT * FROM users WHERE id = ?")
    .get(id) as User | null;
}

export function updateUserProfile(
  id: number,
  data: {
    display_name: string;
    age: number;
    gender: string;
    bio: string;
    photo_path: string;
  },
): void {
  const db = getDb();
  db.run(
    `UPDATE users SET display_name = ?, age = ?, gender = ?, bio = ?, photo_path = ? WHERE id = ?`,
    [data.display_name, data.age, data.gender, data.bio, data.photo_path, id],
  );
}

// ── Session queries ───────────────────────────────────────────

export function createSession(userId: number): Session {
  const db = getDb();
  const id = crypto.randomUUID();
  db.run("INSERT INTO sessions (id, user_id) VALUES (?, ?)", [id, userId]);
  return { id, user_id: userId, created_at: new Date().toISOString() };
}

export function getSessionById(sessionId: string): Session | null {
  const db = getDb();
  return db
    .query("SELECT * FROM sessions WHERE id = ?")
    .get(sessionId) as Session | null;
}

export function deleteSession(sessionId: string): void {
  const db = getDb();
  db.run("DELETE FROM sessions WHERE id = ?", [sessionId]);
}

// ── Grade ────────────────────────────────────────────────────

export function updateUserGrade(userId: number, grade: number): void {
  const db = getDb();
  db.run("UPDATE users SET grade = ? WHERE id = ?", [grade, userId]);
}

// ── Subscription ─────────────────────────────────────────────

export function updateSubscriptionStatus(
  userId: number,
  status: string,
): void {
  const db = getDb();
  db.run(
    "UPDATE users SET subscription_status = ?, subscription_updated_at = datetime('now') WHERE id = ?",
    [status, userId],
  );
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

export function getUsersByGradeRange(
  grade: number,
  min: number,
  max: number,
  excludeUserId: number,
): MatchUser[] {
  const db = getDb();
  return db
    .query(
      `SELECT id, display_name, age, gender, bio, photo_path, grade
       FROM users
       WHERE grade IS NOT NULL
         AND grade >= ?
         AND grade <= ?
         AND photo_path IS NOT NULL
         AND photo_path != ''
         AND id != ?
       ORDER BY ABS(grade - ?) ASC, RANDOM()`,
    )
    .all(min, max, excludeUserId, grade) as MatchUser[];
}

// ── Likes ────────────────────────────────────────────────────

export interface Like {
  id: number;
  liker_id: number;
  liked_id: number;
  action: string;
  created_at: string;
}

export function recordLike(likerId: number, likedId: number, action: string = "like"): void {
  const db = getDb();
  db.run(
    "INSERT OR REPLACE INTO likes (liker_id, liked_id, action) VALUES (?, ?, ?)",
    [likerId, likedId, action],
  );
}

export function getLike(likerId: number, likedId: number): Like | null {
  const db = getDb();
  return db
    .query("SELECT * FROM likes WHERE liker_id = ? AND liked_id = ?")
    .get(likerId, likedId) as Like | null;
}

// ── Matches ──────────────────────────────────────────────────

export interface Match {
  id: number;
  user1_id: number;
  user2_id: number;
  created_at: string;
}

export function createMatch(user1Id: number, user2Id: number): Match | null {
  const db = getDb();
  // Ensure user1_id < user2_id to avoid duplicates
  const [a, b] = user1Id < user2Id ? [user1Id, user2Id] : [user2Id, user1Id];
  try {
    db.run(
      "INSERT INTO matches (user1_id, user2_id) VALUES (?, ?)",
      [a, b],
    );
    const match = db
      .query("SELECT * FROM matches WHERE user1_id = ? AND user2_id = ?")
      .get(a, b) as Match | null;
    return match;
  } catch {
    // Duplicate — already matched
    return db
      .query("SELECT * FROM matches WHERE user1_id = ? AND user2_id = ?")
      .get(a, b) as Match | null;
  }
}

export function getMatchById(matchId: number): Match | null {
  const db = getDb();
  return db
    .query("SELECT * FROM matches WHERE id = ?")
    .get(matchId) as Match | null;
}

export function isMatch(user1Id: number, user2Id: number): boolean {
  const db = getDb();
  const [a, b] = user1Id < user2Id ? [user1Id, user2Id] : [user2Id, user1Id];
  const row = db
    .query("SELECT id FROM matches WHERE user1_id = ? AND user2_id = ?")
    .get(a, b);
  return row !== null;
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

export function getMatchesForUser(userId: number): MatchWithUser[] {
  const db = getDb();
  return db
    .query(
      `SELECT
         m.id AS match_id,
         CASE WHEN m.user1_id = ? THEN m.user2_id ELSE m.user1_id END AS user_id,
         u.display_name,
         u.photo_path,
         (SELECT msg.content FROM messages msg WHERE msg.match_id = m.id ORDER BY msg.created_at DESC LIMIT 1) AS last_message,
         (SELECT msg.created_at FROM messages msg WHERE msg.match_id = m.id ORDER BY msg.created_at DESC LIMIT 1) AS last_message_at,
         m.created_at AS match_created_at
       FROM matches m
       JOIN users u ON u.id = CASE WHEN m.user1_id = ? THEN m.user2_id ELSE m.user1_id END
       WHERE m.user1_id = ? OR m.user2_id = ?
       ORDER BY COALESCE(last_message_at, m.created_at) DESC`,
    )
    .all(userId, userId, userId, userId) as MatchWithUser[];
}

// ── Messages ─────────────────────────────────────────────────

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

export function createMessage(
  matchId: number,
  senderId: number,
  content: string,
): Message {
  const db = getDb();
  db.run(
    "INSERT INTO messages (match_id, sender_id, content) VALUES (?, ?, ?)",
    [matchId, senderId, content],
  );
  return db
    .query("SELECT * FROM messages WHERE id = last_insert_rowid()")
    .get() as Message;
}

export function getMessages(
  matchId: number,
  limit = 50,
  beforeId?: number,
): MessageWithSender[] {
  const db = getDb();
  if (beforeId) {
    return db
      .query(
        `SELECT msg.*, u.display_name AS sender_name, u.photo_path AS sender_photo
         FROM messages msg
         JOIN users u ON u.id = msg.sender_id
         WHERE msg.match_id = ? AND msg.id < ?
         ORDER BY msg.created_at DESC
         LIMIT ?`,
      )
      .all(matchId, beforeId, limit) as MessageWithSender[];
  }
  return db
    .query(
      `SELECT msg.*, u.display_name AS sender_name, u.photo_path AS sender_photo
       FROM messages msg
       JOIN users u ON u.id = msg.sender_id
       WHERE msg.match_id = ?
       ORDER BY msg.created_at DESC
       LIMIT ?`,
    )
    .all(matchId, limit) as MessageWithSender[];
}

export function getUnreadMessageCount(userId: number): number {
  const db = getDb();
  const row = db
    .query(
      `SELECT COUNT(*) AS cnt
       FROM messages msg
       JOIN matches m ON m.id = msg.match_id
       WHERE (m.user1_id = ? OR m.user2_id = ?)
         AND msg.sender_id != ?
         AND msg.read = 0`,
    )
    .get(userId, userId, userId) as { cnt: number } | null;
  return row?.cnt ?? 0;
}

export function markMessagesRead(matchId: number, readerId: number): void {
  const db = getDb();
  db.run(
    `UPDATE messages SET read = 1
     WHERE match_id = ? AND sender_id != ? AND read = 0`,
    [matchId, readerId],
  );
}

export { getDb };
