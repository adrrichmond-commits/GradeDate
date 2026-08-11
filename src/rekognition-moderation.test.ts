import { describe, expect, test } from "bun:test";
import {
  classifyRekognitionLabels,
  isZeroToleranceLabel,
  rekognitionConfigured,
  rekognitionThresholds,
  scanPhotoWithRekognition,
} from "./rekognition-moderation";
import { policyForPhotoScan, scanPhoto } from "./photo-moderation";

const envWithKeys = {
  MODERATION_PHOTO_PROVIDER: "aws-rekognition",
  AWS_ACCESS_KEY_ID: "AKIDEXAMPLE",
  AWS_SECRET_ACCESS_KEY: "secret",
};

describe("rekognition label classification", () => {
  test("explicit nudity labels flag as nsfw (review, no auto-lock)", () => {
    const result = classifyRekognitionLabels([
      { Name: "Explicit Nudity", Confidence: 98.5 },
      { Name: "Adult Nudity", Confidence: 95.2 },
    ]);
    expect(result.classification).toBe("nsfw");
    expect(policyForPhotoScan(result).lockAccount).toBe(false);
    expect(policyForPhotoScan(result).flag).toBe(true);
    expect(result.confidence).toBeCloseTo(0.985);
    expect(result.providerRef).toContain("Explicit Nudity(99)");
    expect(result.providerRef).toContain("Adult Nudity(95)");
  });

  test("child nudity at/above lock threshold is zero-tolerance (auto-lock)", () => {
    const result = classifyRekognitionLabels([{ Name: "Child Nudity", Confidence: 96 }]);
    expect(result.classification).toBe("csam_or_underage");
    expect(policyForPhotoScan(result).lockAccount).toBe(true);
  });

  test("zero-tolerance label below lock threshold stays review-only (no auto-lock)", () => {
    const result = classifyRekognitionLabels([{ Name: "Child Nudity", Confidence: 85 }]);
    expect(result.classification).toBe("nsfw");
    expect(policyForPhotoScan(result).lockAccount).toBe(false);
    expect(policyForPhotoScan(result).quarantine).toBe(true);
  });

  test("exploitation label maps to trafficking_or_exploitation", () => {
    const result = classifyRekognitionLabels([{ Name: "Sexual Exploitation", Confidence: 95 }]);
    expect(result.classification).toBe("trafficking_or_exploitation");
  });

  test("labels below the flag threshold are ignored (clean)", () => {
    const result = classifyRekognitionLabels([{ Name: "Explicit Nudity", Confidence: 79 }]);
    expect(result.classification).toBe("clean");
    expect(result.providerRef).toBeNull();
  });

  test("flag threshold is env-tunable", () => {
    const result = classifyRekognitionLabels([{ Name: "Explicit Nudity", Confidence: 90 }], { PHOTO_MODERATION_FLAG_THRESHOLD: "95" });
    expect(result.classification).toBe("clean");
  });

  test("lock threshold is env-tunable", () => {
    const result = classifyRekognitionLabels([{ Name: "Child Nudity", Confidence: 85 }], { PHOTO_MODERATION_LOCK_THRESHOLD: "80" });
    expect(result.classification).toBe("csam_or_underage");
  });

  test("label name matching", () => {
    expect(isZeroToleranceLabel("Child Nudity")).toBe(true);
    expect(isZeroToleranceLabel("Underage")).toBe(true);
    expect(isZeroToleranceLabel("Explicit Nudity")).toBe(false);
  });

  test("default thresholds are documented constants", () => {
    expect(rekognitionThresholds({})).toEqual({ flag: 80, lock: 90 });
  });
});

describe("rekognition adapter wiring", () => {
  test("configured only when provider selected AND keys present", () => {
    expect(rekognitionConfigured(envWithKeys)).toBe(true);
    expect(rekognitionConfigured({ MODERATION_PHOTO_PROVIDER: "aws-rekognition" })).toBe(false);
    expect(rekognitionConfigured({ AWS_ACCESS_KEY_ID: "x", AWS_SECRET_ACCESS_KEY: "y" })).toBe(false);
  });

  test("scanPhoto dispatches to rekognition and signs the request", async () => {
    let captured: { url?: string; headers?: Record<string, string>; body?: string } = {};
    const result = await scanPhoto(
      new Uint8Array([1, 2, 3]),
      "image/png",
      envWithKeys,
      async (url, init) => {
        captured = { url: String(url), headers: init?.headers as Record<string, string>, body: String(init?.body) };
        return new Response(JSON.stringify({ ModerationLabels: [{ Name: "Explicit Nudity", Confidence: 91 }] }), { status: 200 });
      },
    );
    expect(captured.url).toBe("https://rekognition.us-east-1.amazonaws.com/");
    expect(captured.headers?.["x-amz-target"]).toBe("AWSRekognitionService.DetectModerationLabels");
    expect(captured.headers?.["authorization"]).toContain("AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/");
    expect(captured.headers?.["authorization"]).toContain("/rekognition/aws4_request");
    expect(JSON.parse(captured.body ?? "{}").Image.Bytes).toBeTruthy();
    expect(result.classification).toBe("nsfw");
  });

  test("region override via AWS_REGION", async () => {
    let url = "";
    await scanPhotoWithRekognition(new Uint8Array([1]), "image/png", { ...envWithKeys, AWS_REGION: "eu-west-1" }, async (u) => {
      url = String(u);
      return new Response(JSON.stringify({ ModerationLabels: [] }), { status: 200 });
    });
    expect(url).toContain("rekognition.eu-west-1.amazonaws.com");
  });

  test("missing keys fail closed as error", async () => {
    let calls = 0;
    const result = await scanPhoto(new Uint8Array([1]), "image/png", { MODERATION_PHOTO_PROVIDER: "aws-rekognition" }, async () => {
      calls++;
      return new Response();
    });
    expect(result.classification).toBe("error");
    expect(result.providerRef).toBe("aws_credentials_missing");
    expect(calls).toBe(0);
    expect(policyForPhotoScan(result).flag).toBe(true); // fail-closed: flagged for review
  });

  test("provider HTTP errors fail closed with status ref", async () => {
    const result = await scanPhotoWithRekognition(new Uint8Array([1]), "image/png", envWithKeys, async () => new Response("{}", { status: 400 }));
    expect(result.classification).toBe("error");
    expect(result.providerRef).toBe("rekognition_http_400");
  });

  test("unknown provider value fails closed", async () => {
    const result = await scanPhoto(new Uint8Array([1]), "image/png", { MODERATION_PHOTO_PROVIDER: "bogus" }, async () => {
      throw new Error("should not be called");
    });
    expect(result.classification).toBe("error");
    expect(result.providerRef).toBe("unknown_provider");
  });
});
