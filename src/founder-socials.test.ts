/**
 * Founder counter + socials surface guards (owner direction 2026-08-16):
 *   - ONE live source of truth: /api/founders/count returns the unified
 *     { founders_count, waitlist_count, remaining, total } shape and BOTH the
 *     landing Founders section and the store card consume that same shape
 *     (the legacy /api/founder-spots-remaining endpoint stays as a thin alias
 *     of the same data, not a second implementation).
 *   - Live count display (A3): the Founders section always renders the real
 *     claimed count as "X of 1,000 Founder spots claimed" with a filled
 *     progress bar + 250/500/750 ticks (no count threshold); at 0 founders
 *     with people on the waitlist an honest "N on the waitlist" line is
 *     shown instead of a 0% bar. SSR seeds the count via route loaders so the
 *     HTML never shows a "Loading..." placeholder.
 *   - The admitted-illustration avatar grid was REMOVED (audit option B):
 *     no stylized SVG "member" faces anywhere — the section leads with the
 *     resolved live count bar. (Owner can add real blurred signup avatars
 *     later if a community preview is wanted.)
 *   - Social links point at the real GradeDate profiles with accessible labels
 *     and rel="noopener noreferrer".
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const SRC = path.join(import.meta.dir);
const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf8");

describe("unified founder counter surface", () => {
  test("one endpoint returns the unified shape and both surfaces read it", () => {
    const handler = read("api-handler.ts");
    // /api/founders/count is the single live source of truth…
    expect(handler).toContain('if (pathname === "/api/founders/count" && method === "GET")');
    expect(handler).toContain("return json(await getFounderClubStats());");
    // …and /api/founder-spots-remaining is a thin alias of the same data.
    expect(handler).toContain('if (pathname === "/api/founder-spots-remaining" && method === "GET")');
    expect(handler).toMatch(/getFounderClubStats\(\)[\s\S]{0,400}getFounderClubStats\(\)/);
    expect(handler).not.toMatch(/count, remaining: Math\.max\(0, 1000 - count\)/);

    const db = read("db.ts");
    expect(db).toContain("export async function getFounderClubStats");
    expect(db).toMatch(/founders_count: count, waitlist_count: waitlistCount, remaining, total: 1000/);

    // Both surfaces fetch the SAME endpoint and read the SAME unified shape.
    const index = read("pricing-sections.tsx");
    const store = read("routes/store.tsx");
    expect(index).toContain('fetch("/api/founders/count")');
    expect(index).not.toContain('fetch("/api/founder-spots-remaining")');
    expect(store).toContain('fetch("/api/founders/count")');
    expect(index).toMatch(/founders_count: number;\s*waitlist_count: number;/);
    expect(store).toMatch(/founders_count: number;\s*waitlist_count: number;/);
    expect(index).toContain("waitlist_count");
    expect(store).toContain("waitlist_count");
  });

  test("live count renders as 'X of 1,000 Founder spots claimed' (A3)", () => {
    const index = read("pricing-sections.tsx");
    const store = read("routes/store.tsx");
    // Landing/pricing counter: big number + "of 1,000 Founder spots claimed".
    expect(index).toContain("{founders_count.toLocaleString()}");
    expect(index).toContain("of {total.toLocaleString()} Founder spots claimed");
    // The store card keeps its own text form of the same live data.
    expect(store).toContain("First {foundersCount.founders_count} of {foundersCount.total} claimed");
  });

  test("progress bar and 250/500/750 ticks always render (A3 — no count threshold)", () => {
    const index = read("pricing-sections.tsx");
    // The filled bar renders for every live count (even 1 of 1,000) — the old
    // ≥100 threshold gate is gone, so the bar is the resolved, factual lead.
    expect(index).not.toContain("FOUNDER_BAR_THRESHOLD");
    expect(index).toContain("width: `${Math.max(1, (founders_count / total) * 100)}%`");
    expect(index).toContain("<span>250</span>");
    expect(index).toContain("<span>500</span>");
    expect(index).toContain("<span>750</span>");
  });

  test("honest waitlist line at 0 founders and honest low-spots line at ≥100", () => {
    const index = read("pricing-sections.tsx");
    expect(index).toContain("founders_count === 0 && waitlist_count > 0");
    expect(index).toContain("on the waitlist");
    expect(index).toContain("const FOUNDER_LOW_SPOTS = 100;");
    expect(index).toMatch(/Only \{remaining\.toLocaleString\(\)\} spot\{remaining === 1 \? "" : "s"\} left/);
    expect(index).toContain("Founders Club is full");
    // Store card mirrors the same branches.
    const store = read("routes/store.tsx");
    expect(store).toContain("foundersCount.founders_count === 0 && foundersCount.waitlist_count > 0");
    expect(store).toContain("on the waitlist");
    expect(store).toContain("Only ${foundersCount.remaining} spots left");
    expect(store).toContain("Founders Club Full");
  });
});

describe("founder avatar grid (audit option B — removed)", () => {
  test("the admitted-illustration avatar grid is gone from the Founders sections", () => {
    const index = read("pricing-sections.tsx");
    // Audit option B: no stylized-illustration avatar grid anywhere in the
    // shared Founders section (homepage + /pricing). The section now leads
    // with the resolved live count bar. The owner can supply real, blurred
    // signup avatars later if a community preview is wanted.
    expect(index).not.toContain("FOUNDER_AVATAR_STYLES");
    expect(index).not.toContain("FaceAvatar");
    expect(index).not.toContain("FounderHair");
    expect(index).not.toContain("Illustrative examples");
    expect(index).not.toContain("stylized illustrations, not photos of real members");
  });
});

describe("socials credibility (real GradeDate profiles)", () => {
  test("landing has a Follow-us strip with both profiles", () => {
    const index = read("routes/index.tsx");
    expect(index).toContain("Follow us");
    expect(index).toMatch(/href="https:\/\/x\.com\/gradedate"[\s\S]{0,200}target="_blank"[\s\S]{0,200}rel="noopener noreferrer"/);
    expect(index).toMatch(/href="https:\/\/www\.tiktok\.com\/@gradedate"[\s\S]{0,200}target="_blank"[\s\S]{0,200}rel="noopener noreferrer"/);
    expect(index).toContain('aria-label="GradeDate on X"');
    expect(index).toContain('aria-label="GradeDate on TikTok"');
    expect(index).toContain("<XIcon");
    expect(index).toContain("<TikTokIcon");
  });

  test("footer links include both profiles with the same safety attributes", () => {
    const root = read("routes/__root.tsx");
    expect(root).toContain('href="https://x.com/gradedate"');
    expect(root).toContain('href="https://www.tiktok.com/@gradedate"');
    expect(root).toContain('aria-label="GradeDate on X"');
    expect(root).toContain('aria-label="GradeDate on TikTok"');
    expect(root).toContain('rel="noopener noreferrer"');
    expect(root).toContain('target="_blank"');
  });
});
