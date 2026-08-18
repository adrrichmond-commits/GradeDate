import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
// Regression tests for the admin-console delta polish (design spec
// 2026-08-17, delegation 8a5a5014). Same source-scan pattern as
// admin-console-hardening.test.ts: each item is a structural invariant that a
// future refactor could silently regress. The pure helpers are unit-tested in
// admin-ui.test.ts / suspensions.test.ts.
const admin = readFileSync(join(import.meta.dir, "routes", "admin.index.tsx"), "utf8");
const api = readFileSync(join(import.meta.dir, "api-handler.ts"), "utf8");
const db = readFileSync(join(import.meta.dir, "db.ts"), "utf8");
const adminUi = readFileSync(join(import.meta.dir, "admin-ui.ts"), "utf8");
const suspensions = readFileSync(join(import.meta.dir, "suspensions.ts"), "utf8");

describe("M1 — appeal text in the admin appeals queue", () => {
  test("admin GET /api/admin/appeals returns a truncated text excerpt", () => {
    expect(api).toContain("text:truncateAppealText(text)");
    expect(api).toContain("truncateAppealText");
  });
  test("the user-facing status endpoint never selects the raw text", () => {
    // handleSuspensionAppeal GET still whitelists the same five fields as before.
    const userFacing = api.slice(api.indexOf("async function handleSuspensionAppeal"), api.indexOf("async function handleSuspensionAdmin"));
    expect(userFacing).toMatch(/getAppeals\(user\.id\)\)\.map\(\(\{id,suspension_id,status,created_at,reviewed_at\}\)/);
    // Truncation is applied in the ADMIN handler only, never in the user-facing one.
    expect(userFacing).not.toContain("truncateAppealText");
  });
  test("the appeals query includes text and truncation lives in suspensions.ts", () => {
    expect(db).toMatch(/SELECT id,suspension_id,user_id,status,created_at,reviewed_at,text FROM appeals/);
    expect(suspensions).toContain("APPEAL_TEXT_ADMIN_MAX = 600");
    expect(suspensions).toContain("export function truncateAppealText");
  });
  test("the appeals row renders the excerpt as a blockquote", () => {
    expect(admin).toContain("{a.text && (");
    expect(admin).toContain("<blockquote");
  });
});

describe("M2 — live photo-review expiry countdown", () => {
  test("ExpiryCountdown ticks once per second and clears on unmount", () => {
    expect(admin).toContain("function ExpiryCountdown");
    expect(admin).toContain("setInterval(() => setNow(Date.now()), 1000)");
    expect(admin).toContain("clearInterval(id)");
  });
  test("turns red below 60s and shows the expired copy at zero", () => {
    expect(admin).toContain('ms < 60_000 ? "mt-1 text-[11px] text-red-400"');
    expect(admin).toContain("Access expired — reload to refresh");
    expect(admin).toContain("Access expires in ${formatCountdown(ms)}");
  });
  test("the static expiry line is gone — only the live countdown renders", () => {
    expect(admin).not.toContain("Signed review access expires");
  });
});

describe("M3 — photo Remove is a two-step confirm", () => {
  test("the Remove action arms a confirm with the policy copy", () => {
    expect(admin).toContain('a.status === "removed" ? (');
    expect(admin).toContain("This hides the photo and marks it unsafe. Evidence is retained per policy.");
    expect(admin).toContain("ConfirmButton");
  });
});

describe("M4 — underage zero-tolerance callout on photo cases", () => {
  test("underage reason or source renders the red callout", () => {
    expect(admin).toContain('item.reason === "underage" || item.source === "underage_report"');
    expect(admin).toContain("Zero-tolerance: account locked pending review. Photos quarantined. Evidence retained.");
  });
});

describe("M5/M6 — appeal deny and revoke are two-step confirms", () => {
  test("deny arms a confirm explaining denial is final", () => {
    expect(admin).toContain("Deny the appeal. The suspension stays in place and the user cannot appeal again.");
    expect(admin).toContain('confirmLabel="Confirm deny"');
  });
  test("revoke arms a confirm and grant stays one-click owner/admin only", () => {
    expect(admin).toContain('confirmLabel="Confirm revoke"');
    expect(admin).toContain("Grant appeal");
    // Grant and Revoke are hidden from non-owner/admin (spec: isOwnerAdminRole).
    expect(admin).toContain("{ownerAdmin && (");
  });
});

describe("M7/M8 — cohort progress and cohort-full state", () => {
  test("CohortProgress renders a rose fill on a gray track with an honest count", () => {
    expect(admin).toContain("function CohortProgress");
    expect(admin).toContain("h-2 rounded-full bg-gray-800");
    expect(admin).toContain("bg-rose-500");
    expect(admin).toContain("{redeemed} of {cap} codes redeemed");
  });
  test("a full cohort disables issuing and shows the amber copy", () => {
    expect(admin).toContain("const cohortFull = stats?.cohort.remaining === 0;");
    expect(admin).toContain("canIssue = (waitlist?.entries.length ?? 0) > 0 && !cohortFull");
    expect(admin).toContain("Cohort full — new signups automatically join the waitlist.");
  });
});

describe("M9 — waitlist pagination", () => {
  test("the waitlist fetch carries limit and offset", () => {
    expect(admin).toContain('adminGet(`/api/admin/waitlist?limit=${WAITLIST_PAGE}&offset=${offset}`)');
    expect(admin).toContain("useEffect(() => { void load(); }, [reloadKey, offset]);");
  });
  test("a Pager shows Previous/Next and an honest Showing X–Y of N line", () => {
    expect(admin).toContain("function Pager");
    expect(admin).toContain("Showing {start}–{end} of {total}");
    expect(admin).toContain(">Previous</ActionButton>");
    expect(admin).toContain(">Next</ActionButton>");
    expect(admin).toContain("<Pager offset={offset} limit={WAITLIST_PAGE}");
  });
  test("selection is pruned to the current page on reload", () => {
    expect(admin).toContain("new Set([...prev].filter((id) => valid.has(id)))");
  });
});

describe("a11y — per-tab live regions and filter-pill pressed state", () => {
  test("every tab declares a polite live region", () => {
    expect(admin).toContain("function QueueLiveRegion");
    expect(admin).toContain('aria-live="polite"');
    expect(admin).toContain("role=\"status\" className=\"sr-only\"");
    expect(admin).toContain("<QueueLiveRegion message={announce} />");
  });
  test("status filter pills carry aria-pressed", () => {
    const pills = admin.match(/aria-pressed=\{statusFilter === s\}/g);
    expect(pills?.length ?? 0).toBeGreaterThanOrEqual(3);
  });
});

describe("shared helpers are unit-testable and exported", () => {
  test("admin-ui exports the countdown and age helpers", () => {
    expect(adminUi).toContain("export function formatCountdown");
    expect(adminUi).toContain("export function formatAge");
    expect(adminUi).toContain("export function isQueueStale");
    expect(adminUi).toContain("QUEUE_STALE_MS");
  });
  test("the reports tab renders the queue-age chip", () => {
    expect(admin).toContain("<QueueAge createdAt={report.created_at} />");
    expect(admin).toContain("queued {formatAge(createdAt)}");
  });
});
