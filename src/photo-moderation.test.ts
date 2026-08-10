import { describe, expect, test } from "bun:test";
import { classifyPhotoScan, photoModerationConfigured, policyForPhotoScan, scanPhoto } from "./photo-moderation";

describe("photo moderation", () => {
  test("maps provider labels to policy classifications", () => {
    expect(classifyPhotoScan({ labels: [{ name: "underage", confidence: 0.99 }] }).classification).toBe("csam_or_underage");
    expect(classifyPhotoScan({ classification: "human trafficking", confidence: 0.8 }).classification).toBe("trafficking_or_exploitation");
    expect(classifyPhotoScan({ category: "impersonation" }).classification).toBe("impersonation");
    expect(classifyPhotoScan({ categories: ["nsfw"] }).classification).toBe("nsfw");
    expect(classifyPhotoScan({ classification: "clean" }).classification).toBe("clean");
  });
  test("applies safety policy without automating non-underage account actions", () => {
    expect(policyForPhotoScan({ classification: "csam_or_underage", confidence: 1, providerRef: null })).toEqual({ quarantine: true, flag: true, lockAccount: true });
    for (const classification of ["trafficking_or_exploitation", "impersonation", "nsfw", "error"] as const) expect(policyForPhotoScan({ classification, confidence: null, providerRef: null })).toEqual({ quarantine: true, flag: true, lockAccount: false });
    expect(policyForPhotoScan({ classification: "clean", confidence: 1, providerRef: null })).toEqual({ quarantine: false, flag: false, lockAccount: false });
  });
  test("disabled provider fails open without calling fetch", async () => {
    let calls = 0;
    const result = await scanPhoto(new Uint8Array([1]), "image/png", {}, async () => { calls++; return new Response(); });
    expect(result.classification).toBe("clean"); expect(calls).toBe(0); expect(photoModerationConfigured({})).toBe(false);
  });
  test("provider failure becomes error for review", async () => {
    const result = await scanPhoto(new Uint8Array([1]), "image/png", { MODERATION_PHOTO_PROVIDER: "https://scanner.invalid" }, async () => { throw new Error("timeout"); });
    expect(result.classification).toBe("error");
  });
});
