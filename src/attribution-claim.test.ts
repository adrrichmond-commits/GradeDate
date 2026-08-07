/**
 * Privacy-safe signed attribution claim tests.
 *
 * Covers:
 *  - TTL bounds (7–14 days) at issue and verify time;
 *  - strict experiment/variant allowlist validation (issue + verify);
 *  - the privacy contract: a claim payload/serialization contains exactly the
 *    five allowed fields and can never carry identifiers or arbitrary fields;
 *  - signature verification (tamper detection, constant-time path), expiry,
 *    malformed input, and replay safety via a ReplayGuard;
 *  - the attribution claim event names registered in the stable EVENTS table.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  ATTRIBUTION_DEFAULT_TTL_MS,
  ATTRIBUTION_TTL_MAX_MS,
  ATTRIBUTION_TTL_MIN_MS,
  formatAttributionClaim,
  issueAttributionClaim,
  serializeClaimPayload,
  signClaimPayload,
  verifyAttributionClaim,
  type AttributionClaim,
  type ReplayGuard,
} from "./attribution-claim";
import { EVENTS, EVENT_NAME_RE } from "./observability";

const SECRET = "test-attribution-secret-0123456789abcdef";
const NOW = 1_752_000_000_000; // fixed epoch ms for determinism

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function baseClaim(overrides: Partial<AttributionClaim> = {}): AttributionClaim {
  return {
    experiment: "grade-cta",
    variant: "control",
    issuedAt: NOW,
    expiresAt: NOW + ATTRIBUTION_DEFAULT_TTL_MS,
    nonce: "a".repeat(32),
    ...overrides,
  };
}

/** Sign an arbitrary JSON payload under the test secret (for malformed-input tests). */
function signedTokenFromJson(json: string, secret: string = SECRET): string {
  const b64 = Buffer.from(json, "utf8").toString("base64url");
  return `${b64}.${signClaimPayload(json, secret)}`;
}

class MemReplayGuard implements ReplayGuard {
  private readonly seen = new Set<string>();
  has(nonce: string): boolean {
    return this.seen.has(nonce);
  }
  add(nonce: string): void {
    this.seen.add(nonce);
  }
  get size(): number {
    return this.seen.size;
  }
}

describe("TTL bounds", () => {
  test("min is 7 days and max is 14 days", () => {
    expect(ATTRIBUTION_TTL_MIN_MS).toBe(7 * ONE_DAY_MS);
    expect(ATTRIBUTION_TTL_MAX_MS).toBe(14 * ONE_DAY_MS);
  });

  test("default TTL is the maximum (14 days)", () => {
    expect(ATTRIBUTION_DEFAULT_TTL_MS).toBe(ATTRIBUTION_TTL_MAX_MS);
  });
});

