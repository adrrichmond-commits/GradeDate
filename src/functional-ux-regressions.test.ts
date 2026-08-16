import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

// Regression tests for the 2026-08-16 full-stack functional UX review.
// These are source-scan tests (same pattern as matches-feed-sql.test.ts):
// each fix is a structural invariant that a future refactor could silently
// regress, and the pure-logic pieces are unit-tested in matches-action.test.ts.

const matchesSource = readFileSync(
  new URL("./routes/matches.tsx", import.meta.url),
  "utf8",
);
const dbSource = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const rootSource = readFileSync(
  new URL("./routes/__root.tsx", import.meta.url),
  "utf8",
);
const subscribeSource = readFileSync(
  new URL("./routes/subscribe.tsx", import.meta.url),
  "utf8",
);

describe("H1 — match-celebration auto-advance timer is cancellable", () => {
  test("the auto-advance timer is stored in a ref, never fire-and-forget", () => {
    expect(matchesSource).toMatch(/celebrationTimerRef\.current = setTimeout\(/);
  });
  test("closeCelebration clears the pending timer before closing", () => {
    const closeStart = matchesSource.indexOf(
      "const closeCelebration = useCallback(",
    );
    expect(closeStart).toBeGreaterThan(-1);
    const closeBody = matchesSource.slice(
      closeStart,
      closeStart + 400,
    );
    expect(closeBody).toContain("clearTimeout(celebrationTimerRef.current)");
    expect(closeBody).toContain("setMatchCelebration(null)");
  });
  test("the timer is cleared on unmount too", () => {
    const unmountCleanup = matchesSource.slice(
      matchesSource.indexOf("// Clear any pending celebration auto-advance timer"),
      matchesSource.indexOf("const fetchLikesRemaining"),
    );
    expect(unmountCleanup).toContain("clearTimeout(celebrationTimerRef.current)");
    expect(unmountCleanup).toContain("useEffect");
  });
  test("both celebration buttons close through the cancel-aware path", () => {
    const closeCalls = matchesSource.match(/onClick=\{closeCelebration\}/g);
    expect(closeCalls?.length ?? 0).toBe(2);
    // The old bare setter must be gone — it never cancelled the timer.
    expect(matchesSource).not.toContain(
      "onClick={() => setMatchCelebration(null)}",
    );
  });
});

describe("H2 — matches feed excludes already-matched users", () => {
  test("getUsersByGradeRange filters out users already matched with me", () => {
    const funcStart = dbSource.indexOf(
      "export async function getUsersByGradeRange",
    );
    expect(funcStart).toBeGreaterThan(-1);
    const templateStart = dbSource.indexOf("const rows = await sql()`", funcStart);
    const templateEnd = dbSource.indexOf("return (rows as any[])", funcStart);
    expect(templateStart).toBeGreaterThan(-1);
    expect(templateEnd).toBeGreaterThan(templateStart);
    const sql = dbSource.slice(templateStart, templateEnd);
    // The exclusion must cover BOTH directions of the matches table
    // (user1_id/user2_id are the real column names — not user_a/user_b).
    expect(sql).toMatch(/NOT EXISTS \([\s\S]*?SELECT 1 FROM matches m/);
    expect(sql).toContain(
      "m.user1_id = users.id AND m.user2_id = ${excludeUserId}",
    );
    expect(sql).toContain(
      "m.user2_id = users.id AND m.user1_id = ${excludeUserId}",
    );
  });
});

describe("H3 — inappropriate-photo reports carry the photo", () => {
  test("the report POST includes photo_id when the reason is inappropriate_photo", () => {
    expect(matchesSource).toContain('reason: reportReason');
    expect(matchesSource).toContain(
      'reportReason === "inappropriate_photo"',
    );
    expect(matchesSource).toContain("photo_id: reportPhotoId");
  });
  test("the server handler reads photo_id from the report body", () => {
    const handler = readFileSync(
      new URL("./api-handler.ts", import.meta.url),
      "utf8",
    );
    // handleReport must keep reading body.photo_id — the deck sends that key.
    expect(handler).toContain("const targetPhotoId = body?.photo_id;");
    expect(handler).toContain(
      'if (reason === "inappropriate_photo" && targetPhotoId)',
    );
  });
});

describe("M1 — suspended users can discover the appeal path", () => {
  test("the match-action error mapper returns a suspension sentinel", () => {
    const actionSource = readFileSync(
      new URL("./matches-action.ts", import.meta.url),
      "utf8",
    );
    expect(actionSource).toContain(
      'if (data?.code === "ACCOUNT_SUSPENDED") return "ACCOUNT_SUSPENDED";',
    );
  });
  test("the matches page renders an /appeal banner instead of a raw error", () => {
    expect(matchesSource).toContain("ACCOUNT_SUSPENDED");
    expect(matchesSource).toContain("Your account has been suspended");
    expect(matchesSource).toContain('to="/appeal"');
  });
  test("the footer links to /appeal", () => {
    expect(rootSource).toContain('<Link to="/appeal"');
    expect(rootSource).toContain("Appeal a Suspension");
  });
});

describe("M2 — cancellation copy is honest (no self-serve cancel exists)", () => {
  test("subscribe page points to /contact instead of promising cancel-anytime", () => {
    expect(subscribeSource).toContain("contact us to cancel");
    expect(subscribeSource).toContain('to="/contact"');
    expect(subscribeSource).not.toMatch(/cancel anytime/i);
  });
});

describe("M3 — like/pass double-fire is blocked synchronously", () => {
  test("handleLike checks and sets the busy ref in the same tick", () => {
    expect(matchesSource).toContain(
      "if (!current || animState !== null || actionBusyRef.current) return;",
    );
    expect(matchesSource).toContain("actionBusyRef.current = true;");
    expect(matchesSource).toContain("actionBusyRef.current = false;");
  });
});

describe("M4 — likes badge refreshes when the tab regains focus", () => {
  test("a window focus listener refetches the likes count", () => {
    expect(matchesSource).toContain(
      'window.addEventListener("focus", onFocus)',
    );
    expect(matchesSource).toContain(
      'return () => window.removeEventListener("focus", onFocus)',
    );
    expect(matchesSource).toMatch(
      /onFocus = \(\) => \{[\s\S]*?fetchLikesRemaining\(\)/,
    );
  });
});

describe("LOW — trial users are Premium: no Subscribe CTA in the nav", () => {
  test("the desktop nav gates the Subscribe CTA on isPremiumUser", () => {
    expect(rootSource).toContain("{!isPremiumUser(user) && (");
  });
});
