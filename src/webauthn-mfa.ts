import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/types";

export const MFA_CHALLENGE_TTL_MS = 5 * 60 * 1000;
export const PRIVILEGED_MFA_REAUTH_MS = 5 * 60 * 1000;
export function webAuthnConfig(env: Record<string, string | undefined> = process.env) {
  const rpID = env.WEBAUTHN_RP_ID?.trim();
  const origin = env.WEBAUTHN_ORIGIN?.trim();
  if (!rpID || !origin || !/^https:\/\//.test(origin)) return null;
  return { rpID, origin, rpName: env.WEBAUTHN_RP_NAME?.trim() || "GradeDate" };
}
export function challengeValid(expiresAt: Date | string, now = Date.now()): boolean {
  const expires = typeof expiresAt === "string" ? Date.parse(expiresAt) : expiresAt.getTime();
  return Number.isFinite(expires) && expires > now;
}
export async function registrationOptions(user: { id: number; email: string; display_name?: string | null }, excludeCredentials: string[] = []) {
  const cfg = webAuthnConfig();
  if (!cfg) throw new Error("WebAuthn is not configured");
  return generateRegistrationOptions({
    rpName: cfg.rpName, rpID: cfg.rpID,
    userName: user.email, userDisplayName: user.display_name || user.email,
    userID: new TextEncoder().encode(String(user.id)),
    attestationType: "none", authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
    excludeCredentials: excludeCredentials.map(id => ({ id, type: "public-key" as const })),
  });
}
export async function verifyRegistration(response: RegistrationResponseJSON, expectedChallenge: string) {
  const cfg = webAuthnConfig();
  if (!cfg) throw new Error("WebAuthn is not configured");
  return verifyRegistrationResponse({ response, expectedChallenge, expectedOrigin: cfg.origin, expectedRPID: cfg.rpID, requireUserVerification: true });
}
export async function authenticationOptions(credentialIds: string[] = []) {
  const cfg = webAuthnConfig();
  if (!cfg) throw new Error("WebAuthn is not configured");
  return generateAuthenticationOptions({ rpID: cfg.rpID, userVerification: "required", allowCredentials: credentialIds.map(id => ({ id, type: "public-key" as const })) });
}
export async function verifyAuthentication(response: AuthenticationResponseJSON, expectedChallenge: string, credential: { id: string; publicKey: Uint8Array; counter: number }) {
  const cfg = webAuthnConfig();
  if (!cfg) throw new Error("WebAuthn is not configured");
  return verifyAuthenticationResponse({ response, expectedChallenge, expectedOrigin: cfg.origin, expectedRPID: cfg.rpID, credential: { id: credential.id, publicKey: credential.publicKey, counter: credential.counter }, requireUserVerification: true });
}
