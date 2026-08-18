/**
 * /vs/scimatch comparison-page surface guards (site-audit C1 / D5.3).
 *
 * Pins the page to the honest-copy rules:
 *   - The route file exists at the /vs/scimatch path with its own head().
 *   - The table covers the five comparison dimensions we genuinely differ on:
 *     matching philosophy, price, age verification & moderation, transparency,
 *     and geography.
 *   - Every SciMatch cell uses the honest "not published / not stated"
 *     fallback — the competitive-research file contains NO verified SciMatch
 *     facts, so any claim about SciMatch's pricing, coaching, or algorithm
 *     would be invented and must never appear (e.g. no "hidden pricing", no
 *     "no coaching", no "compatibility read", no disparaging language).
 *   - The page claims only features we ship ($5.99/mo Premium, 80/20 feed,
 *     city percentile, best-pic picker, Austin-first beta, mandatory ID +
 *     selfie verification, zero-tolerance moderation) and no features we
 *     don't (no video chat, no annual plan, no nationwide launch).
 *   - Wiring: footer link, /llms.txt entry, and FAQPage/WebPage JSON-LD
 *     emitted by RootDocument for this pathname from the same
 *     VS_SCIMATCH_FAQ_ITEMS source the visible FAQ renders from.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { VS_SCIMATCH_FAQ_ITEMS, VS_SCIMATCH_LD_JSON } from "./structured-data";

const SRC = path.join(import.meta.dir);
const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf8");
const route = read("routes/vs.scimatch.tsx");

describe("/vs/scimatch page exists and resolves", () => {
  test("route file defines the /vs/scimatch path", () => {
    expect(route).toContain('createFileRoute("/vs/scimatch")');
    // File-route convention: vs.scimatch.tsx -> /vs/scimatch (dot = segment).
    expect(readFileSync(path.join(SRC, "routes", "vs.scimatch.tsx"), "utf8")).toContain(
      "createFileRoute(\"/vs/scimatch\")",
    );
  });

  test("carries its own honest head() meta", () => {
    expect(route).toContain("head: () => staticPageHead(");
    expect(route).toContain("GradeDate vs SciMatch — An Honest Comparison");
    expect(route).toContain('import { staticPageHead } from "~/route-heads";');
  });

  test("footer links to the page", () => {
    const root = read("routes/__root.tsx");
    expect(root).toContain('to="/vs/scimatch"');
  });

  test("/llms.txt lists the comparison page URL", () => {
    const llms = readFileSync(path.join(SRC, "..", "public", "llms.txt"), "utf8");
    expect(llms).toContain("https://gradedate.app/vs/scimatch");
  });
});

describe("comparison table covers the five real differences", () => {
  test("table rows: matching philosophy, price, verification & moderation, transparency, geography", () => {
    expect(route).toContain("Matching philosophy");
    expect(route).toContain("Age verification & moderation");
    expect(route).toContain("Transparency");
    expect(route).toContain("Where it runs");
    // A real semantic table, not a div grid: <table> with thead scope="col"
    // headers for GradeDate and SciMatch, scope="row" feature cells, caption.
    expect(route).toContain("<table");
    expect(route).toContain("</table>");
    expect(route).toContain("<thead>");
    expect(route).toContain("<caption");
    expect(route).toContain('scope="col"');
    expect(route).toContain('scope="row"');
    expect(route).toContain("{COMPARISON_ROWS.map((row) =>");
  });

  test("GradeDate cells carry only shipped, verifiable product facts", () => {
    expect(route).toContain("$5.99/month");
    expect(route).toContain("80% people in your appearance range");
    expect(route).toContain("city percentile");
    expect(route).toContain("best profile picture");
    expect(route).toContain("Austin, TX first");
    expect(route).toContain("government ID + selfie verification");
    expect(route).toContain("Zero tolerance");
    expect(route).toContain("1 free regrade per week");
    expect(route).toContain("3 likes per day");
    // The demo is honestly labeled (never claimed to be real analysis).
    expect(route).toContain("simulated preview");
    expect(route).toContain("private to you");
  });

  test("honest 'not published / not stated' fallbacks for every unknown SciMatch fact", () => {
    const fallbacks =
      (route.match(/Not stated in published materials\./g) ?? []).length +
      (route.match(/Not published\./g) ?? []).length;
    // One per SciMatch table cell (5 rows) plus the FAQ answer that explains
    // the policy — the page must never silently invent a competitor fact.
    expect(fallbacks).toBeGreaterThanOrEqual(6);
    expect(route).toContain("not stated");
    expect(route).toContain("Not published.");
  });

  test("no unsupported claims about SciMatch or features we don't ship", () => {
    // Anything here would be invented: the competitive-research file has no
    // verified SciMatch facts, and these features are not in the product.
    for (const banned of [
      "hidden pricing",
      "no coaching",
      "compatibility read",
      "lies",
      "manipulates",
      "manipulating",
      "scam",
      "video chat",
      "available in every city",
      "nationwide",
      "/year",
      "$49.99",
      "guaranteed",
    ]) {
      expect(route, `must not claim: ${banned}`).not.toContain(banned);
    }
    // The page must say plainly that SciMatch is separate and unaffiliated.
    expect(route).toContain("separate, unaffiliated product");
  });
});

describe("FAQ + JSON-LD single source of truth", () => {
  test("visible FAQ renders from VS_SCIMATCH_FAQ_ITEMS (same source as the FAQPage schema)", () => {
    expect(route).toContain('import { VS_SCIMATCH_FAQ_ITEMS } from "~/structured-data";');
    expect(route).toContain("{VS_SCIMATCH_FAQ_ITEMS.map((item) =>");
    // Five honest Q&As, all true to the shipped product.
    expect(VS_SCIMATCH_FAQ_ITEMS).toHaveLength(5);
    expect(VS_SCIMATCH_FAQ_ITEMS.map((f) => f.q)).toContain(
      "Why does the SciMatch column say 'not stated'?",
    );
  });

  test("RootDocument emits the FAQPage + WebPage schemas only for /vs/scimatch", () => {
    const root = read("routes/__root.tsx");
    expect(root).toContain('const carriesVsSciMatchData = pathname === "/vs/scimatch";');
    expect(root).toContain("VS_SCIMATCH_LD_JSON.map((json) =>");
    expect(root).toContain('type="application/ld+json"');
    // The homepage/pricing set is untouched — no new paths in that list.
    expect(root).toContain("STRUCTURED_DATA_LD_JSON.map((json) =>");
  });

  test("comparison JSON-LD is serializable and typed FAQPage + WebPage", () => {
    const types = VS_SCIMATCH_LD_JSON.map((j) => j["@type"]);
    expect(types).toEqual(["FAQPage", "WebPage"]);
    for (const json of VS_SCIMATCH_LD_JSON) {
      expect(JSON.parse(JSON.stringify(json))).toBeTruthy();
    }
  });
});
