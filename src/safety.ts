/** Phase 1 authorization and suspension policy. Keep this module pure so policy is testable. */
export const ROLES = ["user", "owner", "admin", "moderator"] as const;
export type Role = (typeof ROLES)[number];
export const PRIVILEGED_ROLES = ["owner", "admin", "moderator"] as const;
export type PrivilegedRole = (typeof PRIVILEGED_ROLES)[number];

export type SafetyUser = { id: number; role?: string | null; suspended_until?: string | null; suspension_reason?: string | null };
export function isRole(value: unknown): value is Role { return typeof value === "string" && (ROLES as readonly string[]).includes(value); }
export function hasPermission(user: SafetyUser | null, roles: readonly PrivilegedRole[]): boolean {
  return !!user && isRole(user.role) && (roles as readonly string[]).includes(user.role) && !isSuspended(user);
}
export function isSuspended(user: Pick<SafetyUser, "suspended_until"> | null, now = Date.now()): boolean {
  if (!user?.suspended_until) return false;
  const until = Date.parse(user.suspended_until);
  return Number.isNaN(until) || until > now;
}
/** Suspended users may only inspect/submit their own appeal; all other protected actions fail closed. */
export function isSuspensionException(pathname: string, method: string): boolean {
  return method === "GET" && pathname === "/api/suspension/appeal-status";
}
/** Production privileged access must provide an actual MFA assertion. Never infer MFA from email/role. */
export function privilegedMfaReady(env: Record<string, string | undefined> = process.env): boolean {
  return env.NODE_ENV !== "production" ? true : env.MFA_PROVIDER === "configured" && env.MFA_REQUIRED === "true";
}
export const PRIVILEGED_SESSION_MAX_AGE_MS = 15 * 60 * 1000;
export const SAFETY_CONTRACT = { privilegedMfa: "required-in-production", privilegedSessionMaxAgeMs: PRIVILEGED_SESSION_MAX_AGE_MS, suspensionEnforcement: "immediate", appealException: "/api/suspension/appeal-status" } as const;
