/**
 * /how-we-compare page surface guards (owner decision 2026-08-19).
 *
 * Pins the page to the GradeDate-first, honest-copy rules:
 *   - The route file exists at /how-we-compare with its own head().
 *   - The page is framed entirely around GradeDate's own approach and does
 *     NOT name or make claims about any specific competitor — we only claim
 *     what WE ship (coach-not-judge, city percentile, 80/20 grade/geography
 *     feed, mandatory gov-ID + selfie age verification in beta, AI photo +
 *     message moderation, zero tolerance, free-to-start $5.99/mo Premium,
 *     Founders price lock).
 *   - An honest "weigh us against any app" note steers readers to each app's
 *     own published materials instead of making claims about other apps.
 *   - Wiring: footer link, /llms.txt entry, and FAQPage/WebPage JSON-LD
 *     emitted by RootDocument for this pathname from the same
 *     HOW_WE_COMPARE_FAQ_ITEMS source the visible FAQ renders from.
 *   - The legacy /vs/scimatch path is a 308 redirect stub to /how-we-compare,
 *     so old bookmarks don't 404 and no competitor brand is repeated on the
 *     app.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { HOW_WE_COMPARE_FAQ_ITEMS, HOW_WE_COMPARE_LD_JSON } from "./structured-data";

const SRC = path.join(import.meta.dir);
const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf8");
const route = read("routes/how-we-compare.tsx");
const redirect = read("routes/vs.scimatch.tsx");

describe("/how-we-compare page exists and resolves", () => {
  test("route file defines the /how-we-compare path", () => {
    expect(route).toContain('createFileRoute("/how-we-compare")');
  });

  test("carries its own honest GradeDate-first head() meta", () => {
    expect(route).toContain("head: () =>");
    expect(route).toContain("staticPageHead(");
    expect(route).toContain("How GradeDate compares");
    expect(route).toContain('import { staticPageHead } from "~/route-heads";');
  });

  test("footer links to the new page, not the old path", () => {
    const root = read("routes/__root.tsx");
    expect(root).toContain('to="/how-we-compare"');
    expect(root).toContain("How we compare");
    expect(root).not.toContain('to="/vs/scimatch"');
    expect(root).not.toContain("vs SciMatch");
  });

  test("/llms.txt lists the new page URL and drops the old path", () => {
    const llms = readFileSync(path.join(SRC, "..", "public", "llms.txt"), "utf8");
    expect(llms).toContain("https://gradedate.app/how-we-compare");
    expect(llms).not.toContain("/vs/scimatch");
  });
});

describe("no competitor is named or disparaged anywhere on the page", () => {
  test("the page, FAQ, and WebPage schema never name another dating app", () => {
    for (const competitor of ["SciMatch", "sci match", "Tinder", "Hinge", "Bumble", "Match.com", "eHarmony", "OKCupid"]) {
      expect(route, `page must not name: ${competitor}`).not.toContain(competitor);
    }
    for (const item of HOW_WE_COMPARE_FAQ_ITEMS) {
      expect(item.q + " " + item.a, "FAQ must not name a competitor").not.toMatch(/SciMatch|Tinder|Hinge|Bumble/i);
    }
    for (const json of HOW_WE_COMPARE_LD_JSON) {
      expect(JSON.stringify(json), "JSON-LD must not name a competitor").not.toMatch(/SciMatch|Tinder|Hinge|Bumble/i);
    }
  });

  test("no disparaging language about any other app", () => {
    for (const banned of ["lies", "manipulates", "manipulating", "scam", "rip-off", "worse than"]) {
      expect(route, `must not use: ${banned}`).not.toContain(banned);
    }
  });

  test("steers readers to each app's own published materials instead of claiming", () => {
    expect(route).toContain("make claims about other apps");
    expect(route).toContain("own published materials");
    expect(route).toContain("instead of guessing");
  });
});

describe("GradeDate claims are only what the product actually ships", () => {
  test("page carries only shipped, verifiable product facts", () => {
    expect(route).toContain("$5.99/month");
    expect(route).toContain("80% people in your appearance range");
    expect(route).toContain("city percentile");
    expect(route).toContain("strongest profile picture");
    expect(route).toContain("Austin, TX");
    expect(route).toContain("government ID (document + selfie)");
    expect(route).toContain("Zero tolerance");
    expect(route).toContain("1 free regrade per week");
    expect(route).toContain("3 likes per day");
    // The demo grader is honestly labeled "simulated preview" in the FAQ source
    // (structured-data), the same source that feeds this page's FAQ block.
    expect(
      HOW_WE_COMPARE_FAQ_ITEMS.map((f) => f.q + " " + f.a).join(" "),
    ).toContain("simulated preview");
  });

  test("does not claim features we don't ship in the rendered body", () => {
    // Scope the check to the rendered JSX (not the file's guardrail comment,
    // which legitimately lists things we don't offer as a reminder).
    const body = route.slice(route.indexOf("function HowWeComparePage()"));
    for (const banned of ["video chat", "available in every city", "nationwide", "/year", "guaranteed", "annual plan"]) {
      expect(body, `must not claim: ${banned}`).not.toContain(banned);
    }
  });
});

describe("redirect for the legacy /vs/scimatch path", () => {
  test("the old path is a 308 redirect stub, not a page", () => {
    expect(redirect).toContain('createFileRoute("/vs/scimatch")');
    expect(redirect).toContain("statusCode: 308");
    expect(redirect).toContain('to: "/how-we-compare"');
    // No page copy or competitor naming remains in the stub.
    expect(redirect).not.toContain("component: HowWeComparePage");
  });
});

describe("FAQ + JSON-LD single source of truth", () => {
  test("visible FAQ renders from HOW_WE_COMPARE_FAQ_ITEMS (same source as the FAQPage schema)", () => {
    expect(route).toContain('import { HOW_WE_COMPARE_FAQ_ITEMS } from "~/structured-data";');
    expect(route).toContain("{HOW_WE_COMPARE_FAQ_ITEMS.map((item) =>");
    expect(HOW_WE_COMPARE_FAQ_ITEMS).toHaveLength(5);
    const questions = HOW_WE_COMPARE_FAQ_ITEMS.map((f) => f.q);
    expect(questions).toContain("How is GradeDate different from other dating apps?");
    expect(questions).toContain("Do you compare yourself to specific apps?");
    expect(questions).toContain("How do I know what I'm getting?");
  });

  test("RootDocument emits the FAQPage + WebPage schemas only for /how-we-compare", () => {
    const root = read("routes/__root.tsx");
    expect(root).toContain('const carriesHowWeCompareData = pathname === "/how-we-compare";');
    expect(root).toContain("HOW_WE_COMPARE_LD_JSON.map((json) =>");
    expect(root).toContain('type="application/ld+json"');
    expect(root).not.toContain("carriesVsSciMatchData");
    expect(root).not.toContain("VS_SCIMATCH_LD_JSON");
    // The homepage/pricing set is untouched — no new paths in that list.
    expect(root).toContain("STRUCTURED_DATA_LD_JSON.map((json) =>");
  });

  test("comparison JSON-LD is serializable and typed FAQPage + WebPage", () => {
    const types = HOW_WE_COMPARE_LD_JSON.map((j) => j["@type"]);
    expect(types).toEqual(["FAQPage", "WebPage"]);
    for (const json of HOW_WE_COMPARE_LD_JSON) {
      expect(JSON.parse(JSON.stringify(json))).toBeTruthy();
    }
  });
});