describe("issueAttributionClaim", () => {
  test("issues a claim with exactly the five allowed fields", () => {
    const claim = issueAttributionClaim({
      experiment: "grade-cta",
      variant: "treatment",
      secret: SECRET,
      now: NOW,
    });
    expect(claim).toEqual({
      experiment: "grade-cta",
      variant: "treatment",
      issuedAt: NOW,
      expiresAt: NOW + ATTRIBUTION_DEFAULT_TTL_MS,
      nonce: expect.stringMatching(/^[0-9a-f]{32}$/) as unknown as string,
    });
    expect(Object.keys(claim).sort()).toEqual([
      "experiment",
      "expiresAt",
      "issuedAt",
      "nonce",
      "variant",
    ]);
  });

  test("honors an explicit TTL within the bounds", () => {
    const claim = issueAttributionClaim({
      experiment: "grade-cta",
      variant: "control",
      secret: SECRET,
      ttlMs: 10 * ONE_DAY_MS,
      now: NOW,
    });
    expect(claim.expiresAt - claim.issuedAt).toBe(10 * ONE_DAY_MS);
  });

  test("honors injected nonce and now", () => {
    const claim = issueAttributionClaim({
      experiment: "grade-cta",
      variant: "control",
      secret: SECRET,
      now: NOW,
      nonce: "b".repeat(32),
    });
    expect(claim.issuedAt).toBe(NOW);
    expect(claim.nonce).toBe("b".repeat(32));
  });

  test("generates unique nonces across calls", () => {
    const nonces = new Set<string>();
    for (let i = 0; i < 50; i++) {
      nonces.add(issueAttributionClaim({ experiment: "grade-cta", variant: "control", secret: SECRET }).nonce);
    }
    expect(nonces.size).toBe(50);
  });

  test("rejects unknown experiments (strict allowlist)", () => {
    expect(() =>
      issueAttributionClaim({ experiment: "no-such-experiment", variant: "control", secret: SECRET }),
    ).toThrow(/unknown experiment/i);
  });

  test("rejects unknown variants (strict allowlist)", () => {
    expect(() =>
      issueAttributionClaim({ experiment: "grade-cta", variant: "bogus-variant", secret: SECRET }),
    ).toThrow(/not declared/i);
  });

  test("rejects TTL below 7 days and above 14 days", () => {
    expect(() =>
      issueAttributionClaim({
        experiment: "grade-cta",
        variant: "control",
        secret: SECRET,
        ttlMs: 7 * ONE_DAY_MS - 1,
      }),
    ).toThrow(/ttlMs/i);
    expect(() =>
      issueAttributionClaim({
        experiment: "grade-cta",
        variant: "control",
        secret: SECRET,
        ttlMs: 14 * ONE_DAY_MS + 1,
      }),
    ).toThrow(/ttlMs/i);
  });

  test("rejects an empty/missing secret", () => {
    expect(() =>
      issueAttributionClaim({ experiment: "grade-cta", variant: "control", secret: "" }),
    ).toThrow(/secret/i);
  });

  test("rejects a malformed injected nonce", () => {
    expect(() =>
      issueAttributionClaim({
        experiment: "grade-cta",
        variant: "control",
        secret: SECRET,
        nonce: "not-a-hex-nonce",
      }),
    ).toThrow(/nonce/i);
  });
});

