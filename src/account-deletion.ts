/**
 * Focused, dependency-free pieces of the account-deletion flow.
 *
 * Kept separate from db.ts so the deletion contract can be unit-tested
 * without a database (repo convention: pure logic in its own module, e.g.
 * grade-card-access.ts).
 */

/** Minimal tagged-template query shape — matches Neon's transaction query fn. */
export type TemplateQuery = (
  strings: TemplateStringsArray,
  ...params: unknown[]
) => unknown;

/**
 * Build the ordered list of DELETE statements that erase every user-owned row.
 *
 * All of these tables reference `users(id)`; several also carry
 * `ON DELETE CASCADE`, but the explicit statements keep the contract
 * self-documenting and immune to schema drift. The final statement deletes
 * the user row itself, so it MUST be last.
 *
 * Coverage:
 * - messages: both sent by the user and received inside the user's matches
 * - matches, likes, blocks, reports: both directions
 * - referral_rewards has NO cascade on users(id) — must be explicit
 * - sessions: full session invalidation (all devices)
 * - photos/grades/badges/entitlements/tokens/push: user-owned records
 */
export function buildAccountDeletionQueries<T>(
  userId: number,
  txn: (strings: TemplateStringsArray, ...params: unknown[]) => T,
): T[] {
  return [
    txn`DELETE FROM messages WHERE sender_id = ${userId}`,
    txn`DELETE FROM messages WHERE match_id IN (SELECT id FROM matches WHERE user1_id = ${userId} OR user2_id = ${userId})`,
    txn`DELETE FROM matches WHERE user1_id = ${userId} OR user2_id = ${userId}`,
    txn`DELETE FROM likes WHERE liker_id = ${userId} OR liked_id = ${userId}`,
    txn`DELETE FROM blocks WHERE blocker_id = ${userId} OR blocked_id = ${userId}`,
    txn`DELETE FROM reports WHERE reporter_id = ${userId} OR reported_id = ${userId}`,
    txn`DELETE FROM referral_rewards WHERE referrer_user_id = ${userId} OR referee_user_id = ${userId}`,
    txn`DELETE FROM referral_codes WHERE user_id = ${userId}`,
    txn`DELETE FROM user_photos WHERE user_id = ${userId}`,
    txn`DELETE FROM photo_grades WHERE user_id = ${userId}`,
    txn`DELETE FROM password_reset_tokens WHERE user_id = ${userId}`,
    txn`DELETE FROM push_subscriptions WHERE user_id = ${userId}`,
    txn`DELETE FROM paid_upsell_entitlements WHERE user_id = ${userId}`,
    txn`DELETE FROM user_badges WHERE user_id = ${userId}`,
    txn`DELETE FROM sessions WHERE user_id = ${userId}`,
    txn`DELETE FROM users WHERE id = ${userId}`,
  ];
}

/**
 * Collect the photo storage paths owned by a user from the three DB sources:
 * the profile photo column (`users.photo_path`), the multi-photo gallery
 * (`user_photos.photo_path`) and graded photos (`photo_grades.photo_path`).
 *
 * Ownership scoping happens at the DB layer (rows are queried with
 * `WHERE user_id = <id>`); this helper only de-duplicates and drops empty
 * values, preserving first-seen order for deterministic cleanup.
 */
export function collectOwnedPhotoPaths(
  profilePhotoPath: string | null | undefined,
  galleryPaths: Array<string | null | undefined>,
  gradePaths: Array<string | null | undefined>,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [profilePhotoPath, ...galleryPaths, ...gradePaths]) {
    if (!raw) continue;
    const path = raw.trim();
    if (!path || seen.has(path)) continue;
    seen.add(path);
    out.push(path);
  }
  return out;
}
