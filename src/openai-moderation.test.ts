import { describe, expect, test } from "bun:test";
import { classifyOpenAiModeration, openAiConfigured, scanMessageWithOpenAi } from "./openai-moderation";
import { policyForMessageScan, scanMessage } from "./message-moderation";

const envWithKey = { MODERATION_MESSAGE_PROVIDER: "openai", OPENAI_API_KEY: "sk-test" };

describe("openai moderation classification", () => {
  test("sexual/minors is zero-tolerance (csam_or_underage -> hide + lock)", () => {
    const result = classifyOpenAiModeration({
      id: "modr_1",
      results: [
        { flagged: true, categories: { "sexual/minors": true, sexual: true }, category_scores: { "sexual/minors": 0.98, sexual: 0.5 } },
      ],
    });
    expect(result.classification).toBe("csam_or_underage");
    expect(result.confidence).toBeCloseTo(0.98);
    expect(result.providerRef).toBe("modr_1");
    expect(policyForMessageScan(result)).toEqual({ hide: true, lockAccount: true, urgent: true });
    expect(result.matchedRules).toContain("openai:sexual/minors:0.980");
  });

  test("harassment flags for review (no auto-lock per ratified policy)", () => {
    const result = classifyOpenAiModeration({
      id: "modr_2",
      results: [{ flagged: true, categories: { harassment: true }, category_scores: { harassment: 0.9 } }],
    });
    expect(result.classification).toBe("harassment_or_abuse");
    expect(policyForMessageScan(result).lockAccount).toBe(false);
    expect(policyForMessageScan(result).hide).toBe(false);
  });

  test("harassment/threatening also maps to harassment_or_abuse", () => {
    const result = classifyOpenAiModeration({
      id: "modr_3",
      results: [{ flagged: true, categories: { "harassment/threatening": true }, category_scores: { "harassment/threatening": 0.87 } }],
    });
    expect(result.classification).toBe("harassment_or_abuse");
  });

  test("sexual content maps to inappropriate_or_explicit (review)", () => {
    const result = classifyOpenAiModeration({
      id: "modr_4",
      results: [{ flagged: true, categories: { sexual: true }, category_scores: { sexual: 0.77 } }],
    });
    expect(result.classification).toBe("inappropriate_or_explicit");
  });

  test("not flagged is clean", () => {
    const result = classifyOpenAiModeration({
      id: "modr_5",
      results: [{ flagged: false, categories: {}, category_scores: {} }],
    });
    expect(result.classification).toBe("clean");
    expect(result.providerRef).toBe("modr_5");
  });

  test("unknown/malformed payload fails closed as error", () => {
    expect(classifyOpenAiModeration(null).classification).toBe("error");
    expect(classifyOpenAiModeration({}).classification).toBe("error");
    expect(classifyOpenAiModeration({ results: [] }).classification).toBe("error");
  });
});

describe("openai adapter wiring", () => {
  test("configured only when provider selected AND key present", () => {
    expect(openAiConfigured(envWithKey)).toBe(true);
    expect(openAiConfigured({ MODERATION_MESSAGE_PROVIDER: "openai" })).toBe(false);
    expect(openAiConfigured({ OPENAI_API_KEY: "x" })).toBe(false);
  });

  test("scanMessage dispatches to openai with bearer auth and input body", async () => {
    let captured: { url?: string; headers?: Record<string, string>; body?: string } = {};
    const result = await scanMessage("send nudes", envWithKey, async (url, init) => {
      captured = { url: String(url), headers: init?.headers as Record<string, string>, body: String(init?.body) };
      return new Response(
        JSON.stringify({ id: "modr_9", results: [{ flagged: true, categories: { sexual: true }, category_scores: { sexual: 0.9 } }] }),
        { status: 200 },
      );
    });
    expect(captured.url).toBe("https://api.openai.com/v1/moderations");
    expect(captured.headers?.["authorization"]).toBe("Bearer sk-test");
    const body = JSON.parse(captured.body ?? "{}");
    expect(body.input).toBe("send nudes");
    expect(body.model).toBe("omni-moderation-latest");
    expect(result.classification).toBe("inappropriate_or_explicit");
  });

  test("missing key fails closed as error", async () => {
    let calls = 0;
    const result = await scanMessage("hello", { MODERATION_MESSAGE_PROVIDER: "openai" }, async () => {
      calls++;
      return new Response();
    });
    expect(result.classification).toBe("error");
    expect(result.providerRef).toBe("openai_api_key_missing");
    expect(calls).toBe(0);
  });

  test("provider HTTP errors fail closed with status ref", async () => {
    const result = await scanMessageWithOpenAi("hello", envWithKey, async () => new Response("{}", { status: 429 }));
    expect(result.classification).toBe("error");
    expect(result.providerRef).toBe("openai_http_429");
  });

  test("unknown provider value fails closed", async () => {
    const result = await scanMessage("hello", { MODERATION_MESSAGE_PROVIDER: "bogus" }, async () => {
      throw new Error("should not be called");
    });
    expect(result.classification).toBe("error");
    expect(result.providerRef).toBe("unknown_provider");
  });
});
