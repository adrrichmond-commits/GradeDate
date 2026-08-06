import { describe, expect, test } from "bun:test";
import { buildAccountDeletionQueries, collectOwnedPhotoPaths } from "./account-deletion";

/** Every table in the schema that references users(id) and must be emptied. */
const ALL_USER_OWNED_TABLES = [
  "messages",
  "matches",
  "likes",
  "blocks",
  "reports",
  "referral_rewards",
  "referral_codes",
  "user_photos",
  "photo_grades",
  "password_reset_tokens",
  "push_subscriptions",
  "paid_upsell_entitlements",
  "user_badges",
  "sessions",
  "users",
];

/** Capture the generated statements as (sql, params) pairs via a fake txn fn. */
function captureQueries(userId: number) {
  const captured: { sql: string; params: unknown[] }[] = [];
  const txn = (strings: TemplateStringsArray, ...params: unknown[]) => {
    let sql = "";
    strings.forEach((s, i) => {
      sql += s;
      if (i < params.length) sql += `$${i + 1}`;
    });
    captured.push({ sql, params });
    return `result-${captured.length}`;
  };
  const results = buildAccountDeletionQueries(userId, txn);
  return { captured, results };
}

describe("account deletion queries", () => {
  test("covers every user-owned table exactly once", () => {
    const { captured } = captureQueries(7);
    const tables = captured.map((q) => q.sql.match(/^DELETE FROM (\w+)/)?.[1]);
    // messages has two statements (sent + received); every other table once.
    expect(captured).toHaveLength(ALL_USER_OWNED_TABLES.length + 1);
    for (const table of ALL_USER_OWNED_TABLES) {
      expect(tables).toContain(table);
    }
    // Unique tables exactly match the full user-owned set, no table twice.
    expect(new Set(tables).size).toBe(ALL_USER_OWNED_TABLES.length);
  });

  test("parameterizes every statement with the target user id (no inline id)", () => {
    const { captured } = captureQueries(42);
    for (const q of captured) {
      expect(q.params).toContain(42);
      expect(q.sql).not.toContain("42");
    }
  });

  test("deletes the user row last", () => {
    const { captured } = captureQueries(1);
    expect(captured[captured.length - 1].sql).toBe("DELETE FROM users WHERE id = $1");
    expect(captured[captured.length - 1].params).toEqual([1]);
  });

  test("scopes messages to both sent and received", () => {
    const { captured } = captureQueries(5);
    const messageQueries = captured.filter((q) => q.sql.startsWith("DELETE FROM messages"));
    expect(messageQueries).toHaveLength(2);
    expect(messageQueries[0].sql).toContain("sender_id");
    expect(messageQueries[1].sql).toContain("match_id");
  });

  test("invalidates every session for the user (full session invalidation)", () => {
    const { captured } = captureQueries(9);
    const sessions = captured.find((q) => q.sql.startsWith("DELETE FROM sessions"));
    expect(sessions).toBeDefined();
    expect(sessions!.params).toEqual([9]);
  });

  test("explicitly clears the non-cascading referral_rewards table", () => {
    const { captured } = captureQueries(3);
    const rewards = captured.find((q) => q.sql.startsWith("DELETE FROM referral_rewards"));
    expect(rewards).toBeDefined();
    expect(rewards!.sql).toContain("referrer_user_id");
    expect(rewards!.sql).toContain("referee_user_id");
  });
});

describe("collectOwnedPhotoPaths", () => {
  test("collects from profile, gallery, and grade sources, preserving order", () => {
    const paths = collectOwnedPhotoPaths(
      "/uploads/7_profile.jpg",
      ["/uploads/7_2.jpg", "/uploads/7_3.jpg"],
      ["/uploads/7_2.jpg", "https://blob.example/7_4.jpg"],
    );
    expect(paths).toEqual([
      "/uploads/7_profile.jpg",
      "/uploads/7_2.jpg",
      "/uploads/7_3.jpg",
      "https://blob.example/7_4.jpg",
    ]);
  });

  test("deduplicates across sources, keeping the first occurrence", () => {
    const paths = collectOwnedPhotoPaths(
      "/uploads/7_1.jpg",
      ["/uploads/7_1.jpg", "/uploads/7_2.jpg"],
      ["/uploads/7_2.jpg"],
    );
    expect(paths).toEqual(["/uploads/7_1.jpg", "/uploads/7_2.jpg"]);
  });

  test("filters null, undefined, and whitespace-only entries", () => {
    const paths = collectOwnedPhotoPaths(null, ["", undefined, "   "], [null, " \t "]);
    expect(paths).toEqual([]);
  });

  test("returns an empty list when the user owns no photos", () => {
    expect(collectOwnedPhotoPaths(undefined, [], [])).toEqual([]);
  });
});
