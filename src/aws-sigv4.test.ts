import { describe, expect, test } from "bun:test";
import { signAwsSigV4 } from "./aws-sigv4";

describe("aws sigv4 signer", () => {
  test("produces the documented header structure (credential scope, signed headers, signature)", () => {
    const headers = signAwsSigV4({
      method: "GET",
      service: "service",
      region: "us-east-1",
      host: "example.amazonaws.com",
      path: "/test.txt",
      headers: {},
      body: "",
      accessKeyId: "AKIDEXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      now: new Date("2015-08-30T12:36:00Z"),
    });
    expect(headers["x-amz-date"]).toBe("20150830T123600Z");
    expect(headers.authorization).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=" +
        headers.authorization.slice(-64),
    );
    expect(headers.authorization).toMatch(/Signature=[0-9a-f]{64}$/);
  });

  test("is deterministic for identical inputs", () => {
    const base = {
      method: "POST",
      service: "rekognition",
      region: "us-east-1",
      host: "rekognition.us-east-1.amazonaws.com",
      path: "/",
      headers: { "content-type": "application/x-amz-json-1.1", "x-amz-target": "AWSRekognitionService.DetectModerationLabels" },
      body: "{\"Image\":{\"Bytes\":\"AQID\"}}",
      accessKeyId: "AKIDEXAMPLE",
      secretAccessKey: "secret",
      now: new Date("2026-08-11T00:00:00Z"),
    };
    expect(signAwsSigV4(base)).toEqual(signAwsSigV4(base));
  });

  test("includes extra headers in signed headers + authorization, and lowercases header names", () => {
    const headers = signAwsSigV4({
      method: "POST",
      service: "rekognition",
      region: "eu-west-1",
      host: "rekognition.eu-west-1.amazonaws.com",
      path: "/",
      headers: { "Content-Type": "application/x-amz-json-1.1", "X-Amz-Target": "AWSRekognitionService.DetectModerationLabels" },
      body: "{}",
      accessKeyId: "AKIDEXAMPLE",
      secretAccessKey: "secret",
      now: new Date("2026-08-11T00:00:00Z"),
    });
    expect(headers.authorization).toContain("SignedHeaders=content-type;host;x-amz-date;x-amz-target");
    expect(headers["content-type"]).toBe("application/x-amz-json-1.1");
    expect(headers["x-amz-target"]).toBe("AWSRekognitionService.DetectModerationLabels");
    expect(headers.authorization).toMatch(/Signature=[0-9a-f]{64}$/);
  });
});
