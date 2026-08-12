import { describe, expect, test } from 'bun:test';
import { challengeValid, webAuthnConfig, MFA_CHALLENGE_TTL_MS } from './webauthn-mfa';
describe('WebAuthn MFA policy', () => {
 test('requires exact HTTPS origin and RP id', () => { expect(webAuthnConfig({WEBAUTHN_RP_ID:'gradedate.app',WEBAUTHN_ORIGIN:'https://gradedate.app'})).toMatchObject({rpID:'gradedate.app'}); expect(webAuthnConfig({WEBAUTHN_RP_ID:'gradedate.app',WEBAUTHN_ORIGIN:'http://gradedate.app'})).toBeNull(); });
 test('challenge expiry is fail closed', () => { const now=Date.now(); expect(challengeValid(new Date(now+MFA_CHALLENGE_TTL_MS),now)).toBe(true); expect(challengeValid(new Date(now),now)).toBe(false); expect(challengeValid('not-a-date',now)).toBe(false); });
});

import { readFileSync } from "node:fs";
const dbSource = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
describe("consumeWebAuthnChallenge db contract", () => {
  const fn = dbSource.match(/export async function consumeWebAuthnChallenge[\s\S]*?\n}/)?.[0] ?? "";
  test("maps RETURNING user_id to userId with a real mapping, not a lying cast", () => {
    expect(fn).toContain("RETURNING user_id,challenge");
    expect(fn).toContain("Number(r.user_id)");
    expect(fn).toContain("return { userId: Number(r.user_id), challenge: r.challenge };");
    expect(fn).not.toContain("as { userId: number; challenge: string }");
    expect(fn).not.toContain("consumed.userId");
  });
  test("returns null when no row is consumed", () => {
    expect(fn).toContain("if (!rows.length) return null;");
  });
});