describe("serialization privacy contract", () => {
  test("the token is exactly <base64url payload>.<hex signature>", () => {
    const token = formatAttributionClaim(baseClaim(), SECRET);
    expect(token.split(".")).toHaveLength(2);
    const [b64, sig] = token.split(".") as [string, string];
    expect(b64).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  test("decoded payload contains exactly the five allowed fields", () => {
    const token = formatAttributionClaim(baseClaim(), SECRET);
    const b64 = token.split(".")[0]!;
    const payload = JSON.parse(Buffer.from(b64, "base64url").toString("utf8")) as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual([
      "experiment",
      "expiresAt",
      "issuedAt",
      "nonce",
      "variant",
    ]);
  });

  test("serializeClaimPayload drops extra properties on the claim object", () => {
    const claim = {
      ...baseClaim(),
      gd_exp_id: "01234567-89ab-4cde-8f01-23456789abcd",
      email: "someone@example.com",
      user_id: 42,
      session_id: "sess_abc",
      stripe_customer_id: "cus_123",
      photo_path: "/uploads/secret.jpg",
      arbitrary: "free-form",
    } as unknown as AttributionClaim;
    const payload = JSON.parse(serializeClaimPayload(claim)) as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual([
      "experiment",
      "expiresAt",
      "issuedAt",
      "nonce",
      "variant",
    ]);
  });

  test("serialized token and payload never contain identifiers or arbitrary fields", () => {
    const token = formatAttributionClaim(baseClaim(), SECRET);
    const b64 = token.split(".")[0]!;
    const payload = Buffer.from(b64, "base64url").toString("utf8");
    for (const forbidden of [
      "gd_exp_id",
      "email",
      "user",
      "photo",
      "session",
      "stripe",
      "cus_",
      "sub_",
      "uploads",
    ]) {
      expect(payload).not.toContain(forbidden);
      expect(token).not.toContain(forbidden);
    }
  });

  test("verification rejects a signed payload with an extra field", () => {
    const json = JSON.stringify({ ...baseClaim(), email: "someone@example.com" });
    const result = verifyAttributionClaim(signedTokenFromJson(json), { secret: SECRET, now: NOW });
    expect(result).toEqual({ ok: false, reason: "malformed" });
  });

  test("verification rejects a signed payload with a missing field", () => {
    const { nonce: _nonce, ...missing } = baseClaim();
    const json = JSON.stringify(missing);
    const result = verifyAttributionClaim(signedTokenFromJson(json), { secret: SECRET, now: NOW });
    expect(result).toEqual({ ok: false, reason: "malformed" });
  });

  test("verification rejects a signed payload with wrong field types", () => {
    const bad = JSON.stringify({
      ...baseClaim(),
      issuedAt: String(NOW), // string, not number
    });
    expect(verifyAttributionClaim(signedTokenFromJson(bad), { secret: SECRET, now: NOW })).toEqual({
      ok: false,
      reason: "malformed",
    });
  });

  test("verification rejects a signed payload with a malformed nonce", () => {
    const bad = JSON.stringify({ ...baseClaim(), nonce: "UPPERCASE-NOT-HEX-000000000000" });
    expect(verifyAttributionClaim(signedTokenFromJson(bad), { secret: SECRET, now: NOW })).toEqual({
      ok: false,
      reason: "malformed",
    });
  });
});

describe("round-trip verification", () => {
  test("a validly issued and formatted claim verifies to the same claim", () => {
    const claim = issueAttributionClaim({
      experiment: "grade-cta",
      variant: "treatment",
      secret: SECRET,
      now: NOW,
    });
    const token = formatAttributionClaim(claim, SECRET);
    const result = verifyAttributionClaim(token, { secret: SECRET, now: NOW });
    expect(result).toEqual({ ok: true, claim });
  });

  test("verifies at exactly expiresAt (inclusive boundary)", () => {
    const claim = baseClaim();
    const token = formatAttributionClaim(claim, SECRET);
    expect(verifyAttributionClaim(token, { secret: SECRET, now: claim.expiresAt })).toEqual({
      ok: true,
      claim,
    });
  });

  test("verifies at exactly issuedAt (inclusive boundary)", () => {
    const claim = baseClaim();
    const token = formatAttributionClaim(claim, SECRET);
    expect(verifyAttributionClaim(token, { secret: SECRET, now: claim.issuedAt })).toEqual({
      ok: true,
      claim,
    });
  });
});

describe("tamper detection", () => {
  test("rejects a token signed with the wrong secret", () => {
    const token = formatAttributionClaim(baseClaim(), SECRET);
    expect(verifyAttributionClaim(token, { secret: "a-different-secret", now: NOW })).toEqual({
      ok: false,
      reason: "tampered",
    });
  });

  test("rejects a flipped byte in the payload", () => {
    const token = formatAttributionClaim(baseClaim(), SECRET);
    const [b64, sig] = token.split(".") as [string, string];
    const flipped = b64.slice(0, 4) + (b64[4] === "A" ? "B" : "A") + b64.slice(5);
    expect(verifyAttributionClaim(`${flipped}.${sig}`, { secret: SECRET, now: NOW })).toEqual({
      ok: false,
      reason: "tampered",
    });
  });

  test("rejects an altered variant in the payload (semantic tamper)", () => {
    const token = formatAttributionClaim(baseClaim(), SECRET);
    const b64 = token.split(".")[0]!;
    const payload = JSON.parse(Buffer.from(b64, "base64url").toString("utf8")) as Record<string, unknown>;
    payload.variant = "treatment";
    const altered = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    const sig = token.split(".")[1]!;
    expect(verifyAttributionClaim(`${altered}.${sig}`, { secret: SECRET, now: NOW })).toEqual({
      ok: false,
      reason: "tampered",
    });
  });

  test("rejects an altered signature", () => {
    const token = formatAttributionClaim(baseClaim(), SECRET);
    const [b64, sig] = token.split(".") as [string, string];
    const badSig = (sig[0] === "a" ? "b" : "a") + sig.slice(1);
    expect(verifyAttributionClaim(`${b64}.${badSig}`, { secret: SECRET, now: NOW })).toEqual({
      ok: false,
      reason: "tampered",
    });
  });

  test("a truncated signature is rejected as tampered", () => {
    const token = formatAttributionClaim(baseClaim(), SECRET);
    const [b64, sig] = token.split(".") as [string, string];
    expect(verifyAttributionClaim(`${b64}.${sig.slice(0, 16)}`, { secret: SECRET, now: NOW })).toEqual({
      ok: false,
      reason: "tampered",
    });
  });
});

describe("expiry and time window", () => {
  test("rejects a claim past its expiresAt", () => {
    const token = formatAttributionClaim(baseClaim(), SECRET);
    expect(verifyAttributionClaim(token, { secret: SECRET, now: NOW + ATTRIBUTION_DEFAULT_TTL_MS + 1 })).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  test("rejects a claim before its issuedAt (future-dated)", () => {
    const token = formatAttributionClaim(baseClaim(), SECRET);
    expect(verifyAttributionClaim(token, { secret: SECRET, now: NOW - 1 })).toEqual({
      ok: false,
      reason: "not_yet_valid",
    });
  });
});

describe("malformed input", () => {
  test("rejects non-strings, empty strings, and shape-less strings", () => {
    for (const bad of [null, undefined, 42, {}, [], "", "abc", "....", "a."]) {
      expect(verifyAttributionClaim(bad as unknown as string, { secret: SECRET, now: NOW })).toEqual({
        ok: false,
        reason: "malformed",
      });
    }
  });

  test("rejects a payload that is not base64url", () => {
    const [b64, sig] = formatAttributionClaim(baseClaim(), SECRET).split(".") as [string, string];
    expect(verifyAttributionClaim(`not valid b64!@#.${sig}`, { secret: SECRET, now: NOW })).toEqual({
      ok: false,
      reason: "malformed",
    });
  });

  test("rejects a signature that is not hex", () => {
    const [b64] = formatAttributionClaim(baseClaim(), SECRET).split(".") as [string, string];
    expect(verifyAttributionClaim(`${b64}.ZZZZZZZZ`, { secret: SECRET, now: NOW })).toEqual({
      ok: false,
      reason: "malformed",
    });
  });

  test("rejects a signed payload that is not valid JSON", () => {
    const token = signedTokenFromJson("{not json");
    expect(verifyAttributionClaim(token, { secret: SECRET, now: NOW })).toEqual({
      ok: false,
      reason: "malformed",
    });
  });

  test("rejects a signed payload that is not a JSON object", () => {
    for (const json of ['"grade-cta"', "42", "true", "[1,2,3]", "null"]) {
      expect(verifyAttributionClaim(signedTokenFromJson(json), { secret: SECRET, now: NOW })).toEqual({
        ok: false,
        reason: "malformed",
      });
    }
  });
});

describe("allowlist enforcement at verify time", () => {
  test("rejects a validly signed claim for an unknown experiment", () => {
    const claim = baseClaim({ experiment: "not-a-real-experiment" });
    const token = formatAttributionClaim(claim, SECRET);
    expect(verifyAttributionClaim(token, { secret: SECRET, now: NOW })).toEqual({
      ok: false,
      reason: "unknown_experiment",
    });
  });

  test("rejects a validly signed claim for an undeclared variant", () => {
    const claim = baseClaim({ variant: "not-a-real-variant" });
    const token = formatAttributionClaim(claim, SECRET);
    expect(verifyAttributionClaim(token, { secret: SECRET, now: NOW })).toEqual({
      ok: false,
      reason: "unknown_variant",
    });
  });

  test("verification accepts any currently-registered experiment/variant", () => {
    const claim = baseClaim({ variant: "treatment" });
    expect(verifyAttributionClaim(formatAttributionClaim(claim, SECRET), { secret: SECRET, now: NOW })).toEqual({
      ok: true,
      claim,
    });
  });
});

describe("TTL enforcement at verify time", () => {
  test("rejects a claim with a lifetime below 7 days", () => {
    const claim = baseClaim({ expiresAt: NOW + 7 * ONE_DAY_MS - 1 });
    const token = formatAttributionClaim(claim, SECRET);
    expect(verifyAttributionClaim(token, { secret: SECRET, now: NOW })).toEqual({
      ok: false,
      reason: "invalid_ttl",
    });
  });

  test("rejects a claim with a lifetime above 14 days", () => {
    const claim = baseClaim({ expiresAt: NOW + 14 * ONE_DAY_MS + 1 });
    const token = formatAttributionClaim(claim, SECRET);
    expect(verifyAttributionClaim(token, { secret: SECRET, now: NOW })).toEqual({
      ok: false,
      reason: "invalid_ttl",
    });
  });

  test("accepts claims at exactly the 7-day and 14-day boundaries", () => {
    for (const ttl of [7 * ONE_DAY_MS, 14 * ONE_DAY_MS]) {
      const claim = baseClaim({ expiresAt: NOW + ttl });
      expect(verifyAttributionClaim(formatAttributionClaim(claim, SECRET), { secret: SECRET, now: NOW })).toEqual({
        ok: true,
        claim,
      });
    }
  });
});

describe("replay safety", () => {
  test("a token can only be redeemed once when a ReplayGuard is provided", () => {
    const guard = new MemReplayGuard();
    const token = formatAttributionClaim(baseClaim(), SECRET);
    const first = verifyAttributionClaim(token, { secret: SECRET, now: NOW, replayGuard: guard });
    expect(first.ok).toBe(true);
    const second = verifyAttributionClaim(token, { secret: SECRET, now: NOW, replayGuard: guard });
    expect(second).toEqual({ ok: false, reason: "replay" });
    expect(guard.size).toBe(1);
  });

  test("distinct nonces pass even with a shared guard", () => {
    const guard = new MemReplayGuard();
    const t1 = formatAttributionClaim(baseClaim({ nonce: "1".repeat(32) }), SECRET);
    const t2 = formatAttributionClaim(baseClaim({ nonce: "2".repeat(32) }), SECRET);
    expect(verifyAttributionClaim(t1, { secret: SECRET, now: NOW, replayGuard: guard }).ok).toBe(true);
    expect(verifyAttributionClaim(t2, { secret: SECRET, now: NOW, replayGuard: guard }).ok).toBe(true);
  });

  test("tampered and expired tokens never consume a nonce", () => {
    const guard = new MemReplayGuard();
    const expired = formatAttributionClaim(baseClaim(), SECRET);
    expect(verifyAttributionClaim(expired, { secret: SECRET, now: NOW + 30 * ONE_DAY_MS, replayGuard: guard })).toEqual({
      ok: false,
      reason: "expired",
    });
    expect(verifyAttributionClaim(expired, { secret: "wrong", now: NOW, replayGuard: guard })).toEqual({
      ok: false,
      reason: "tampered",
    });
    expect(guard.size).toBe(0);
    // The same token still verifies fresh afterward.
    expect(verifyAttributionClaim(expired, { secret: SECRET, now: NOW, replayGuard: guard }).ok).toBe(true);
  });

  test("without a guard, replay protection is delegated to the caller (both verify)", () => {
    const token = formatAttributionClaim(baseClaim(), SECRET);
    expect(verifyAttributionClaim(token, { secret: SECRET, now: NOW }).ok).toBe(true);
    expect(verifyAttributionClaim(token, { secret: SECRET, now: NOW }).ok).toBe(true);
  });
});

describe("no hardcoded secret in the module", () => {
  const source = readFileSync(path.join(import.meta.dir, "attribution-claim.ts"), "utf8");

  test("the module never reads the environment for a secret", () => {
    expect(source).not.toContain("process.env");
  });

  test("the module has no literal secret assignments", () => {
    expect(source).not.toMatch(/secret\s*=\s*["'][^"']{8,}["']/);
    expect(source).not.toMatch(/const\s+\w+Secret\s*=\s*["']/);
  });
});

describe("attribution claim event names", () => {
  test("issued/verified/rejected names are registered in the stable EVENTS table", () => {
    expect(EVENTS.ATTRIBUTION_CLAIM_ISSUED).toBe("attribution.claim_issued");
    expect(EVENTS.ATTRIBUTION_CLAIM_VERIFIED).toBe("attribution.claim_verified");
    expect(EVENTS.ATTRIBUTION_CLAIM_REJECTED).toBe("attribution.claim_rejected");
  });

  test("attribution event names are stable and well-formed", () => {
    for (const name of [
      EVENTS.ATTRIBUTION_CLAIM_ISSUED,
      EVENTS.ATTRIBUTION_CLAIM_VERIFIED,
      EVENTS.ATTRIBUTION_CLAIM_REJECTED,
    ]) {
      expect(name).toMatch(EVENT_NAME_RE);
    }
  });
});
