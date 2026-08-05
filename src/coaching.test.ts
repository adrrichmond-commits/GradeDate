import { describe, expect, test } from "bun:test";
import { deriveCoachingTips } from "./coaching";

const ids = (tips: { id: string }[]) => tips.map((t) => t.id);

describe("deriveCoachingTips", () => {
  test("no feedback with 3+ photos yields no tips", () => {
    expect(deriveCoachingTips([], 3)).toEqual([]);
    expect(deriveCoachingTips(["Great photo!"], 4)).toEqual([]);
    expect(deriveCoachingTips(["Great photo!", "Nice smile", "Love the outfit", "Good energy", "Solid pose"], 5)).toEqual([]);
  });

  test("photo-count tip applies when fewer than 3 photos", () => {
    expect(ids(deriveCoachingTips([], 1))).toEqual(["photo-count"]);
    expect(ids(deriveCoachingTips([], 2))).toEqual(["photo-count"]);
    expect(deriveCoachingTips([], 1)[0].source).toBe("rule");
    expect(deriveCoachingTips([], 1)[0].id).toBe("photo-count");
  });

  test("lighting keywords map to the canonical lighting tip, case-insensitive", () => {
    for (const kw of ["light", "lighting", "dark", "bright", "shadow"]) {
      expect(ids(deriveCoachingTips([`The ${kw} in this shot is poor`], 3))).toEqual(["lighting"]);
      expect(ids(deriveCoachingTips([`The ${kw.toUpperCase()} in this shot is poor`], 3))).toEqual(["lighting"]);
    }
  });

  test("framing keywords map to the canonical framing tip", () => {
    for (const kw of ["crop", "frame", "angle", "close", "group"]) {
      expect(ids(deriveCoachingTips([`Needs a better ${kw}`], 3))).toEqual(["framing"]);
      expect(ids(deriveCoachingTips([`Needs a better ${kw.toUpperCase()}`], 3))).toEqual(["framing"]);
    }
  });

  test("duplicate keywords across feedback produce exactly one tip per rule", () => {
    const tips = deriveCoachingTips(["dark lighting", "harsh shadow and bright sun"], 3);
    expect(ids(tips)).toEqual(["lighting"]);
    const tips2 = deriveCoachingTips(["bad crop", "weird frame", "awkward angle"], 3);
    expect(ids(tips2)).toEqual(["framing"]);
  });

  test("lighting + framing + photo-count combine in deterministic order", () => {
    const tips = deriveCoachingTips(["dark lighting", "bad crop"], 1);
    expect(ids(tips)).toEqual(["lighting", "framing", "photo-count"]);
    // Deterministic: identical input yields identical output every time
    expect(ids(deriveCoachingTips(["dark lighting", "bad crop"], 1))).toEqual(ids(tips));
  });

  test("photo-count comes last even when combined with lighting", () => {
    expect(ids(deriveCoachingTips(["shadow"], 2))).toEqual(["lighting", "photo-count"]);
  });

  test("unrelated feedback yields only the photo-count tip when applicable", () => {
    expect(ids(deriveCoachingTips(["Great smile", "Nice outfit"], 2))).toEqual(["photo-count"]);
    expect(deriveCoachingTips(["Great smile", "Nice outfit"], 4)).toEqual([]);
  });

  test("empty feedback strings are tolerated", () => {
    expect(ids(deriveCoachingTips([""], 1))).toEqual(["photo-count"]);
    expect(deriveCoachingTips([""], 3)).toEqual([]);
  });

  test("returned tips are stable ids, never duplicated, and are fresh copies", () => {
    const tips = deriveCoachingTips(
      ["light", "lighting", "dark", "bright", "shadow", "crop", "frame", "angle", "close", "group"],
      1,
    );
    const idList = ids(tips);
    expect(new Set(idList).size).toBe(idList.length);
    expect(idList).toEqual(["lighting", "framing", "photo-count"]);

    // Mutating a returned tip must not affect subsequent calls
    const first = deriveCoachingTips(["dark"], 3);
    first[0].text = "mutated";
    const second = deriveCoachingTips(["dark"], 3);
    expect(second[0].text).toBe("Try even, natural light facing you.");
  });
});
