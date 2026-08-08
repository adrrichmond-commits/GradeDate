import { describe, expect, test } from 'bun:test';
import { challengeValid, webAuthnConfig, MFA_CHALLENGE_TTL_MS } from './webauthn-mfa';
describe('WebAuthn MFA policy', () => {
 test('requires exact HTTPS origin and RP id', () => { expect(webAuthnConfig({WEBAUTHN_RP_ID:'gradedate.app',WEBAUTHN_ORIGIN:'https://gradedate.app'})).toMatchObject({rpID:'gradedate.app'}); expect(webAuthnConfig({WEBAUTHN_RP_ID:'gradedate.app',WEBAUTHN_ORIGIN:'http://gradedate.app'})).toBeNull(); });
 test('challenge expiry is fail closed', () => { const now=Date.now(); expect(challengeValid(new Date(now+MFA_CHALLENGE_TTL_MS),now)).toBe(true); expect(challengeValid(new Date(now),now)).toBe(false); expect(challengeValid('not-a-date',now)).toBe(false); });
});
