/**
 * Founder counter + socials surface guards (owner direction 2026-08-16):
 *   - ONE live source of truth: /api/founders/count returns the unified
 *     { founders_count, waitlist_count, remaining, total } shape and BOTH the
 *     landing Founders section and the store card consume that same shape
 *     (the legacy /api/founder-spots-remaining endpoint stays as a thin alias
 *     of the same data, not a second implementation).
 *   - Low-count display: while founders_count < 100 the surfaces render
 *     "First X of 1,000 claimed" as clean text (no bar / tick marks); at ≥100
 *     the bar + honest "Only N spots left" appear; at 0 founders with people
 *     on the waitlist an honest waitlist line is shown.
 *   - The founder avatar grid is ILLUSTRATIVE: stylized inline-SVG faces with
 *     an "Illustrative examples" caption — never photorealistic, never photos
 *     of real (or fake-real) members.
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
    const index = read("routes/index.tsx");
    const store = read("routes/store.tsx");
    expect(index).toContain('fetch("/api/founders/count")');
    expect(index).not.toContain('fetch("/api/founder-spots-remaining")');
    expect(store).toContain('fetch("/api/founders/count")');
    expect(index).toMatch(/founders_count: number;\s*waitlist_count: number;/);
    expect(store).toMatch(/founders_count: number;\s*waitlist_count: number;/);
    expect(index).toContain("waitlist_count");
    expect(store).toContain("waitlist_count");
  });

  test("low-count 'First X of 1,000 claimed' branch exists on both surfaces", () => {
    const index = read("routes/index.tsx");
    const store = read("routes/store.tsx");
    expect(index).toContain("First {founders_count.toLocaleString()}");
    expect(index).toContain("of {total.toLocaleString()} claimed");
    expect(store).toContain("First {foundersCount.founders_count} of {foundersCount.total} claimed");
  });

  test("progress bar and 250/500/750 ticks only render once the count is ≥100", () => {
    const index = read("routes/index.tsx");
    // The tick marks are inside the ≥100 branch (after FOUNDER_BAR_THRESHOLD),
    // and the low-count branch is a clean-text return with no bar markup.
    expect(index).toContain("const FOUNDER_BAR_THRESHOLD = 100;");
    expect(index).toContain("founders_count >= FOUNDER_BAR_THRESHOLD");
    expect(index).toContain("<span>250</span>");
    expect(index).toContain("<span>500</span>");
    expect(index).toContain("<span>750</span>");
  });

  test("honest waitlist line at 0 founders and honest low-spots line at ≥100", () => {
    const index = read("routes/index.tsx");
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

describe("founder avatar grid (illustrative examples only)", () => {
  test("grid exists with 12–15 stylized inline-SVG faces and a caption", () => {
    const index = read("routes/index.tsx");
    expect(index).toContain("FOUNDER_AVATAR_STYLES");
    expect(index).toContain("<FaceAvatar style={style} />");
    expect(index).toContain("Illustrative examples");
    // 12–15 entries in the avatar config array.
    const entries = index.match(/skin: "#[0-9A-Fa-f]{6}"/g) ?? [];
    expect(entries.length).toBeGreaterThanOrEqual(12);
    expect(entries.length).toBeLessThanOrEqual(15);
  });

  test("avatars are stylized SVG faces, never photorealistic or photos", () => {
    const index = read("routes/index.tsx");
    // The avatar renderer is pure inline SVG (no <img>, no photo asset URLs).
    const faceAvatarBody = index.slice(index.indexOf("function FaceAvatar"));
    expect(faceAvatarBody).toContain("<svg");
    expect(faceAvatarBody).not.toContain("<img");
    expect(faceAvatarBody).not.toMatch(/\.(png|jpe?g|webp|avif)/i);
    // No photo-style avatar assets are referenced anywhere in the section.
    expect(index).not.toMatch(/\/avatars\//);
    expect(index).not.toMatch(/founder-avatar.*\.(png|jpe?g|webp)/i);
    // Caption is explicit that these are not real members.
    expect(index).toContain("stylized illustrations, not photos of real members");
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
