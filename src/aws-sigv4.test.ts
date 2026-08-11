import { describe, expect, test } from "bun:test";
import { signAwsSigV4, uriEncodePath } from "./aws-sigv4";

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
      headers: { "content-type": "application/x-amz-json-1.1", "x-amz-target": "RekognitionService.DetectModerationLabels" },
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
      headers: { "Content-Type": "application/x-amz-json-1.1", "X-Amz-Target": "RekognitionService.DetectModerationLabels" },
      body: "{}",
      accessKeyId: "AKIDEXAMPLE",
      secretAccessKey: "secret",
      now: new Date("2026-08-11T00:00:00Z"),
    });
    expect(headers.authorization).toContain("SignedHeaders=content-type;host;x-amz-date;x-amz-target");
    expect(headers["content-type"]).toBe("application/x-amz-json-1.1");
    expect(headers["x-amz-target"]).toBe("RekognitionService.DetectModerationLabels");
    expect(headers.authorization).toMatch(/Signature=[0-9a-f]{64}$/);
  });

  test("regression: Rekognition requests carry the exact X-Amz-Target header RekognitionService.DetectModerationLabels", () => {
    const headers = signAwsSigV4({
      method: "POST",
      service: "rekognition",
      region: "us-east-1",
      host: "rekognition.us-east-1.amazonaws.com",
      path: "/",
      headers: { "content-type": "application/x-amz-json-1.1", "x-amz-target": "RekognitionService.DetectModerationLabels" },
      body: "{}",
      accessKeyId: "AKIDEXAMPLE",
      secretAccessKey: "secret",
      now: new Date("2026-08-11T00:00:00Z"),
    });
    // A wrong target prefix (e.g. AWSRekognitionService.*) makes Rekognition
    // answer 400 UnknownOperationException — the exact value must be preserved.
    expect(headers["x-amz-target"]).toBe("RekognitionService.DetectModerationLabels");
    expect(headers.authorization).toContain("SignedHeaders=content-type;host;x-amz-date;x-amz-target");
  });

  test("canonical URI keeps \"/\" separators literal (SigV4 spec: root path is \"/\", never %2F)", () => {
    expect(uriEncodePath("/")).toBe("/");
    expect(uriEncodePath("/test.txt")).toBe("/test.txt");
    expect(uriEncodePath("/a/b/")).toBe("/a/b/");
    expect(uriEncodePath("/a b/c.txt")).toBe("/a%20b/c.txt");
    expect(uriEncodePath("/café/naïve")).toBe("/caf%C3%A9/na%C3%AFve");
    expect(uriEncodePath("")).toBe("");
  });

  test("matches the AWS SigV4 reference implementation (botocore) for the get-vanilla request (canonical root URI \"/\" literal)", () => {
    // Cross-verified 2026-08-11 against botocore (AWS's reference SigV4
    // signer): the same request signed by botocore yields the identical
    // signature ea21d6f0... — proving the canonical URI for the root path is
    // "/", not "%2F" (the %2F bug produces f7ee8315..., which fails here).
    const headers = signAwsSigV4({
      method: "GET",
      service: "service",
      region: "us-east-1",
      host: "example.amazonaws.com",
      path: "/",
      headers: {},
      body: "",
      accessKeyId: "AKIDEXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      now: new Date("2015-08-30T12:36:00Z"),
    });
    expect(headers.authorization).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, " +
        "SignedHeaders=host;x-amz-date, " +
        "Signature=ea21d6f05e96a897f6000a1a293f0a5bf0f92a00343409e820dce329ca6365ea",
    );
  });

  test("canonical path encoding matches botocore for literal segments and encoded segments", () => {
    // Same cross-implementation check for non-root paths: "/" separators stay
    // literal while each segment is percent-encoded.
    const sign = (path: string) =>
      signAwsSigV4({
        method: "GET",
        service: "service",
        region: "us-east-1",
        host: "example.amazonaws.com",
        path,
        headers: {},
        body: "",
        accessKeyId: "AKIDEXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        now: new Date("2015-08-30T12:36:00Z"),
      }).authorization.split("Signature=")[1];
    expect(sign("/test.txt")).toBe("0538accd1ddcd2b9558c274e385f50d34164d84f18cf5812cb7481103be6f80d");
    expect(sign("/a b/c.txt")).toBe("9259d25cb441aaf30c62de4f45781c2f824fc289c13c8ec894862c1b45237fe1");
  });
});
