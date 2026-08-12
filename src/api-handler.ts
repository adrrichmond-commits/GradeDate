import type { Server } from "bun";
import { originFromUrl, resolveSiteUrl } from "./site-url";
import { PREMIUM_PRICE_ID, hasPremiumEntitlement } from "./canonical-entitlements";
import { deriveCoachingTips } from "./coaching";
import { topPercentLabel } from "./percentile";
import { validateUnmatchRequest } from "./unmatch-flow";
import { parseExperimentEvent } from "./experiment";
import { issueAttributionClaim, formatAttributionClaim, ATTRIBUTION_DEFAULT_TTL_MS } from "./attribution-claim";
import {
  aggregateGradingMethod,
  fallbackGrade,
  FALLBACK_FEEDBACK,
} from "./grading-method";
import {
  foundersCheckoutUrls,
  storeUpsellCheckoutUrls,
  subscriptionCheckoutUrls,
} from "./stripe-redirects";
import {
  createUser,
  getUserByEmail,
  getUserById,
  updateUserProfile,
  updateUserGrade,
  updateSubscriptionStatus,
  updateUserStripeInfo,
  getUserByStripeCustomerId,
  getUserByVerificationSessionId, startVerificationSession, updateVerificationOutcome, resetVerificationSession,
  getUsersByGradeRange,
  getUsersWith8020Matching,
  recordLike,
  getLike,
  createSession,
  createPrivilegedSession,
  getSessionById,
  revokeOtherSessions,
  createWebAuthnChallenge, consumeWebAuthnChallenge, getWebAuthnCredentials, saveWebAuthnCredential, updateWebAuthnCounter, recordAdminAuditEvent,
  deleteSession,
  createMatch,
  isMatch,
  getMatchById,
  getMatchesForUser,
  calculateMutualLeagueScore,
  updateMatchLeagueScore,
  createMessage,
  getMessages,
  getMessageById,
  hasUserReportedMessage,
  getUnreadMessageCount,
  markMessagesRead,
  upsertMessageModerationFlag, hideMessage, releaseMessage, getMessageModerationFlagQueue, getMessageModerationContext, reviewMessageModerationFlag,
  blockUser,
  isBlocked,
  getBlockedUserIds,
  unmatchUser,
  reportUser,
  getReportQueue, getReportById, assignReport, transitionReport,
  deleteUserAccount,
  addReGrade,
  useReGrade,
  activateBoost,
  addLikePacks,
  getLikePacksRemaining,
  getLikers,
  createPasswordResetToken,
  getPasswordResetToken,
  markTokenUsed,
  updateUserPassword,
  addUserPhoto,
  deleteUserPhoto,
  removeModeratedUserPhoto,
  reorderUserPhotos,
  setPrimaryPhoto,
  getUserPhotos,
  getUserPhotoCount,
  getUserPhotoById, getPhotoModerationCaseForPhoto,
  getPhotoModerationQueue, getPhotoModerationCase, transitionPhotoModerationCase, createPhotoModerationCase, upsertModerationFlag, getModerationFlagQueue, reviewModerationFlag,
  createSuspension, revokeSuspension, getActiveSuspension, createAppeal, getAppeals, reviewAppeal, attachPrivatePhotoObject, markPrivatePhotoDeleted, listExpiredPrivatePhotoCases,
  savePushSubscription,
  getPushSubscriptions,
  deletePushSubscription,
  generateReferralCode,
  getReferralCode,
  getReferralCodeByCode,
  applyReferralCode,
  getReferralStats,
  getReferralRewardForReferee,
  applyReferralReward,
  getDailyLikesRemaining,
  useDailyLike,
  insertPhotoGrades,
  getPhotoGrades,
  getBestPhotoGrade,
  calculatePercentile,
  calculateCompatibility,
  updateUserPercentile,
  updateLastFreeRegrade,
  joinWaitlist,
  getUserBadges,
  getUserPersistedBadges,
  awardBadge,
  checkAndAwardBadges,
  getFounderCount,
  getFounderSpotsRemaining,
  assignFounderNumber,
  revokeFounderState,
  generateRandomCode,
  issueBetaInviteCodes,
  getBetaInviteCodeByCode,
  getRedeemedBetaInviteCount,
  redeemBetaInviteCode,
  getBetaInviteStats,
  betaCohortCap,
  listWaitlistEntries,
  getWaitlistCount,
  getWaitlistEntriesByIds,
  grantPaidUpsell,
  createPendingUpsell,
  clearPendingUpsell,
  getUpsellEntitlementState,
  checkDatabaseReady,
  getRetentionCronState,
  persistAttributionClaim,
  createSuspension,
  quarantineUserPhotosForUnderage,
  type PaidUpsellProduct,
  type User,
  type UserPhoto,
  type PhotoGrade,
  type Badge,
  type PersistedBadge,
} from "../src/db.ts";
import { sendPasswordResetEmail } from "../src/email.ts";
import { isGradeCardOwner } from "./grade-card-access";
import { sendWaitlistConfirmation, sendContactMessage, sendBetaInviteEmail } from "../src/email.ts";
/**
 * Beta-invite email sender seam (same injectable pattern as fetchFn in
 * anonymous-grading.ts). Production default is the real Resend path; tests
 * replace it to capture sends without mocking the email module.
 */
type BetaInviteEmailInput = { email: string; inviteUrl: string };
let betaInviteEmailSender: (input: BetaInviteEmailInput) => Promise<boolean> = (input) => sendBetaInviteEmail(input);
export function setBetaInviteEmailSenderForTesting(fn: (input: BetaInviteEmailInput) => Promise<boolean>): void {
  betaInviteEmailSender = fn;
}
import { lookupZip } from "../src/zipcode.ts";
import { checkAuthRateLimit, checkStrictRateLimit, checkRateLimit } from "../src/rate-limit.ts";
import { getApproximateLocation } from "../src/geo.ts";
import { filterMessage } from "../src/profanity.ts";
import { VAPID_PUBLIC_KEY, sendPushNotification, pushEnabled } from "../src/push.ts";
import { generateCsrfToken, setCsrfCookie, verifyCsrfToken, getCsrfTokenFromRequest, CSRF_COOKIE } from "../src/csrf.ts";
import Stripe from "stripe";
import { mkdirSync, existsSync, writeFileSync, readFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { webcrypto } from "node:crypto";
import { storePhoto, readPhotoBuffer, deletePhoto, isStoragePhotoPath } from "../src/blob-store.ts";
import { deleteAnonUpload, maybeSweepExpiredAnonUploads } from "./anon-upload-retention";
import { resolveOwnedPhotoPaths, validateAnonymousGradePath } from "./photo-access";
import { canReviewPhoto, canTransitionQuarantine, isQuarantineStatus, privateReviewStorageReady, redactPhotoCase,  canUseOwnerAction, canTransition, isReportStatus, isReportPriority, isReportReason, REPORT_DETAILS_MAX, REPORT_RATE_LIMIT } from "./report-queue";
import { issueReviewAccess, readReviewPhoto, quarantinePhoto, privateReviewReady, ReviewAccessDeniedError } from "./private-review-storage";
import { getPrivateReviewProvider } from "./private-review-provider";
import { scanPhoto, policyForPhotoScan } from "./photo-moderation";
import { scanMessage, scanMessageHeuristics, policyForMessageScan, messageFlagTypeForReportReason, userReportPolicyForClassification } from "./message-moderation";
import { notifySafetyReviewer } from "./safety-review-notify";
import { isSuspensionReason, isSuspensionDuration, isAppealStatus, canReviewAppeal, canOverrideSuspension, durationEnds, APPEAL_TEXT_MAX } from "./suspensions";
import { hasPermission, isSuspended, isSuspensionException, privilegedMfaReady, type PrivilegedRole } from "./safety";
import { registrationOptions, authenticationOptions, verifyRegistration, verifyAuthentication, MFA_CHALLENGE_TTL_MS } from "./webauthn-mfa";
import { isCheckoutBlocked } from "./subscription-confirmation";
import { stripeErrorClientFields, stripeErrorDetails, stripeErrorMessage, stripeErrorStatus } from "./stripe-error";
import { retentionCronHandler } from "./retention-cron";
import { isStorePurchaseBlocked } from "./store-confirmation";
import { parseModerationContent, MODERATION_UNAVAILABLE_CODE, type ModerationResult } from "./moderation";
import {
  EVENTS,
  logError,
  logInfo,
  logWarn,
  requestIdFrom,
} from "./observability";

// ── Stripe constants ──────────────────────────────────────────

// PREMIUM_PRICE_ID is defined in ./canonical-entitlements and overridable via
// the PREMIUM_PRICE_ID env var (the owner's live Stripe price; falls back to
// the legacy hardcoded id when unset). Used for subscription checkout and as
// the default for Founders Club checkout.

// ── Node-compatible password hashing ───────────────────────────

// Node-compatible password hashing using Web Crypto API (available in Node 22)
const encoder = new TextEncoder();
async function hashPassword(password: string): Promise<string> {
  // Use PBKDF2 via Web Crypto for Node compatibility
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await webcrypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derived = await webcrypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  const hashHex = Buffer.from(new Uint8Array(derived)).toString("hex");
  const saltHex = Buffer.from(salt).toString("hex");
  return `${saltHex}:${hashHex}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const keyMaterial = await webcrypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derived = await webcrypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  return Buffer.from(new Uint8Array(derived)).toString("hex") === hashHex;
}

// Polyfill Bun.password for Node (Bun is not available on Vercel's Node runtime)
const BunPw = typeof (globalThis as any).Bun?.password?.hash === "function"
  ? (globalThis as any).Bun.password
  : { hash: hashPassword, verify: verifyPassword };

// Single source of truth for new-password rules, shared by signup, password
// reset, and change-password. Returns the app-standard error message, or null
// when the password is acceptable.
export function validateNewPassword(password: string): string | null {
  if (typeof password !== "string" || password.length < 6) {
    return "Password must be at least 6 characters";
  }
  return null;
}

function getUploadsDir(): string {
  // On Node/Vercel, use a temp directory; on Bun, use local uploads/
  if (typeof (globalThis as any).Bun === "undefined") {
    return "/tmp/uploads";
  }
  return path.join(import.meta.dir, "..", "uploads");
}

let _uploadsDir: string | null = null;
function uploadsDir(): string {
  if (_uploadsDir) return _uploadsDir;
  _uploadsDir = getUploadsDir();
  try {
    mkdirSync(_uploadsDir, { recursive: true });
  } catch {
    // Ignore — uploads may not be writable in serverless; the upload handler
    // will return a proper error when called.
  }
  return _uploadsDir;
}

const SESSION_COOKIE = "session_id";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function setSessionCookie(response: Response, sessionId: string): Response {
  const headers = new Headers(response.headers);
  headers.set(
    "Set-Cookie",
    `${SESSION_COOKIE}=${sessionId}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`,
  );
  return new Response(response.body, {
    status: response.status,
    headers,
  });
}

function clearSessionCookie(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set(
    "Set-Cookie",
    `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
  );
  return new Response(response.body, {
    status: response.status,
    headers,
  });
}

function getSessionId(req: Request): string | null {
  const cookie = req.headers.get("cookie");
  if (!cookie) return null;
  const match = cookie.match(
    new RegExp(`${SESSION_COOKIE}=([^;]+)`),
  );
  return match ? match[1] : null;
}

async function getCurrentSession(req: Request): Promise<Session | null> {
  const id = getSessionId(req); return id ? getSessionById(id) : null;
}
async function getCurrentUser(req: Request): Promise<User | null> {
  const session = await getCurrentSession(req); if (!session) return null;
  const user = await getUserById(session.user_id);
  if (user?.subscription_status === "active" && user.subscription_expires_at && new Date(user.subscription_expires_at).getTime() <= Date.now() && !user.stripe_subscription_id) { await updateSubscriptionStatus(user.id, "inactive"); return getUserById(user.id); }
  return user;
}

type SafeUser = Omit<User, "password_hash">;

function toSafeUser(user: User): SafeUser {
  const { password_hash: _, ...safe } = user;
  return { ...safe, verification_required: verificationRequired() } as SafeUser;
}

function requireSubscription(user: User): Response | null {
  if (!hasPremiumEntitlement(user.subscription_status, user.subscription_expires_at, user.trial_ends_at)) {
    return json(
      { error: "Subscription required", code: "NO_SUBSCRIPTION" },
      402,
    );
  }
  return null;
}

// Central fail-closed gate: every authenticated API action checks suspension here.
async function enforceSafety(req: Request, pathname: string): Promise<Response | null> {
  if (isSuspensionException(pathname, req.method)) return null;
  const publicPath = pathname === "/api/health" || pathname === "/api/ready" || pathname === "/api/csrf" || pathname === "/api/geo-check" || pathname === "/api/auth/signup" || pathname === "/api/auth/login" || pathname === "/api/auth/forgot-password" || pathname === "/api/auth/reset-password" || pathname === "/api/webhooks/stripe" || pathname === "/api/waitlist/join" || pathname === "/api/contact";
  if (publicPath) return null;
  const user = await getCurrentUser(req);
  if (user && isSuspended(user)) return json({ error: "Account suspended", code: "ACCOUNT_SUSPENDED" }, 423);
  if (pathname.startsWith("/api/admin/")) {
    const role = user?.role as PrivilegedRole | undefined;
    const session = await getCurrentSession(req);
    if (!user || !hasPermission(user, ["owner", "admin", "moderator"]) || !privilegedMfaReady() || !session?.mfa_verified_at) return json({ error: "MFA-verified privileged session required", code: "PRIVILEGED_MFA_REQUIRED" }, 403);
    await recordAdminAuditEvent({ actorUserId: user.id, action: "admin.route.check", targetType: "route", targetId: pathname, requestId: req.headers.get("x-request-id") ?? undefined });
    void role;
  }
  return null;
}

async function handleSuspensionAppeal(req: Request): Promise<Response> { const user=await getCurrentUser(req); if(!user)return json({error:"Unauthorized"},401); const path=new URL(req.url).pathname; if(req.method==='GET'){ await recordAdminAuditEvent({actorUserId:user.id,action:'appeal.status.read',targetType:'appeal'}); return json({appeals:(await getAppeals(user.id)).map(({id,suspension_id,status,created_at,reviewed_at})=>({id,suspension_id,status,created_at,reviewed_at}))}); } const body=await req.json().catch(()=>null); if(typeof body?.suspension_id!== 'string'||typeof body?.text!=='string'||!body.text.trim()||body.text.length>APPEAL_TEXT_MAX)return json({error:'Invalid appeal'},400); const appeal=await createAppeal(body.suspension_id,user.id,body.text.trim()); if(!appeal)return json({error:'Appeal unavailable'},409); await recordAdminAuditEvent({actorUserId:user.id,action:'appeal.submit',targetType:'appeal',targetId:String(appeal.id)}); return json({appeal:{id:appeal.id,status:appeal.status,created_at:appeal.created_at}},201); }
async function handleSuspensionAdmin(req: Request, id?: string): Promise<Response> { const actor=await getCurrentUser(req); if(!actor||!canReviewAppeal(actor.role))return json({error:'Forbidden'},403); if(req.method==='GET'){await recordAdminAuditEvent({actorUserId:actor.id,action:'appeal.queue.read',targetType:'appeal'});return json({appeals:(await getAppeals()).map(({id,suspension_id,user_id,status,created_at,reviewed_at})=>({id,suspension_id,user_id,status,created_at,reviewed_at}))});} const body=await req.json().catch(()=>null); if(id&&body?.action==='revoke'){ if(!canOverrideSuspension(actor.role)) return json({error:'Owner/admin action required'},403); const ok=await revokeSuspension(id,actor.id); if(!ok)return json({error:'Invalid transition'},409); await recordAdminAuditEvent({actorUserId:actor.id,action:'suspension.revoke',targetType:'suspension',targetId:id}); return json({ok:true}); } if(id&&body?.status&&isAppealStatus(body.status)){if(!canOverrideSuspension(actor.role)&&body.status==='granted')return json({error:'Owner/admin action required'},403);const result=await reviewAppeal(id,body.status,actor.id);if(!result)return json({error:'Invalid transition'},409);await recordAdminAuditEvent({actorUserId:actor.id,action:'appeal.review',targetType:'appeal',targetId:id,metadata:{status:body.status}});return json({ok:true});} const target=Number(body?.user_id);if(!Number.isInteger(target)||!isSuspensionReason(body?.reason)||!isSuspensionDuration(body?.duration))return json({error:'Invalid suspension'},400);if(target===actor.id)return json({error:'Cannot suspend self'},403);const created=await createSuspension({userId:target,reason:body.reason,duration:body.duration,endsAt:durationEnds(body.duration),actorUserId:actor.id,sourceReportId:body.source_report_id??null,sourceCaseId:body.source_case_id??null});await recordAdminAuditEvent({actorUserId:actor.id,action:'suspension.create',targetType:'user',targetId:String(target),metadata:{reason:body.reason,duration:body.duration}});return json({suspension:created}); }
// ── API Route Handlers ────────────────────────────────────────

async function handleSignup(req: Request): Promise<Response> {
  const request_id = requestIdFrom(req);
  logInfo(EVENTS.SIGNUP_STARTED, { request_id, channel: "api" });
  // Dedicated signup bucket (20/15 min per client) — generous enough for
  // shared-IP cohort onboarding (office/ISP NAT), still bounded to blunt
  // mass account creation. Never shared with waitlist/auth endpoints so
  // one funnel can’t starve another. Generic 429, no information leak.
  const rateLimitResponse = checkRateLimit(req, "signup", { maxRequests: 20, windowMs: 15 * 60 * 1000 });
  if (rateLimitResponse) return rateLimitResponse;

  const body = await req.json().catch(() => null);
  if (!body?.email || !body?.password) {
    return json({ error: "Email and password are required" }, 400);
  }

  const email = String(body.email).trim().toLowerCase();
  const password = String(body.password);
  const dateOfBirth = body.date_of_birth ? String(body.date_of_birth) : null;
  const referralCode = body.referral_code ? String(body.referral_code).trim().toUpperCase() : null;

  const passwordError = validateNewPassword(password);
  if (passwordError) {
    return json({ error: passwordError }, 400);
  }

  // Validate age: user must be at least 18
  if (dateOfBirth) {
    const dob = new Date(dateOfBirth);
    if (isNaN(dob.getTime())) {
      return json({ error: "Invalid date of birth" }, 400);
    }
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
    if (age < 18) {
      return json({ error: "You must be at least 18 years old to use GradeDate" }, 400);
    }
  } else {
    return json({ error: "Date of birth is required" }, 400);
  }

  const existing = await getUserByEmail(email);
  if (existing) {
    return json({ error: "An account with this email already exists" }, 409);
  }

  // Closed-beta gate (Austin cohort). When BETA_INVITE_REQUIRED=true, signup
  // requires a valid beta invite code AND an Austin-metro IP location. The
  // invite code also lives in referral_codes (max_uses=1), so the inviter's
  // referral reward fires through the existing machinery on redemption below.
  if (betaInviteRequired()) {
    if (!referralCode) {
      return json({ error: "An invite code is required to join the Austin beta — join the waitlist to be notified when it opens.", code: "BETA_INVITE_REQUIRED" }, 400);
    }
    const invite = await getBetaInviteCodeByCode(referralCode);
    if (!invite) {
      return json({ error: "Invalid invite code — join the waitlist to be notified when the Austin beta opens.", code: "BETA_INVITE_INVALID" }, 403);
    }
    if (invite.redeemed_at) {
      return json({ error: "This invite code has already been used — join the waitlist for the next cohort.", code: "BETA_INVITE_ALREADY_REDEEMED" }, 409);
    }
    const location = await getApproximateLocation(req);
    if (!location.isAustinMetro) {
      return json({ error: "The Austin beta is open to the Austin metro area only — join the waitlist and we'll let you know when it expands.", code: "BETA_AUSTIN_ONLY" }, 403);
    }
    const redeemedCount = await getRedeemedBetaInviteCount();
    if (redeemedCount >= betaCohortCap()) {
      await enrollInWaitlistOnFull(email);
      return json({ error: "The Austin beta cohort is full — we've added you to the waitlist.", code: "BETA_COHORT_FULL" }, 409);
    }
  }

  let user: User;
  try {
    const passwordHash = await BunPw.hash(password);
    user = await createUser(email, passwordHash, dateOfBirth ?? undefined);
  } catch (err) {
    // A concurrent signup can win the unique-email race after the preflight
    // lookup. Keep that result actionable without exposing database details.
    const detail = err instanceof Error ? `${err.name} ${err.message}`.toLowerCase() : String(err).toLowerCase();
    if (detail.includes("unique") || detail.includes("duplicate") || detail.includes("constraint")) {
      return json({ error: "An account with this email already exists" }, 409);
    }
    logError(EVENTS.SIGNUP_FAILED, { request_id, account_created: false, err: err instanceof Error ? err : new Error(String(err)) });
    return json({ error: "Signup is temporarily unavailable. Please try again shortly.", code: "SIGNUP_UNAVAILABLE" }, 503);
  }
  const session = await createSession(user.id);

  // Beta redemption claims the code atomically against the cohort cap. If a
  // concurrent signup took the last spot between the pre-check above and now,
  // unwind the just-created account so no orphan user exists outside the beta.
  if (betaInviteRequired() && referralCode) {
    const redeemed = await redeemBetaInviteCode(referralCode, user.id);
    if (!redeemed.success) {
      await deleteUserAccount(user.id).catch(() => {});
      if (redeemed.error === "cohort_full") {
        await enrollInWaitlistOnFull(email);
        return json({ error: "The Austin beta cohort is full — we've added you to the waitlist.", code: "BETA_COHORT_FULL" }, 409);
      }
      return json({ error: "This invite code is no longer valid — join the waitlist for the next cohort.", code: "BETA_INVITE_INVALID" }, 409);
    }
  }

  // Process referral code if provided
  if (referralCode) {
    const referralResult = await applyReferralCode(referralCode, user.id);
    if (!referralResult.success) {
      // Don't fail signup — just log it; the frontend can also display a notice.
      // The code itself is never logged (it is a redeemable token).
      logWarn(EVENTS.AUTH_REFERRAL_FAILED, {
        user_id: user.id,
        err: new Error(referralResult.error ?? "Referral code rejected"),
      });
    }
  }

  logInfo(EVENTS.SIGNUP_COMPLETED, { request_id, account_created: true });
  return setSessionCookie(
    setCsrfCookie(json({ user: toSafeUser(user) }, 201), generateCsrfToken()),
    session.id,
  );
}

async function handleLogin(req: Request): Promise<Response> {
  const rateLimitResponse = checkAuthRateLimit(req);
  if (rateLimitResponse) return rateLimitResponse;

  const body = await req.json().catch(() => null);
  if (!body?.email || !body?.password) {
    return json({ error: "Email and password are required" }, 400);
  }

  const email = String(body.email).trim().toLowerCase();
  const password = String(body.password);

  const user = await getUserByEmail(email);
  if (!user) {
    return json({ error: "Invalid email or password" }, 401);
  }

  const valid = await BunPw.verify(password, user.password_hash);
  if (!valid) {
    return json({ error: "Invalid email or password" }, 401);
  }
  // Password authentication never creates a privileged session. Owners,
  // admins, and moderators must use the passkey step-up flow below.
  if (["owner", "admin", "moderator"].includes(String(user.role))) {
    await recordAdminAuditEvent({ actorUserId: user.id, actorRole: user.role, action: "mfa.password_only_denied", targetType: "user", targetId: String(user.id), requestId: requestIdFrom(req) });
    return json({ error: "Privileged MFA required", code: "PRIVILEGED_MFA_REQUIRED" }, 403);
  }

  const session = await createSession(user.id);
  return setSessionCookie(
    setCsrfCookie(json({ user: toSafeUser(user) }), generateCsrfToken()),
    session.id,
  );
}

async function handleLogout(req: Request): Promise<Response> {
  const sessionId = getSessionId(req);
  if (sessionId) {
    await deleteSession(sessionId);
  }
  return clearSessionCookie(json({ ok: true }));
}

async function handleMe(req: Request): Promise<Response> {
  const user = await getCurrentUser(req);
  if (!user) {
    return json({ user: null }, 401);
  }
  const safe = toSafeUser(user);
  const photos = await getUserPhotos(user.id);
  const badges = await getUserBadges(user);
  let response = json({ user: { ...safe, photos, badges } });

  // Ensure CSRF cookie is set for existing sessions (login before CSRF was added)
  if (!getCsrfTokenFromRequest(req)) {
    response = setCsrfCookie(response, generateCsrfToken());
  }

  return response;
}

async function moderateUploadedPhoto(photoId: number, userId: number, photoPath: string, bytes: ArrayBuffer, contentType: string): Promise<void> {
  const result = await scanPhoto(new Uint8Array(bytes), contentType);
  const policy = policyForPhotoScan(result);
  if (!policy.flag) return;
  await upsertModerationFlag(photoId, userId, result.classification === "error" ? "error" : result.classification, result.confidence, result.providerRef, "new");
  const existingCase = await getPhotoModerationCaseForPhoto(photoId, userId);
  const caseRecord = existingCase ?? await createPhotoModerationCase(photoId, userId, "automated_photo_scan", result.classification, result.classification);
  if (caseRecord) {
    // Owner safety-reviewer notification — fire and forget, never fails uploads.
    void notifySafetyReviewer({ kind: "photo", caseId: String(caseRecord.id), flagType: result.classification, source: "automated_photo_scan", confidence: result.confidence, reason: result.classification }).catch(() => {});
  }
  if (!caseRecord || !policy.quarantine || existingCase?.private_object_key) return;
  const provider = getPrivateReviewProvider();
  if (!provider || !privateReviewReady()) return;
  const objectKey = `quarantine/${caseRecord.id}/${photoId}`;
  await quarantinePhoto(provider, objectKey, new Uint8Array(bytes), contentType);
  await attachPrivatePhotoObject(String(caseRecord.id), objectKey, contentType);
  await transitionPhotoModerationCase(String(caseRecord.id), "quarantined", userId, result.classification);
  if (policy.lockAccount) await createSuspension({ userId, reason: "underage", duration: "indefinite", endsAt: null, actorUserId: null, sourceCaseId: String(caseRecord.id) });
  void photoPath;
}

async function handleUpload(req: Request): Promise<Response> {
  const request_id = requestIdFrom(req);
  logInfo(EVENTS.PHOTO_UPLOAD_STARTED, { request_id, user_type: "unknown" });
  const rateLimitResponse = checkRateLimit(req, "upload", { maxRequests: 10, windowMs: 15 * 60 * 1000 });
  if (rateLimitResponse) return rateLimitResponse;

  const user = await getCurrentUser(req);

  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return json({ error: "Expected multipart/form-data" }, 400);
  }

  const formData = await req.formData().catch(() => null);
  if (!formData) {
    return json({ error: "Invalid form data" }, 400);
  }

  // Accept multiple files under the "photo" key (or "photos")
  const files: File[] = [];
  for (const [key, value] of formData.entries()) {
    if ((key === "photo" || key === "photos") && value instanceof File) {
      files.push(value);
    }
  }

  if (files.length === 0) {
    logInfo(EVENTS.UPLOAD_REJECTED, { reason: "no_files" });
    logWarn(EVENTS.PHOTO_UPLOAD_FAILED, { request_id, reason: "no_files" });
    return json({ error: "No photo file provided" }, 400);
  }

  if (files.length > 5) {
    logInfo(EVENTS.UPLOAD_REJECTED, { reason: "too_many_files", file_count: files.length });
    logWarn(EVENTS.PHOTO_UPLOAD_FAILED, { request_id, reason: "too_many_files" });
    return json({ error: "Maximum 5 photos per upload" }, 400);
  }

  const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
  for (const file of files) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      logInfo(EVENTS.UPLOAD_REJECTED, { reason: "unsupported_type" });
      logWarn(EVENTS.PHOTO_UPLOAD_FAILED, { request_id, reason: "unsupported_type" });
      return json({ error: "Only JPEG, PNG, and WebP images are allowed" }, 400);
    }
  }

  const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4 MB — must stay under Vercel's ~4.5 MB function-payload ceiling (uploads beyond it 413 before app code runs)
  for (const file of files) {
    if (file.size > MAX_FILE_SIZE) {
      logInfo(EVENTS.UPLOAD_REJECTED, { reason: "file_too_large" });
      logWarn(EVENTS.PHOTO_UPLOAD_FAILED, { request_id, reason: "file_too_large" });
      return json({ error: "Photo must be under 4 MB" }, 400);
    }
  }

  // Snapshot the pre-batch photo count once (authenticated users only) so the
  // sort_order / primary / photo_path logic below never drifts as rows are
  // inserted inside the loop. sort_order must be sequential within a batch
  // (0..4 for a fresh 5-photo batch) and append after pre-existing photos.
  const basePhotoCount = user ? await getUserPhotoCount(user.id) : 0;
  if (user && basePhotoCount >= 6) {
    return json({ error: "Maximum 6 photos allowed. Please delete one first." }, 400);
  }
  const uploadResults: { id?: number; photo_path: string; sort_order?: number; is_primary?: boolean }[] = [];

  for (const [index, file] of files.entries()) {
    const ext = file.name.split(".").pop() || "jpg";
    const buffer = await file.arrayBuffer();

    if (user) {
      // Authenticated user — enforce the 6-photo cap as the batch grows.
      const photoCount = basePhotoCount + index;
      if (photoCount >= 6) {
        return json({ error: "Maximum 6 photos allowed. Please delete one first." }, 400);
      }

      const storageFilename = `${user.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
      // Store photo (uses Vercel Blob on Vercel, local filesystem otherwise)
      const storedPath = await storePhoto(storageFilename, buffer, file.type);

      // Sequential sort_order within the batch: append after pre-existing photos.
      const sortOrder = basePhotoCount + index;
      const photo = await addUserPhoto(user.id, storedPath, sortOrder);

      // The first photo of a batch that starts a photo-less profile becomes the
      // primary. setPrimaryPhoto also syncs users.photo_path to it, and its
      // return value carries the fresh is_primary flag for the response (the
      // row from addUserPhoto is always is_primary=false).
      let isPrimary = Boolean(photo.is_primary);
      if (basePhotoCount === 0 && index === 0) {
        const primary = await setPrimaryPhoto(user.id, photo.id);
        isPrimary = Boolean(primary?.is_primary);
      }

      uploadResults.push({ id: photo.id, photo_path: photo.photo_path, sort_order: photo.sort_order, is_primary: isPrimary });
      // Scanner is deliberately asynchronous: provider failures never fail uploads.
      void moderateUploadedPhoto(photo.id, user.id, storedPath, buffer, file.type).catch((error) => logError(EVENTS.PHOTO_UPLOAD_FAILED, { request_id, reason: "moderation_failed", error: error instanceof Error ? error.message : "unknown" }));
    } else {
      // Anonymous free preview — save to temp/blobs
      const anonId = crypto.randomUUID();
      const storageFilename = `anon_${anonId}.${ext}`;
      const storedPath = await storePhoto(storageFilename, buffer, file.type);
      uploadResults.push({ photo_path: storedPath });
      // Opportunistic TTL sweep (throttled): clears out anonymous uploads
      // abandoned before grading. Fire-and-forget — never blocks the upload.
      maybeSweepExpiredAnonUploads().catch(() => {});
    }
  }

  if (user) {
    logInfo(EVENTS.UPLOAD_COMPLETED, { user_type: "authenticated", file_count: uploadResults.length, user_id: user.id });
    logInfo(EVENTS.PHOTO_UPLOAD_COMPLETED, { request_id, user_type: "authenticated", file_count: uploadResults.length });
    return json({ photos: uploadResults });
  }
  logInfo(EVENTS.UPLOAD_COMPLETED, { user_type: "anonymous", file_count: uploadResults.length });
  logInfo(EVENTS.PHOTO_UPLOAD_COMPLETED, { request_id, user_type: "anonymous", file_count: uploadResults.length });
  return json({ photo_paths: uploadResults.map(r => r.photo_path) });
}

async function handleUpdateProfile(req: Request): Promise<Response> {
  const user = await getCurrentUser(req);
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return json({ error: "Invalid request body" }, 400);
  }

  const { display_name, age, gender, looking_for, bio, photo_path, latitude, longitude, max_distance, location_city, location_state, communication_style, lifestyle, dating_goals, college, occupation, hobbies, height, pronouns, ideal_first_date, green_flags, red_flags, obsessions } = body;

  // Support partial updates: only validate fields that are explicitly provided
  if (display_name !== undefined && (!display_name || String(display_name).trim().length === 0)) {
    return json({ error: "Display name cannot be empty" }, 400);
  }
  if (age !== undefined) {
    const ageNum = Number(age);
    if (isNaN(ageNum) || ageNum < 18 || ageNum > 120) {
      return json({ error: "Age must be between 18 and 120" }, 400);
    }
  }
  if (gender !== undefined && !gender) {
    return json({ error: "Gender is required" }, 400);
  }
  if (looking_for !== undefined && !looking_for) {
    return json({ error: "Looking for preference is required" }, 400);
  }

  // Validate location fields if provided
  if (latitude !== undefined && (isNaN(Number(latitude)) || Number(latitude) < -90 || Number(latitude) > 90)) {
    return json({ error: "Latitude must be between -90 and 90" }, 400);
  }
  if (longitude !== undefined && (isNaN(Number(longitude)) || Number(longitude) < -180 || Number(longitude) > 180)) {
    return json({ error: "Longitude must be between -180 and 180" }, 400);
  }
  if (max_distance !== undefined) {
    const dist = Number(max_distance);
    if (isNaN(dist) || dist < 1 || dist > 500) {
      return json({ error: "Max distance must be between 1 and 500 miles" }, 400);
    }
  }

  // photo_path must reference this app's own storage (a local /uploads path or
  // a URL on our storage origin) — never an arbitrary external URL or another
  // user's photo. Prevents SSRF and unauthorized reads via later grading, and
  // deletion abuse via NSFW cleanup, from a poisoned profile field.
  if (
    photo_path !== undefined &&
    photo_path !== null &&
    String(photo_path) !== "" &&
    !isStoragePhotoPath(String(photo_path))
  ) {
    return json(
      { error: "photo_path must reference an uploaded photo", code: "INVALID_PHOTO_PATH" },
      400,
    );
  }

  // Profanity filter for bio and expanded text fields
  const textFieldsToFilter: Record<string, string | undefined> = {
    bio: bio !== undefined && typeof bio === "string" ? bio.trim() : undefined,
    hobbies: hobbies !== undefined && typeof hobbies === "string" ? hobbies.trim() : undefined,
    ideal_first_date: ideal_first_date !== undefined && typeof ideal_first_date === "string" ? ideal_first_date.trim() : undefined,
    green_flags: green_flags !== undefined && typeof green_flags === "string" ? green_flags.trim() : undefined,
    red_flags: red_flags !== undefined && typeof red_flags === "string" ? red_flags.trim() : undefined,
    obsessions: obsessions !== undefined && typeof obsessions === "string" ? obsessions.trim() : undefined,
  };
  for (const [fieldName, fieldValue] of Object.entries(textFieldsToFilter)) {
    if (fieldValue && fieldValue.length > 0) {
      const filterResult = filterMessage(fieldValue);
      if (filterResult.blocked) {
        return json({ error: `${fieldName.replace(/_/g, " ")} contains inappropriate content` }, 400);
      }
    }
  }

  // Merge with existing values for partial updates
  await updateUserProfile(user.id, {
    display_name: display_name !== undefined ? String(display_name).trim() : (user.display_name || ""),
    age: age !== undefined ? Number(age) : (user.age || 0),
    gender: gender !== undefined ? String(gender) : (user.gender || ""),
    looking_for: looking_for !== undefined ? String(looking_for) : (user.looking_for || "everyone"),
    bio: bio !== undefined ? String(bio).trim() : (user.bio || ""),
    photo_path: photo_path !== undefined ? String(photo_path) : (user.photo_path || ""),
    ...(latitude !== undefined ? { latitude: Number(latitude) } : {}),
    ...(longitude !== undefined ? { longitude: Number(longitude) } : {}),
    ...(max_distance !== undefined ? { max_distance: Number(max_distance) } : {}),
    ...(location_city !== undefined ? { location_city: String(location_city) } : {}),
    ...(location_state !== undefined ? { location_state: String(location_state) } : {}),
    ...(communication_style !== undefined ? { communication_style: communication_style ? String(communication_style) : null } : {}),
    ...(lifestyle !== undefined ? { lifestyle: lifestyle ? String(lifestyle) : null } : {}),
    ...(dating_goals !== undefined ? { dating_goals: dating_goals ? String(dating_goals) : null } : {}),
    ...(college !== undefined ? { college: college ? String(college) : null } : {}),
    ...(occupation !== undefined ? { occupation: occupation ? String(occupation) : null } : {}),
    ...(hobbies !== undefined ? { hobbies: hobbies ? String(hobbies) : null } : {}),
    ...(height !== undefined ? { height: height ? String(height) : null } : {}),
    ...(pronouns !== undefined ? { pronouns: pronouns ? String(pronouns) : null } : {}),
    ...(ideal_first_date !== undefined ? { ideal_first_date: ideal_first_date ? String(ideal_first_date) : null } : {}),
    ...(green_flags !== undefined ? { green_flags: green_flags ? String(green_flags) : null } : {}),
    ...(red_flags !== undefined ? { red_flags: red_flags ? String(red_flags) : null } : {}),
    ...(obsessions !== undefined ? { obsessions: obsessions ? String(obsessions) : null } : {}),
  });

  // Check and award newly earned badges after profile update
  await checkAndAwardBadges(user.id);

  return json({ ok: true });
}

// ── Grading ──────────────────────────────────────────────────

function getWeightedRandomGrade(): number {
  // Bell-curve weighted: most people get 4-7, fewer get extremes
  // We'll sum three random rolls to approximate normal distribution
  const roll = Math.random() + Math.random() + Math.random();
  // roll ranges from 0-3, center around 1.5. Map to 1-10.
  // Normalize: roll/3 gives 0-1 centered at 0.5
  const normalized = roll / 3;
  // Map to 1-10 scale
  const raw = Math.round(normalized * 9 + 1);
  // Clamp to 1-10
  return Math.max(1, Math.min(10, raw));
}

async function nsfwCheck(photoPath: string): Promise<ModerationResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return "UNKNOWN";
  }

  let buffer: Buffer;
  try {
    buffer = await readPhotoBuffer(photoPath);
  } catch {
    return "UNKNOWN";
  }

  const filename = path.basename(photoPath);
  const base64Image = buffer.toString("base64");
  const mimeType =
    filename.endsWith(".png") ? "image/png" :
    filename.endsWith(".webp") ? "image/webp" :
    "image/jpeg";

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Does this photo contain nudity, sexually explicit content, or gore? Answer ONLY 'SAFE' or 'NSFW'.",
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${base64Image}`,
                  detail: "low",
                },
              },
            ],
          },
        ],
        max_tokens: 10,
        temperature: 0,
      }),
    });

    if (!response.ok) {
      logWarn(EVENTS.MODERATION_NSFW_HTTP_ERROR, { status: response.status });
      return "UNKNOWN";
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };

    const content = data.choices?.[0]?.message?.content;
    return parseModerationContent(content);
  } catch (err) {
    logWarn(EVENTS.MODERATION_NSFW_FAILED, { err });
    return "UNKNOWN";
  }
}

async function gradeWithAI(photoPath: string): Promise<{ grade: number; analysis: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  // Read the photo (handles both blob URLs and local files)
  const filename = path.basename(photoPath);

  let buffer: Buffer;
  try {
    buffer = await readPhotoBuffer(photoPath);
  } catch {
    throw new Error(`Photo file not found: ${photoPath}`);
  }

  const base64Image = buffer.toString("base64");
  const mimeType =
    filename.endsWith(".png") ? "image/png" :
    filename.endsWith(".webp") ? "image/webp" :
    filename.endsWith(".gif") ? "image/gif" :
    "image/jpeg";

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You are a dating profile photo coach. Analyze the given photo and rate its quality on a 1-10 scale (1=poor, 10=outstanding). Consider: lighting quality, composition and framing, how confidently the person presents themselves, overall photo appeal for a dating profile. Respond ONLY with a JSON object in this exact format: {\"grade\": <number 1-10>, \"analysis\": \"<brief one-line constructive tip>\"}",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Rate this dating profile photo's quality on a 1-10 scale.",
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`,
                detail: "low",
              },
            },
          ],
        },
      ],
      max_tokens: 150,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`OpenAI API error ${response.status}: ${errText}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Empty response from OpenAI");
  }

  // Parse the JSON from the response (may contain markdown code fences)
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Could not parse grade from OpenAI response: ${content}`);
  }

  const parsed = JSON.parse(jsonMatch[0]);
  const grade = Math.max(1, Math.min(10, Math.round(Number(parsed.grade) || 5)));
  const analysis = String(parsed.analysis || "");

  return { grade, analysis };
}

async function handleGrade(req: Request): Promise<Response> {
  const rateLimitResponse = checkRateLimit(req, "grade", { maxRequests: 5, windowMs: 15 * 60 * 1000 });
  if (rateLimitResponse) return rateLimitResponse;

  const user = await getCurrentUser(req);

  // For anonymous free preview, accept photo_path in the request body
  let photoPath: string | null = null;

  if (user) {
    // Authenticated user
    if (hasPremiumEntitlement(user.subscription_status, user.subscription_expires_at, user.trial_ends_at)) {
      // Subscriber (or active trial): full flow — require photo, process, save grade
      if (!user.photo_path) {
        return json({ error: "You must upload a photo before getting graded" }, 400);
      }

      if (user.grade !== null && user.regrades_available <= 0) {
        return json({ error: "You have already been graded. Purchase a re-grade from the store.", grade: user.grade }, 400);
      }

      // If user has regrades available, consume one and allow re-grade
      if (user.grade !== null && user.regrades_available > 0) {
        await useReGrade(user.id);
      }

      photoPath = user.photo_path;
    } else {
      // Logged-in non-subscriber: free preview — grade gets saved to profile
      if (!user.photo_path) {
        return json({ error: "You must upload a photo before getting graded" }, 400);
      }
      photoPath = user.photo_path;
    }
  } else {
    // Anonymous: accept ONLY a server-issued anonymous upload handle from the
    // upload flow. Arbitrary paths (external URLs, other users' photos, file
    // system paths) are rejected before any read, NSFW check, or deletion.
    const body = await req.json().catch(() => null);
    const anonPath = validateAnonymousGradePath(body?.photo_path);
    if (!anonPath.ok) {
      return json(
        {
          error: anonPath.error,
          ...(anonPath.code ? { code: anonPath.code } : {}),
        },
        400,
      );
    }
    photoPath = anonPath.path;
  }

  if (!photoPath) {
    return json({ error: "No photo available for grading" }, 400);
  }

  // Defense-in-depth for authenticated grading: `photo_path` must reference
  // this app's own storage (a local /uploads path or a URL on our storage
  // origin). This also neutralizes any legacy rows poisoned with arbitrary
  // URLs before this hardening existed.
  if (user && !isStoragePhotoPath(photoPath)) {
    return json(
      {
        error: "Your profile photo reference is invalid. Please re-upload your photo.",
        code: "INVALID_PHOTO_PATH",
      },
      400,
    );
  }

  // NSFW screening before grading
  const nsfwResult = await nsfwCheck(photoPath);
  if (nsfwResult === "UNKNOWN") {
    logWarn(EVENTS.MODERATION_UNAVAILABLE, { user_type: user ? "authenticated" : "anonymous", reason: "provider_unavailable" });
    return json({ error: "This photo was not approved or graded yet because moderation is temporarily unavailable. Please try again; this does not mean the photo is unsafe.", code: MODERATION_UNAVAILABLE_CODE, retryable: true }, 503);
  }
  if (nsfwResult === "NSFW") {
    logWarn(EVENTS.GRADE_NSFW_BLOCKED, { user_type: user ? "authenticated" : "anonymous" });
    // Clean up the file — deletion is ownership-scoped: anonymous grades only
    // delete the validated anon upload handle; authenticated grades only ever
    // delete the user's own profile photo (validated above).
    try {
      if (user) {
        await deletePhoto(photoPath);
      } else {
        await deleteAnonUpload(photoPath);
      }
    } catch {
      // Best effort cleanup
    }

    if (user) {
      await updateUserProfile(user.id, {
        display_name: user.display_name || "",
        age: user.age || 0,
        gender: user.gender || "",
        looking_for: user.looking_for || "everyone",
        bio: user.bio || "",
        photo_path: "",
      });
    }

    return json({
      error: "This photo appears to contain inappropriate content. Please upload a different photo that follows our content rules.",
      code: "NSFW",
    }, 400);
  }

  let grade: number;
  let analysis: string | null = null;
  let usedAI = false;
  let fallbackError: unknown = null;

  try {
    const result = await gradeWithAI(photoPath);
    grade = result.grade;
    analysis = result.analysis;
    usedAI = true;
  } catch (err) {
    // Fall back to mock weighted random grade on any failure
    fallbackError = err;
    grade = getWeightedRandomGrade();
    usedAI = false;
  }

  // Save grade to profile for authenticated users only
  if (user) {
    await updateUserGrade(user.id, grade);
    await checkAndAwardBadges(user.id);
  }

  const response = json({
    grade,
    ...(analysis ? { analysis } : {}),
    grading_method: aggregateGradingMethod(usedAI ? 1 : 0, 1),
  });
  // Anonymous free-preview: the uploaded photo is only needed server-side
  // while grading runs (the client renders results from local object URLs),
  // so delete it immediately after the response is built. Authenticated
  // profile photos are never touched here.
  if (!user && photoPath) {
    await deleteAnonUpload(photoPath);
  }
  logInfo(
    usedAI ? EVENTS.GRADE_COMPLETED : EVENTS.GRADE_FALLBACK,
    {
      user_type: user ? "authenticated" : "anonymous",
      ...(usedAI ? {} : { reason: "ai_provider_unavailable" }),
      method: usedAI ? "ai" : "fallback",
      grade,
      
    },
    usedAI ? undefined : "AI grading unavailable — used deterministic fallback",
  );
  return response;
}

// ── Multi-Photo Grading (Rebrand) ─────────────────────────────

async function gradePhotoWithAI(photoPath: string): Promise<{ grade: number; feedback: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const filename = path.basename(photoPath);

  let buffer: Buffer;
  try {
    buffer = await readPhotoBuffer(photoPath);
  } catch {
    throw new Error(`Photo file not found: ${photoPath}`);
  }

  const base64Image = buffer.toString("base64");
  const mimeType =
    filename.endsWith(".png") ? "image/png" :
    filename.endsWith(".webp") ? "image/webp" :
    "image/jpeg";

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "Grade this photo 1-10 and give ONE short actionable tip. Examples: 'Smile with teeth', 'Use outdoor lighting', 'Crop closer to face', 'Shoot from above eye level'. Return ONLY JSON: {\"grade\": number, \"feedback\": string}",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Grade this photo 1-10 and give one short actionable tip.",
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`,
                detail: "low",
              },
            },
          ],
        },
      ],
      max_tokens: 100,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`OpenAI API error ${response.status}: ${errText}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Empty response from OpenAI");
  }

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Could not parse grade from OpenAI response: ${content}`);
  }

  const parsed = JSON.parse(jsonMatch[0]);
  const grade = Math.max(1, Math.min(10, Math.round(Number(parsed.grade) || 5)));
  const feedback = String(parsed.feedback || "");

  return { grade, feedback };
}

async function handleGradePhotos(req: Request): Promise<Response> {
  const request_id = requestIdFrom(req);
  logInfo(EVENTS.GRADING_STARTED, { request_id, flow: "multi_photo" });
  const user = await getCurrentUser(req);
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const body = await req.json().catch(() => null);
  if (!body?.photo_paths || !Array.isArray(body.photo_paths)) {
    return json({ error: "photo_paths array is required (1-5 photos)" }, 400);
  }

  // Resolve submitted paths ONLY to photos the current user owns. Any
  // cross-user, external, or fabricated path rejects the whole request, so
  // grading and NSFW cleanup below can never read or delete anything that is
  // not this user's own photo.
  const ownedPhotos = await getUserPhotos(user.id);
  const resolution = resolveOwnedPhotoPaths(
    body.photo_paths,
    ownedPhotos.map((p) => p.photo_path),
  );
  if (!resolution.ok) {
    return json(
      {
        error: resolution.error,
        ...(resolution.code ? { code: resolution.code } : {}),
      },
      400,
    );
  }
  const photoPaths = resolution.paths;

  // A repeat authenticated grading run consumes one paid regrade credit.
  // New free users retain one run per seven-day window.
  const hasActivePremium = hasPremiumEntitlement(user.subscription_status, user.subscription_expires_at, user.trial_ends_at);
  if (user.grade !== null && hasActivePremium) {
    if (!(await useReGrade(user.id))) return json({ error: "Purchase a $0.99 re-grade credit to grade again.", code: "REGRADE_REQUIRED" }, 402);
  } else if (!hasActivePremium) {
    const now = new Date();
    const lastFree = user.last_free_regrade_at ? new Date(user.last_free_regrade_at) : null;
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    if (lastFree && (now.getTime() - lastFree.getTime()) < sevenDaysMs) {
      const daysLeft = Math.ceil(7 - (now.getTime() - lastFree.getTime()) / (24 * 60 * 60 * 1000));
      return json({
        error: `Free regrade used this week. ${daysLeft} day(s) until your next free regrade, or upgrade to premium.`,
        code: "FREE_REGRADE_USED",
        days_remaining: daysLeft,
      }, 402);
    }
  }

  // NSFW check all photos first
  for (const photoPath of photoPaths) {
    const nsfwResult = await nsfwCheck(photoPath);
    if (nsfwResult === "UNKNOWN") {
      logWarn(EVENTS.MODERATION_UNAVAILABLE, { user_type: "authenticated", user_id: user.id, reason: "provider_unavailable" });
      return json({ error: "This photo was not approved or graded yet because moderation is temporarily unavailable. Please try again; this does not mean the photo is unsafe.", code: MODERATION_UNAVAILABLE_CODE, retryable: true }, 503);
    }
    if (nsfwResult === "NSFW") {
      logWarn(EVENTS.GRADE_NSFW_BLOCKED, { user_type: "authenticated", user_id: user.id });
      const removed = await removeModeratedUserPhoto(user.id, photoPath);
      if (removed) {
        await deletePhoto(removed.photo_path).catch(() => false);
        logInfo(EVENTS.MODERATION_REJECTED_CLEANUP, { user_id: user.id, reason: "nsfw", primary: removed.is_primary });
      }
      return json({ error: "One of your photos appears to contain inappropriate content. Please upload different photos.", code: "NSFW" }, 400);
    }
  }

  // Grade each photo with AI
  const grades: { photo_path: string; grade: number; feedback: string; is_best: boolean }[] = [];
  let highestGrade = -1;
  let highestIndex = -1;
  let fallbackCount = 0;

  for (let i = 0; i < photoPaths.length; i++) {
    let grade: number;
    let feedback: string;

    try {
      const result = await gradePhotoWithAI(photoPaths[i]);
      grade = result.grade;
      feedback = result.feedback;
    } catch (err) {
      logWarn(EVENTS.GRADE_FALLBACK, { user_id: user.id, reason: "ai_provider_unavailable", photo_index: i });
      logWarn(EVENTS.GRADING_FAILED, { request_id, stage: "photo_ai", reason: "provider_unavailable" });
      fallbackCount++;
      grade = fallbackGrade(); // 3-8 fallback
      feedback = FALLBACK_FEEDBACK; // honest: does not claim the photo was analyzed
    }

    if (grade > highestGrade) {
      highestGrade = grade;
      highestIndex = i;
    }

    grades.push({ photo_path: photoPaths[i], grade, feedback, is_best: false });
  }

  // Mark the highest-grade photo as best
  if (highestIndex >= 0) {
    grades[highestIndex].is_best = true;
  }

  // Derive deterministic coaching tips from returned feedback + photo count
  const coaching = deriveCoachingTips(grades.map((g) => g.feedback), photoPaths.length);

  // Save to database
  await insertPhotoGrades(user.id, grades);

  // Update user's photo_path to the best photo
  const bestPath = grades[highestIndex]?.photo_path;
  if (bestPath) {
    await updateUserProfile(user.id, {
      display_name: user.display_name || "",
      age: user.age || 0,
      gender: user.gender || "",
      looking_for: user.looking_for || "everyone",
      bio: user.bio || "",
      photo_path: bestPath,
    });
  }

  // Calculate percentile
  const percentileResult = await calculatePercentile(user.id);

  if (percentileResult) {
    await updateUserPercentile(user.id, percentileResult.percentile, percentileResult.percentile_city);
  }

  // Update last_free_regrade_at for free users
  if (!hasActivePremium) {
    await updateLastFreeRegrade(user.id);
  }

  // Check and award newly earned badges
  await checkAndAwardBadges(user.id);

  const topLabel = percentileResult
    ? `${topPercentLabel(percentileResult.percentile)} in ${percentileResult.percentile_city}`
    : "Not enough users in your city for percentile ranking yet";

  logInfo(EVENTS.GRADING_COMPLETED, { request_id, flow: "multi_photo", photo_count: photoPaths.length, fallback_count: fallbackCount });
  logInfo(EVENTS.GRADE_PHOTOS_COMPLETED, {
    user_id: user.id,
    photo_count: photoPaths.length,
    fallback_count: fallbackCount,
    best_grade: highestGrade >= 0 ? highestGrade : null,
  });

  return json({
    grades: grades.map(g => ({
      photo_path: g.photo_path,
      grade: g.grade,
      feedback: g.feedback,
      is_best: g.is_best,
    })),
    grading_method: aggregateGradingMethod(photoPaths.length - fallbackCount, photoPaths.length),
    percentile: percentileResult?.percentile ?? null,
    percentile_city: percentileResult?.percentile_city ?? null,
    percentile_label: topLabel,
    coaching,
  });
}

async function handleGetPercentile(req: Request): Promise<Response> {
  const user = await getCurrentUser(req);
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }

  if (user.percentile === null) {
    // Try to recalculate
    const result = await calculatePercentile(user.id);
    if (result) {
      await updateUserPercentile(user.id, result.percentile, result.percentile_city);
      const label = `${topPercentLabel(result.percentile)} in ${result.percentile_city}`;
      return json({
        percentile: result.percentile,
        percentile_city: result.percentile_city,
        percentile_label: label,
      });
    }
    return json({
      percentile: null,
      percentile_city: null,
      percentile_label: "Not enough users in your city for percentile ranking yet",
    });
  }

  const label = `${topPercentLabel(user.percentile)} in ${user.percentile_city}`;
  return json({
    percentile: user.percentile,
    percentile_city: user.percentile_city,
    percentile_label: label,
  });
}

// ── Matching ─────────────────────────────────────────────────

/**
 * Compute badges for a MatchUser without extra DB calls.
 * Uses available data on the MatchUser record.
 */
function computeMatchBadges(u: {
  id: number;
  display_name?: string | null;
  photo_path?: string | null;
  photos?: { is_primary?: boolean }[] | null;
  communication_style?: string | null;
  lifestyle?: string | null;
  dating_goals?: string | null;
  college?: string | null;
  occupation?: string | null;
  hobbies?: string | null;
}): Badge[] {
  const badges: Badge[] = [];

  // verified → has display_name and photo_path
  if (u.display_name && u.photo_path) {
    badges.push({ id: "verified", label: "Verified", emoji: "✅" });
  }

  // best_photo → has photos array
  if (u.photos && u.photos.length > 0) {
    badges.push({ id: "best_photo", label: "Best Photo Picked", emoji: "📸" });
  }

  // profile_complete → has detailed profile info
  const hasDetails = u.communication_style || u.lifestyle || u.dating_goals || u.college || u.occupation || u.hobbies;
  if (hasDetails) {
    badges.push({ id: "detailed", label: "Detailed Profile", emoji: "📝" });
  }

  return badges;
}

async function handleGetMatches(req: Request): Promise<Response> {
  const user = await getCurrentUser(req);
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }

  if (user.grade === null) {
    return json({ error: "You must get graded before browsing matches", code: "NO_GRADE" }, 400);
  }

  const blockedIds = await getBlockedUserIds(user.id);

  const users = await getUsersWith8020Matching(
    user.id,
    user.grade,
    user.id,
    user.looking_for || "everyone",
    blockedIds,
    user.latitude ?? undefined,
    user.longitude ?? undefined,
    user.max_distance ?? undefined,
  );

  // Strip grades from other users in the response, map distance_miles -> distance_km
  const safeUsers = users.map((u) => ({
    id: u.id,
    display_name: u.display_name,
    age: u.age,
    gender: u.gender,
    bio: u.bio,
    photo_path: u.photo_path,
    photos: u.photos || [],
    communication_style: u.communication_style,
    lifestyle: u.lifestyle,
    dating_goals: u.dating_goals,
    college: u.college,
    occupation: u.occupation,
    hobbies: u.hobbies,
    height: u.height,
    pronouns: u.pronouns,
    ideal_first_date: u.ideal_first_date,
    green_flags: u.green_flags,
    red_flags: u.red_flags,
    obsessions: u.obsessions,
    is_outside_range: u.is_outside_range || false,
    compatibility_score: u.compatibility_score ?? 0,
    badges: computeMatchBadges(u),
    ...(u.distance_miles !== undefined && u.distance_miles !== null
      ? { distance_km: Math.round(u.distance_miles * 1.60934 * 10) / 10 }
      : {}),
  }));

  return json({ matches: safeUsers });
}

async function handleLike(req: Request): Promise<Response> {
  const rateLimitResponse = checkRateLimit(req, "like", { maxRequests: 30, windowMs: 15 * 60 * 1000 });
  if (rateLimitResponse) return rateLimitResponse;

  const user = await getCurrentUser(req);
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }
  const verificationErr = verificationGate(user);
  if (verificationErr) return verificationErr;

  const body = await req.json().catch(() => null);
  const likedId = body?.liked_id;

  if (!likedId || typeof likedId !== "number") {
    return json({ error: "liked_id is required" }, 400);
  }

  if (likedId === user.id) {
    return json({ error: "You cannot like yourself" }, 400);
  }

  // Daily like cap for non-subscribers (active trials are premium)
  if (!hasPremiumEntitlement(user.subscription_status, user.subscription_expires_at, user.trial_ends_at)) {
    const remaining = await useDailyLike(user.id);
    if (remaining === 0) {
      return json(
        { error: "Daily like limit reached. Subscribe for premium likes.", code: "DAILY_LIMIT" },
        402,
      );
    }
  }

  const wasFirstLike = !(await getLike(user.id, likedId));
  const likeRecorded = await recordLike(user.id, likedId, "like");
  if (likeRecorded && wasFirstLike) logInfo(EVENTS.FIRST_LIKE, { actor_id: user.id });
  if (!likeRecorded) return json({ error: "This relationship is unavailable" }, 403);

  // Check if this creates a mutual match
  const theirLike = await getLike(likedId, user.id);
  let matched = false;
  let matchId: number | null = null;

  if (theirLike && theirLike.action === "like") {
    // Mutual match!
    const match = await createMatch(user.id, likedId);
    if (match) {
      matched = true;
      matchId = match.id;
      logInfo(EVENTS.MATCH_CREATED, { match_id: match.id, user_ids: [user.id, likedId] });

      // Calculate Mutual League Score
      const otherUser = await getUserById(likedId);
      let leagueScore: number | null = null;
      if (otherUser) {
        // Get photo grades for both users
        const photoA = await getBestPhotoGrade(user.id);
        const photoB = await getBestPhotoGrade(likedId);
        const photoGradeA = photoA?.grade ?? user.grade ?? 5;
        const photoGradeB = photoB?.grade ?? otherUser.grade ?? 5;

        // Calculate compatibility
        const compatScore = calculateCompatibility(
          {
            age: user.age,
            communication_style: user.communication_style,
            lifestyle: user.lifestyle,
            dating_goals: user.dating_goals,
          },
          {
            age: otherUser.age,
            communication_style: otherUser.communication_style,
            lifestyle: otherUser.lifestyle,
            dating_goals: otherUser.dating_goals,
          },
        );

        leagueScore = calculateMutualLeagueScore(
          { grade: user.grade ?? 5, percentile: user.percentile ?? null },
          { grade: otherUser.grade ?? 5, percentile: otherUser.percentile ?? null },
          compatScore,
          photoGradeA,
          photoGradeB,
        );

        // Store the score on the match record
        await updateMatchLeagueScore(match.id, leagueScore);
      }

      // Push notifications for the new match — notify both users
      const leagueText = leagueScore != null ? `${leagueScore}% League Match! ` : "";
      sendPushNotification(user.id, {
        title: "New Match! 💘",
        body: `${leagueText}You have a new match! Start chatting now.`,
        url: `/chat/${match.id}`,
      }).catch((err) => logWarn(EVENTS.CHAT_PUSH_FAILED, { err, target: "liker" }));

      sendPushNotification(likedId, {
        title: "New Match! 💘",
        body: `${leagueText}Someone in your range just matched with you!`,
        url: `/chat/${match.id}`,
      }).catch((err) => logWarn(EVENTS.CHAT_PUSH_FAILED, { err, target: "liked" }));
    }
  }

  // Get the other user's info for the match celebration
  let otherUser = null;
  let leagueScore: number | null = null;
  if (matched) {
    const other = await getUserById(likedId);
    if (other) {
      otherUser = {
        id: other.id,
        display_name: other.display_name,
        photo_path: other.photo_path,
      };
    }
    // Fetch the league score from the match record
    if (matchId) {
      const matchRecord = await getMatchById(matchId);
      leagueScore = matchRecord?.mutual_league_score ?? null;
    }
  }

  logInfo(EVENTS.MATCH_LIKE, { actor_id: user.id, matched });
  return json({ ok: true, matched, match_id: matchId, other_user: otherUser, league_score: leagueScore });
}

async function handlePass(req: Request): Promise<Response> {
  const rateLimitResponse = checkRateLimit(req, "pass", { maxRequests: 30, windowMs: 15 * 60 * 1000 });
  if (rateLimitResponse) return rateLimitResponse;

  const user = await getCurrentUser(req);
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const body = await req.json().catch(() => null);
  const passedId = body?.passed_id;

  if (!passedId || typeof passedId !== "number") {
    return json({ error: "passed_id is required" }, 400);
  }

  await recordLike(user.id, passedId, "pass");
  return json({ ok: true });
}

// ── Messages ─────────────────────────────────────────────────

async function handleSendMessage(req: Request): Promise<Response> {
  const rateLimitResponse = checkRateLimit(req, "message", { maxRequests: 20, windowMs: 15 * 60 * 1000 });
  if (rateLimitResponse) return rateLimitResponse;

  const user = await getCurrentUser(req);
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }
  const verificationErr = verificationGate(user);
  if (verificationErr) return verificationErr;

  const body = await req.json().catch(() => null);
  const { match_id, content } = body || {};

  if (!match_id || typeof match_id !== "number") {
    return json({ error: "match_id is required" }, 400);
  }
  if (!content || typeof content !== "string" || content.trim().length === 0) {
    return json({ error: "content is required" }, 400);
  }
  if (typeof content === "string" && content.length > 2000) {
    return json({ error: "content must be 2000 characters or fewer" }, 413);
  }

  // Profanity filter
  const filterResult = filterMessage(content.trim());
  if (filterResult.blocked) {
    return json({ error: "Message contains inappropriate content" }, 400);
  }

  // Verify user is a participant in this match
  const match = await getMatchById(match_id);
  if (!match) {
    return json({ error: "Match not found" }, 404);
  }
  if (match.user1_id !== user.id && match.user2_id !== user.id) {
    return json({ error: "You are not a participant in this match" }, 403);
  }

  const heuristic = scanMessageHeuristics(content.trim());
  const policy = policyForMessageScan(heuristic);
  const moderationState = policy.hide ? "hidden" : heuristic.classification === "clean" ? "clear" : "pending_review";
  const message = await createMessage(match_id, user.id, content.trim(), moderationState, policy.hide ? heuristic.classification : null);
  if (heuristic.classification !== "clean") {
    const flag = await upsertMessageModerationFlag(message.id, user.id, match_id, heuristic.classification, "heuristic", heuristic.confidence, null, heuristic.matchedRules, policy.lockAccount ? "lock_account" : policy.hide ? "hide" : "review");
    if (flag?.id) void notifySafetyReviewer({ kind: "message", caseId: String(flag.id), flagType: heuristic.classification, source: "heuristic", confidence: heuristic.confidence, reason: heuristic.classification }).catch(() => {});
  }
  if (policy.lockAccount) {
    await createSuspension({ userId: user.id, reason: "underage", duration: "indefinite", endsAt: null, actorUserId: null, sourceCaseId: String(message.id) });
    await recordAdminAuditEvent({ actorUserId: null, action: "message_moderation.enforcement", targetType: "message", targetId: String(message.id), metadata: { classification: heuristic.classification, action: "lock_account" } });
  } else if (policy.hide) await recordAdminAuditEvent({ actorUserId: null, action: "message_moderation.enforcement", targetType: "message", targetId: String(message.id), metadata: { classification: heuristic.classification, action: "hide" } });
  if (!policy.hide && !policy.lockAccount) void scanMessage(content.trim()).then(async result => {
    if (result.classification === "clean") return;
    const providerPolicy = policyForMessageScan(result);
    const flag = await upsertMessageModerationFlag(message.id, user.id, match_id, result.classification, "provider", result.confidence, result.providerRef, result.matchedRules, providerPolicy.lockAccount ? "lock_account" : providerPolicy.hide ? "hide" : "review");
    if (flag?.id && result.classification !== "error") void notifySafetyReviewer({ kind: "message", caseId: String(flag.id), flagType: result.classification, source: "provider", confidence: result.confidence, reason: result.classification }).catch(() => {});
    if (providerPolicy.lockAccount) {
      await hideMessage(message.id, `provider_scan:${result.classification}`);
      await createSuspension({ userId: user.id, reason: "underage", duration: "indefinite", endsAt: null, actorUserId: null, sourceCaseId: String(message.id) });
      await recordAdminAuditEvent({ actorUserId: null, action: "message_moderation.enforcement", targetType: "message", targetId: String(message.id), metadata: { classification: result.classification, action: "lock_account", source: "provider_scan" } });
    } else if (providerPolicy.hide) {
      await hideMessage(message.id, `provider_scan:${result.classification}`);
      await recordAdminAuditEvent({ actorUserId: null, action: "message_moderation.enforcement", targetType: "message", targetId: String(message.id), metadata: { classification: result.classification, action: "hide", source: "provider_scan" } });
    }
  }).catch(err => logWarn("message_moderation.provider_failed", { error: err }));
  if (moderationState !== "clear") return json({ ok: true, message: { id: message.id, match_id: message.match_id, sender_id: message.sender_id, content: message.content, read: message.read, created_at: message.created_at, sender_name: user.display_name, sender_photo: user.photo_path } });

  // Notify the other participant
  const recipientId =
    match.user1_id === user.id ? match.user2_id : match.user1_id;
  sendPushNotification(recipientId, {
    title: `New message from ${user.display_name || "someone"}`,
    body: content.trim().slice(0, 128),
    url: `/chat/${match_id}`,
  }).catch((err) => logWarn(EVENTS.CHAT_PUSH_FAILED, { err, target: "message" }));

  logInfo(EVENTS.CHAT_MESSAGE_SENT, { user_id: user.id, match_id });

  return json({
    ok: true,
    message: {
      id: message.id,
      match_id: message.match_id,
      sender_id: message.sender_id,
      content: message.content,
      read: message.read,
      created_at: message.created_at,
      sender_name: user.display_name,
      sender_photo: user.photo_path,
    },
  });
}

async function handleGetMessages(req: Request, matchId: number): Promise<Response> {
  const user = await getCurrentUser(req);
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }

  // Verify user is a participant in this match
  const match = await getMatchById(matchId);
  if (!match) {
    return json({ error: "Match not found" }, 404);
  }
  if (match.user1_id !== user.id && match.user2_id !== user.id) {
    return json({ error: "You are not a participant in this match" }, 403);
  }

  const otherUserId = match.user1_id === user.id ? match.user2_id : match.user1_id;
  if (await isBlocked(user.id, otherUserId)) {
    return json({ error: "This relationship is unavailable" }, 403);
  }
  // Support ?before= query param for pagination
  const url = new URL(req.url);
  const beforeParam = url.searchParams.get("before");
  const beforeId = beforeParam ? Number(beforeParam) : undefined;

  const messages = await getMessages(matchId, 50, beforeId);

  // Mark messages as read when fetching
  await markMessagesRead(matchId, user.id);

  // Return in chronological order (oldest first) for chat display
  const chronological = [...messages].reverse();

  return json({ messages: chronological });
}

async function handleUnreadCount(req: Request): Promise<Response> {
  const user = await getCurrentUser(req);
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const count = await getUnreadMessageCount(user.id);
  return json({ count });
}

async function handleGetConnections(req: Request): Promise<Response> {
  const user = await getCurrentUser(req);
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const matches = await getMatchesForUser(user.id);
  return json({ connections: matches });
}

// ── User Safety ──────────────────────────────────────────────

async function handleBlock(req: Request): Promise<Response> {
  const user = await getCurrentUser(req);
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }

  // No subscription required — safety features are available to all users

  const body = await req.json().catch(() => null);
  const targetId = body?.user_id;

  if (!targetId || typeof targetId !== "number") {
    return json({ error: "user_id is required" }, 400);
  }

  if (targetId === user.id) {
    return json({ error: "You cannot block yourself" }, 400);
  }

  await blockUser(user.id, targetId);
  return json({ success: true });
}

async function handleUnmatch(req: Request): Promise<Response> {
  const user = await getCurrentUser(req);
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const body = await req.json().catch(() => null);
  const targetId = body?.matchUserId;

  const validationError = validateUnmatchRequest(user.id, targetId);
  if (validationError) {
    return json({ error: validationError }, 400);
  }

  await unmatchUser(user.id, targetId);
  return json({ success: true });
}

function contentTypeForPhotoPath(photoPath: string): string {
  const extension = path.extname(photoPath).toLowerCase();
  const types: Record<string, string> = {
    ".avif": "image/avif",
    ".gif": "image/gif",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
  };
  return types[extension] ?? "application/octet-stream";
}

const VALID_REPORT_REASONS = [
  "inappropriate_photo",
  "harassment",
  "underage",
  "fake_profile",
  "other",
];

async function handleReport(req: Request): Promise<Response> {
  const user = await getCurrentUser(req);
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }

  // No subscription required — safety features are available to all users

  const body = await req.json().catch(() => null);
  const targetId = body?.user_id;
  const reason = body?.reason;
  const details = body?.details;
  const targetPhotoId = body?.photo_id;
  const targetMessageId = body?.message_id;

  // Message reports: the reported user is derived from the message itself,
  // never from a client-supplied user_id, so a message can only be reported
  // by a participant in its match and never by its sender.
  if (targetMessageId !== undefined) {
    if (!Number.isInteger(targetMessageId) || targetMessageId < 1) return json({ error: "Invalid message reference" }, 400);
    if (!isReportReason(reason)) {
      return json({
        error: `Invalid reason. Must be one of: ${VALID_REPORT_REASONS.join(", ")}`,
      }, 400);
    }
    if (details !== undefined && (typeof details !== "string" || details.length > REPORT_DETAILS_MAX)) return json({ error: "details is too long" }, 400);
    const message = await getMessageById(targetMessageId);
    if (!message) return json({ error: "Message not found" }, 404);
    const match = await getMatchById(message.match_id);
    if (!match || (match.user1_id !== user.id && match.user2_id !== user.id)) return json({ error: "You are not a participant in this match" }, 403);
    if (message.sender_id === user.id) return json({ error: "You cannot report your own message" }, 400);
    const rateLimitResponse = checkRateLimit(req, "report", { maxRequests: REPORT_RATE_LIMIT, windowMs: 15 * 60 * 1000 });
    if (rateLimitResponse) return rateLimitResponse;
    if (await hasUserReportedMessage(user.id, message.id)) return json({ error: "This message has already been reported" }, 409);
    let reportId: string;
    try {
      reportId = await reportUser(user.id, message.sender_id, reason, null, details ?? null, message.id);
      const classification = messageFlagTypeForReportReason(reason);
      const policy = userReportPolicyForClassification(classification);
      // Surface the user report in the admin message-moderation queue exactly
      // like a heuristic/provider flag, with the protective action applied.
      const reportFlag = await upsertMessageModerationFlag(message.id, message.sender_id, message.match_id, classification, "user_report", 1, null, ["user_report"], policy.lockAccount ? "lock_account" : policy.hide ? "hide" : "review");
      if (reportFlag?.id) void notifySafetyReviewer({ kind: "message", caseId: String(reportFlag.id), flagType: classification, source: "user_report", confidence: 1, reason: classification }).catch(() => {});
      if (policy.hide) await hideMessage(message.id, `user_report:${classification}`);
      if (policy.lockAccount) await recordAdminAuditEvent({ actorUserId: user.id, action: "message_moderation.enforcement", targetType: "message", targetId: String(message.id), metadata: { classification, action: "lock_account", source: "user_report" } });
      // Underage message reports follow the same zero-tolerance protective
      // action as underage photo reports: quarantine every target photo and
      // lock the account pending review.
      if (reason === "underage") {
        await quarantineUserPhotosForUnderage(message.sender_id, reportId);
        const suspension = await createSuspension({ userId: message.sender_id, reason: "underage", duration: "indefinite", endsAt: null, actorUserId: user.id, sourceReportId: reportId });
        await recordAdminAuditEvent({ actorUserId: null, action: "underage.enforcement", targetType: "user", targetId: String(message.sender_id), metadata: { report_id: reportId, suspension_id: String(suspension.id) } });
      }
    } catch (err) {
      logError(EVENTS.REPORT_FAILED, { reporter_id: user.id, reason, err });
      throw err;
    }
    logInfo(EVENTS.REPORT_SUBMITTED, { reporter_id: user.id, reason, target: "message" });
    logInfo(EVENTS.MODERATION_REPORT_RECEIVED, { reporter_id: user.id, reason });
    return json({ success: true });
  }

  if (!targetId || typeof targetId !== "number" || !Number.isInteger(targetId)) {
    return json({ error: "user_id is required" }, 400);
  }

  if (targetId === user.id) {
    return json({ error: "You cannot report yourself" }, 400);
  }

  const target = await getUserById(targetId);
  if (!target) return json({ error: "User not found" }, 404);

  if (!isReportReason(reason)) {
    return json({
      error: `Invalid reason. Must be one of: ${VALID_REPORT_REASONS.join(", ")}`,
    }, 400);
  }

  if (details !== undefined && (typeof details !== "string" || details.length > REPORT_DETAILS_MAX)) return json({ error: "details is too long" }, 400);
  if (targetPhotoId !== undefined && (!Number.isInteger(targetPhotoId) || targetPhotoId < 1)) return json({ error: "Invalid photo reference" }, 400);
  let reportId: string;
  try {
    reportId = await reportUser(user.id, targetId, reason, targetPhotoId ?? null, details ?? null);
    // Underage reports are an immediate safety action: quarantine all target
    // photos and lock the account pending review. Never expose reporter or
    // evidence details in the response, and leave subscription state intact.
    if (reason === "inappropriate_photo" && targetPhotoId) {
      // Preserve reported evidence in the isolated review store without suspending.
      const photo = await getUserPhotoById(targetPhotoId, targetId);
      const reviewCase: any = await getPhotoModerationCaseForPhoto(targetPhotoId, targetId);
      if (!photo || !reviewCase) throw new Error("Reported photo could not be quarantined");
      const provider = getPrivateReviewProvider();
      if (!provider || !privateReviewReady()) throw new Error("Private review storage unavailable");
      const objectKey = `quarantine/${reviewCase.id}/${targetPhotoId}`;
      const contentType = contentTypeForPhotoPath(photo.photo_path);
      await quarantinePhoto(provider, objectKey, await readPhotoBuffer(photo.photo_path), contentType);
      await attachPrivatePhotoObject(String(reviewCase.id), objectKey, contentType);
      if (reviewCase.status !== "quarantined") await transitionPhotoModerationCase(String(reviewCase.id), "quarantined", user.id);
    }
    if (reason === "underage") {
      await quarantineUserPhotosForUnderage(targetId, reportId);
      const suspension = await createSuspension({
        userId: targetId,
        reason: "underage",
        duration: "indefinite",
        endsAt: null,
        actorUserId: user.id,
        sourceReportId: reportId,
      });
      await recordAdminAuditEvent({
        actorUserId: null,
        action: "underage.enforcement",
        targetType: "user",
        targetId: String(targetId),
        metadata: { report_id: reportId, suspension_id: String(suspension.id) },
      });
    }
  } catch (err) {
    logError(EVENTS.REPORT_FAILED, { reporter_id: user.id, reason, err });
    throw err;
  }
  logInfo(EVENTS.REPORT_SUBMITTED, { reporter_id: user.id, reason });
  logInfo(EVENTS.MODERATION_REPORT_RECEIVED, { reporter_id: user.id, reason });
  return json({ success: true });
}

async function handleReportQueue(req: Request): Promise<Response> {
  const user = await getCurrentUser(req);
  if (!user || !canManageReport(user.role)) return json({ error: "Forbidden" }, 403);
  const status = new URL(req.url).searchParams.get("status") ?? undefined;
  if (status && !isReportStatus(status)) return json({ error: "Invalid status" }, 400);
  await recordAdminAuditEvent({ actorUserId: user.id, action: "report.queue.read", targetType: "report" });
  return json({ reports: await getReportQueue(status), photo_flags: await getModerationFlagQueue(status === "open" ? "new" : undefined) });
}
async function handleReportDetail(req: Request, id: string): Promise<Response> {
  const user = await getCurrentUser(req);
  if (!user || !canManageReport(user.role)) return json({ error: "Forbidden" }, 403);
  const report = await getReportById(id);
  if (!report) return json({ error: "Not found" }, 404);
  await recordAdminAuditEvent({ actorUserId: user.id, action: "report.read", targetType: "report", targetId: id });
  return json({ report });
}
async function handleReportMutation(req: Request, id: string): Promise<Response> {
  const user = await getCurrentUser(req);
  if (!user || !canManageReport(user.role)) return json({ error: "Forbidden" }, 403);
  const body = await req.json().catch(() => null);
  const report = await getReportById(id);
  if (!report) return json({ error: "Not found" }, 404);
  if (body?.assignee_id !== undefined) {
    if (!canUseOwnerAction(user.role)) return json({ error: "Owner/admin action required" }, 403);
    if (body.assignee_id !== null && (!Number.isInteger(body.assignee_id) || body.assignee_id < 1)) return json({ error: "Invalid assignee" }, 400);
    await assignReport(id, body.assignee_id);
  }
  if (body?.status !== undefined) {
    if (!isReportStatus(body.status) || !canTransition(report.status, body.status)) return json({ error: "Invalid transition" }, 409);
    if (body.priority !== undefined && !isReportPriority(body.priority)) return json({ error: "Invalid priority" }, 400);
    await transitionReport(id, body.status, user.id, typeof body.notes === "string" ? body.notes.slice(0, 2000) : null);
  }
  await recordAdminAuditEvent({ actorUserId: user.id, action: "report.mutate", targetType: "report", targetId: id, metadata: { status: body?.status ?? null, assigned: body?.assignee_id !== undefined } });
  return json({ ok: true });
}

async function handlePhotoModerationQueue(req: Request): Promise<Response> {
  const user = await getCurrentUser(req);
  if (!user || !canReviewPhoto(user.role)) return json({ error: "Forbidden" }, 403);
  const status = new URL(req.url).searchParams.get("status") ?? undefined;
  if (status && !isQuarantineStatus(status)) return json({ error: "Invalid status" }, 400);
  await recordAdminAuditEvent({ actorUserId: user.id, action: "photo_moderation.queue.read", targetType: "photo_moderation" });
  return json({ cases: (await getPhotoModerationQueue(status)).map((c: any) => redactPhotoCase(c)), flags: await getModerationFlagQueue() });
}
async function handlePhotoReviewAccess(req: Request, id: string): Promise<Response> {
  const user = await getCurrentUser(req); const session = await getCurrentSession(req);
  if (!user || !canReviewPhoto(user.role) || !session?.mfa_verified_at || Date.now() - new Date(session.mfa_verified_at).getTime() > 5 * 60 * 1000) return json({ error: "Recent MFA reauthentication required" }, 403);
  const item: any = await getPhotoModerationCase(id); if (!item || !item.private_object_key) return json({ error: "Private review object unavailable" }, 404);
  if (!privateReviewReady() || !getPrivateReviewProvider()) return json({ error: "Private review storage unavailable", code: "PRIVATE_REVIEW_UNAVAILABLE" }, 503);
  try { const access = issueReviewAccess({ caseId: String(item.id), objectKey: item.private_object_key, status: item.status }, { userId: user.id, role: user.role, reauthenticatedAt: new Date(session.mfa_verified_at).getTime(), suspended: false }); return json({ expires_at: access.expiresAt, token: access.token }); } catch { return json({ error: "Private review access denied" }, 403); }
}
async function handlePhotoReviewBytes(req: Request, id: string): Promise<Response> {
  const user = await getCurrentUser(req); const session = await getCurrentSession(req); const token = new URL(req.url).searchParams.get("token");
  const item: any = await getPhotoModerationCase(id); if (!user || !session?.mfa_verified_at || !item?.private_object_key || !token || !getPrivateReviewProvider()) return json({ error: "Forbidden" }, 403);
  try { const bytes = await readReviewPhoto(getPrivateReviewProvider()!, token, { caseId: String(item.id), objectKey: item.private_object_key, principal: { userId: user.id, role: user.role, reauthenticatedAt: new Date(session.mfa_verified_at).getTime(), suspended: false } }); return new Response(bytes, { headers: { "content-type": item.private_content_type || "image/jpeg", "cache-control": "private, no-store" } }); } catch (e) { if (e instanceof ReviewAccessDeniedError) return json({ error: "Forbidden" }, 403); return json({ error: "Private review object unavailable" }, 503); }
}

async function handlePhotoModerationDetail(req: Request, id: string): Promise<Response> {
  const user = await getCurrentUser(req);
  if (!user || !canReviewPhoto(user.role)) return json({ error: "Forbidden" }, 403);
  const item = await getPhotoModerationCase(id); if (!item) return json({ error: "Not found" }, 404);
  await recordAdminAuditEvent({ actorUserId: user.id, action: "photo_moderation.read", targetType: "photo_moderation", targetId: id });
  return json({ case: redactPhotoCase(item as any), review_access: privateReviewStorageReady() ? "signed" : "unavailable" }, privateReviewStorageReady() ? 200 : 503);
}
async function handlePhotoModerationMutation(req: Request, id: string): Promise<Response> {
  const user = await getCurrentUser(req); if (!user || !canReviewPhoto(user.role)) return json({ error: "Forbidden" }, 403);
  const item: any = await getPhotoModerationCase(id); if (!item) return json({ error: "Not found" }, 404);
  const body = await req.json().catch(() => null); const status = body?.status;
  if (!isQuarantineStatus(status) || !canTransitionQuarantine(item.status, status)) return json({ error: "Invalid transition" }, 409);
  const updated = await transitionPhotoModerationCase(id, status, user.id, status === "approved" || status === "restored" ? "safe" : status === "removed" ? "unsafe" : undefined);
  await recordAdminAuditEvent({ actorUserId: user.id, action: "photo_moderation.transition", targetType: "photo_moderation", targetId: id, metadata: { status } });
  return json({ ok: true, case: redactPhotoCase((updated ?? {}) as any) });
}
async function handleMessageModerationQueue(req: Request): Promise<Response> {
  const user = await getCurrentUser(req);
  if (!user || !canReviewPhoto(user.role)) return json({ error: "Forbidden" }, 403);
  const status = new URL(req.url).searchParams.get("status") ?? undefined;
  if (status && !["new","reviewed","dismissed","actioned"].includes(status)) return json({ error: "Invalid status" }, 400);
  const rows = await getMessageModerationFlagQueue(status);
  await recordAdminAuditEvent({ actorUserId: user.id, action: "message_moderation.queue.read", targetType: "message_moderation" });
  return json({ flags: rows });
}
async function handleMessageModerationDetail(req: Request, id: string): Promise<Response> {
  const user = await getCurrentUser(req);
  if (!user || !canReviewPhoto(user.role)) return json({ error: "Forbidden" }, 403);
  const session = await getCurrentSession(req); const recent = session?.mfa_verified_at && Date.now() - new Date(session.mfa_verified_at).getTime() <= 5 * 60 * 1000;
  if (!recent) return json({ error: "Recent MFA reauthentication required" }, 403);
  const item = await getMessageModerationContext(id); if (!item) return json({ error: "Not found" }, 404);
  await recordAdminAuditEvent({ actorUserId: user.id, action: "message_moderation.read", targetType: "message_moderation", targetId: id });
  return json({ flag: item });
}
async function handleMessageModerationMutation(req: Request, id: string): Promise<Response> {
  const user = await getCurrentUser(req);
  if (!user || !canReviewPhoto(user.role)) return json({ error: "Forbidden" }, 403);
  const session = await getCurrentSession(req); const recent = session?.mfa_verified_at && Date.now() - new Date(session.mfa_verified_at).getTime() <= 5 * 60 * 1000;
  if (!recent) return json({ error: "Recent MFA reauthentication required" }, 403);
  const actor = user; const item = await getMessageModerationContext(id); if (!item) return json({ error: "Not found" }, 404);
  const body = await req.json().catch(() => null); const action = body?.action;
  if (!["dismiss","keep_hidden","release","lock_account"].includes(action)) return json({ error: "Invalid action" }, 400);
  if (!["new","reviewed","dismissed","actioned"].includes(item.status)) return json({ error: "Invalid transition" }, 409);
  if (action === "release") await releaseMessage(Number(item.message_id), actor.id);
  if (action === "keep_hidden") await hideMessage(Number(item.message_id), "moderator_review");
  if (action === "lock_account") await createSuspension({ userId: Number(item.sender_id), reason: "other", duration: "indefinite", endsAt: null, actorUserId: actor.id, sourceCaseId: String(item.message_id) });
  const reviewed = await reviewMessageModerationFlag(id, action === "dismiss" ? "dismissed" : "actioned", actor.id, action);
  if (!reviewed) return json({ error: "Invalid transition" }, 409);
  await recordAdminAuditEvent({ actorUserId: actor.id, action: "message_moderation.mutate", targetType: "message_moderation", targetId: id, metadata: { action } });
  return json({ ok: true });
}
async function handleDeleteAccount(req: Request): Promise<Response> {
  const user = await getCurrentUser(req);
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }

  await deleteUserAccount(user.id);
  logInfo(EVENTS.ACCOUNT_DELETED, { user_id: user.id });
  return clearSessionCookie(json({ success: true }));
}

// ── Subscription ──────────────────────────────────────────────

async function handleSubscriptionStatus(req: Request): Promise<Response> {
  const user = await getCurrentUser(req);
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }
  return json({
    subscription_status: user.subscription_status,
    subscription_updated_at: user.subscription_updated_at || null,
  });
}

async function handleSubscriptionActivate(_req: Request): Promise<Response> {
  return json({ error: "This endpoint is deprecated. Complete payment through Stripe Checkout." }, 410);
}

async function handleCreateCheckout(req: Request): Promise<Response> {
  const request_id = requestIdFrom(req);
  logInfo(EVENTS.PREMIUM_CHECKOUT_STARTED, { request_id, plan: "monthly" });
  const user = await getCurrentUser(req);
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }
  const verificationErr = verificationGate(user);
  if (verificationErr) return verificationErr;

  if (isCheckoutBlocked(user.subscription_status, user.subscription_updated_at)) {
    return json({
      error: "Subscription already active",
      subscription_status: user.subscription_status,
      code: "SUBSCRIPTION_ALREADY_PENDING",
    }, 409);
  }

  const body = await req.json().catch(() => null);
  if (body?.plan !== "monthly") {
    return json({ error: "Only the monthly Premium plan is available" }, 400);
  }

  const stripe = getStripe();
  if (!stripe) {
    return json({ error: "Stripe is not configured" }, 500);
  }

  const priceId = PREMIUM_PRICE_ID;

  if (user.subscription_status === "processing") {
    // The stored "processing" marker is stale — isCheckoutBlocked let us
    // through only because it is (see isProcessingStale). A previous checkout
    // attempt crashed before any webhook could resolve it; clear the marker
    // so this retry starts from a clean state. No entitlement is granted here.
    await updateSubscriptionStatus(user.id, "none");
  }

  await updateSubscriptionStatus(user.id, "processing");

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      // Return URLs come from the current origin and land on the real /subscribe
      // route, which renders ?success=true / ?canceled=true. Fulfillment is
      // webhook-based; the return URL is only UX.
      ...subscriptionCheckoutUrls(req.url),
      client_reference_id: String(user.id),
      customer_email: user.email,
      metadata: { user_id: String(user.id) },
    });
  } catch (err) {
    // Never leave the user locked in "processing": reset so they can retry,
    // and surface Stripe's own error message so the failure is diagnosable.
    await updateSubscriptionStatus(user.id, "none");
    logError(EVENTS.PREMIUM_CHECKOUT_FAILED, {
      request_id,
      user_id: user.id,
      ...stripeErrorDetails(err),
    });
    return json({
      error: stripeErrorMessage(err),
      code: "STRIPE_CHECKOUT_FAILED",
      stripe: stripeErrorClientFields(err),
    }, stripeErrorStatus(err));
  }
  logInfo(EVENTS.PREMIUM_CHECKOUT_COMPLETED, { request_id, plan: "monthly" });
  return json({ url: session.url });
}

// ── Upsell checkout and activation ─────────────────────────────
const UPSELL_PRODUCTS: readonly PaidUpsellProduct[] = ["re-grade", "boost", "like-pack"];

function isUpsellProduct(product: string | null | undefined): product is PaidUpsellProduct {
  return !!product && (UPSELL_PRODUCTS as readonly string[]).includes(product);
}

/** Read the Stripe price id at call time (same pattern as getStripe) so a
 * product is considered configured only when its env price id is present at
 * request time, and so tests can set env without depending on module
 * evaluation order. */
function upsellPriceId(product: PaidUpsellProduct): string | undefined {
  switch (product) {
    case "re-grade": return process.env.STRIPE_REGRADE_PRICE_ID;
    case "boost": return process.env.STRIPE_BOOST_PRICE_ID;
    case "like-pack": return process.env.STRIPE_LIKE_PACK_PRICE_ID;
  }
  return undefined;
}

async function handleUpsellCheckout(req: Request): Promise<Response> {
  const user = await getCurrentUser(req);
  if (!user) return json({ error: "Unauthorized" }, 401);
  const verificationErr = verificationGate(user);
  if (verificationErr) return verificationErr;
  const body = await req.json().catch(() => null);
  const product = body?.product as PaidUpsellProduct;
  if (!isUpsellProduct(product)) return json({ error: "Invalid product" }, 400);
  // Duplicate-purchase guard: an in-flight (pending) checkout for the same
  // product blocks a new one, and an active re-grade/boost blocks a new one.
  // Like-packs stay stackable (canonical product decision), so only a pending
  // like-pack purchase blocks.
  const entitlement = await getUpsellEntitlementState(user.id, product);
  if (isStorePurchaseBlocked(product, entitlement.entitled, entitlement.pending)) {
    const code = entitlement.pending ? "UPSELL_ALREADY_PENDING" : "UPSELL_ALREADY_ACTIVE";
    return json({
      error: entitlement.pending
        ? "A purchase for this item is already being confirmed. Wait for it to finish, then try again if needed."
        : "This item is already active on your account.",
      code,
    }, 409);
  }
  const price = upsellPriceId(product);
  const stripe = getStripe();
  if (!stripe || !price) return json({ error: "This purchase is not configured yet" }, 503);
  const request_id = requestIdFrom(req);
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment", line_items: [{ price, quantity: 1 }],
      ...storeUpsellCheckoutUrls(req.url, product),
      client_reference_id: String(user.id), customer_email: user.email,
      metadata: { user_id: String(user.id), product },
    });
  } catch (err) {
    // Clear any in-flight marker for this product so the user can retry, and
    // surface Stripe's own error message so the failure is diagnosable.
    await clearPendingUpsell(user.id, product).catch(() => {});
    logError(EVENTS.STRIPE_UPSELL_CHECKOUT_FAILED, {
      request_id,
      user_id: user.id,
      product,
      ...stripeErrorDetails(err),
    });
    return json({
      error: stripeErrorMessage(err),
      code: "STRIPE_CHECKOUT_FAILED",
      stripe: stripeErrorClientFields(err),
    }, stripeErrorStatus(err));
  }
  const recorded = await createPendingUpsell(user.id, product, session.id);
  if (!recorded) {
    // A concurrent checkout recorded the pending entitlement while this
    // session was being created. Expire the duplicate session so the user
    // can't pay twice, and report the in-flight purchase.
    await stripe.checkout.sessions.expire(session.id).catch(() => {});
    return json({ error: "A purchase for this item is already being confirmed.", code: "UPSELL_ALREADY_PENDING" }, 409);
  }
  return json({ url: session.url });
}

/** Authenticated entitlement status for a one-time product. Polled by the
 * store page after a Stripe return so success is only shown once the server
 * confirms the entitlement (webhook or activate grant). Never claims payment
 * success itself. */
async function handleUpsellEntitlementStatus(req: Request): Promise<Response> {
  const user = await getCurrentUser(req);
  if (!user) return json({ error: "Unauthorized" }, 401);
  const url = new URL(req.url);
  const product = url.searchParams.get("product") as PaidUpsellProduct | null;
  if (!isUpsellProduct(product)) {
    return json({ error: "Invalid product" }, 400);
  }
  const sessionId = url.searchParams.get("session_id");
  const state = await getUpsellEntitlementState(user.id, product, sessionId);
  return json({ product, entitled: state.entitled, pending: state.pending });
}

async function handleActivateUpsell(req: Request): Promise<Response> {
  const user = await getCurrentUser(req);
  if (!user) return json({ error: "Unauthorized" }, 401);
  const body = await req.json().catch(() => null);
  const sessionId = typeof body?.session_id === "string" ? body.session_id : "";
  if (!sessionId || !/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return json({ error: "A valid Stripe checkout session is required" }, 400);
  const stripe = getStripe();
  if (!stripe) return json({ error: "Stripe is not configured" }, 503);
  let session: Stripe.Checkout.Session;
  try { session = await stripe.checkout.sessions.retrieve(sessionId); } catch { return json({ error: "Unable to verify payment" }, 400); }
  const product = session.metadata?.product as PaidUpsellProduct | undefined;
  if (session.payment_status !== "paid" || session.metadata?.user_id !== String(user.id) || !product || !upsellPriceId(product)) {
    return json({ error: "Payment is not verified yet", code: "PAYMENT_PENDING" }, 409);
  }
  const granted = await grantPaidUpsell(user.id, product, session.id);
  return json({ ok: true, granted, message: granted ? "Purchase activated!" : "Purchase was already activated." });
}

// ── Daily Likes ──────────────────────────────────────────────

async function handleLikesRemaining(req: Request): Promise<Response> {
  const user = await getCurrentUser(req);
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const remaining = await getDailyLikesRemaining(user.id);
  if (remaining === -1) {
    return json({ remaining: "unlimited" });
  }
  // Also return like_packs count for free users
  const packs = await getLikePacksRemaining(user.id);
  return json({ remaining, like_packs: packs });
}

// ── Like Packs ──────────────────────────────────────────────

async function handleActivateLikePack(req: Request): Promise<Response> {
  const user = await getCurrentUser(req);
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }

  // Like packs are purchasable by anyone (free or subscribed)
  await addLikePacks(user.id, 5);
  const packs = await getLikePacksRemaining(user.id);
  return json({ ok: true, message: "5 extra likes activated!", like_packs: packs });
}

// ── Liked Me ──────────────────────────────────────────────

async function handleLikedMe(req: Request): Promise<Response> {
  const user = await getCurrentUser(req);
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const hasActivePremium = hasPremiumEntitlement(user.subscription_status, user.subscription_expires_at, user.trial_ends_at);
  if (!hasActivePremium) {
    // Return count only, no details
    const likers = await getLikers(user.id);
    return json({
      paywalled: true,
      count: likers.length,
      message: "Premium includes seeing who liked you. Subscribe to unlock.",
    });
  }

  const likers = await getLikers(user.id);
  const safeLikers = likers.map((u) => ({
    id: u.id,
    display_name: u.display_name,
    age: u.age,
    gender: u.gender,
    bio: u.bio,
    photo_path: u.photo_path,
    photos: u.photos || [],
  }));
  return json({ paywalled: false, likers: safeLikers });
}

// ── Stripe Identity verification ───────────────────────────────
function identityRequirements(): { type: "document"; require_matching_selfie?: boolean } {
  const configured = (process.env.STRIPE_IDENTITY_REQUIREMENTS || "document_selfie").trim().toLowerCase();
  return { type: "document", ...(configured === "document_selfie" ? { require_matching_selfie: true } : {}) };
}

// Mandatory age-verification gate for the closed beta. When
// VERIFICATION_REQUIRED=true, core actions (like, message, purchase) require
// verification_status === "verified". Browsing the feed and profile editing
// stay open. The flag is server-side; clients learn it via SafeUser.
function verificationRequired(): boolean {
  return process.env.VERIFICATION_REQUIRED === "true";
}

// Closed-beta gate for the Austin cohort. When BETA_INVITE_REQUIRED=true,
// signup additionally requires a valid beta invite code and an Austin-metro
// IP location. Defaults to OFF in code; production/preview flip it on for
// the closed beta.
function betaInviteRequired(): boolean {
  return process.env.BETA_INVITE_REQUIRED === "true";
}

function verificationGate(user: User): Response | null {
  if (verificationRequired() && user.verification_status !== "verified") {
    return json(
      { error: "Verify your age to continue", code: "VERIFICATION_REQUIRED" },
      403,
    );
  }
  return null;
}

async function handleVerificationSession(req: Request): Promise<Response> {
  const user = await getCurrentUser(req);
  if (!user) return json({ error: "Unauthorized" }, 401);
  if (user.verification_status === "verified") return json({ error: "Already verified", verified: true }, 409);
  if (user.verification_status === "pending" && user.verification_session_id) {
    // A pending session must never dead-end in a 409: resume it when it is
    // still active, persist the outcome when Stripe already finished it, or
    // transparently replace it with a fresh session when it is dead.
    const stripe = getStripe();
    if (stripe) {
      let existing: Stripe.Identity.VerificationSession | null = null;
      try {
        existing = await stripe.identity.verificationSessions.retrieve(user.verification_session_id);
      } catch {
        // Retrieval failed (session expired or vanished): drop the stale row
        // and start a fresh session below.
        await resetVerificationSession(user.id);
      }
      if (existing) {
        if (existing.status === "processing" || existing.status === "requires_input") {
          // Resume the SAME modal: retrieve returns the same client_secret.
          return json({ client_secret: existing.client_secret, id: existing.id, resumed: true });
        }
        if (existing.status === "verified") {
          // Stripe finished the check but the webhook may not have landed yet.
          await updateVerificationOutcome(user.id, existing.id, "verified");
          return json({ verified: true });
        }
        // Terminal (canceled/expired/etc.) or unknown: replace with a fresh
        // session below.
        await resetVerificationSession(user.id);
      }
    }
  }
  const stripe = getStripe();
  if (!stripe) return json({ error: "Stripe is not configured" }, 503);
  try {
    const requirements = identityRequirements();
    const session = await stripe.identity.verificationSessions.create({
      type: requirements.type,
      options: { document: { require_matching_selfie: requirements.require_matching_selfie ?? false } },
      metadata: { user_id: String(user.id) },
    });
    const stored = await startVerificationSession(user.id, session.id);
    if (!stored) return json({ error: "Verification already in progress" }, 409);
    return json({ client_secret: session.client_secret, id: session.id });
  } catch (err) {
    logError(EVENTS.STRIPE_WEBHOOK_PROCESSING_FAILED, { err });
    return json({ error: "Unable to start verification" }, 502);
  }
}

// ── Stripe Webhook ─────────────────────────────────────────────

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    logWarn(EVENTS.STRIPE_UNCONFIGURED, {});
    return null;
  }
  return new Stripe(key);
}

async function handleStripeWebhook(req: Request): Promise<Response> {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return json({ error: "Missing stripe-signature header" }, 400);
  }

  // Read the raw body for signature verification
  const rawBody = await req.text();

  if (!webhookSecret) {
    logError(EVENTS.STRIPE_WEBHOOK_SECRET_MISSING, {});
    return json({ error: "Webhook secret not configured" }, 500);
  }

  const stripe = getStripe();
  if (!stripe) {
    return json({ error: "Stripe not configured" }, 500);
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      webhookSecret,
    );
  } catch (err) {
    logWarn(EVENTS.STRIPE_WEBHOOK_SIGNATURE_FAILED, { err });
    return json({ error: "Invalid signature" }, 400);
  }

  logInfo(EVENTS.STRIPE_WEBHOOK_RECEIVED, { type: event.type });

  try {
    switch (event.type) {
      case "identity.verification_session.verified":
      case "identity.verification_session.requires_input":
      case "identity.verification_session.canceled": {
        const session = event.data.object as Stripe.Identity.VerificationSession;
        // Stale-session guard: only apply the event when it matches the user's
        // CURRENT verification_session_id. A late event for a replaced or
        // abandoned session must never flip the user's status.
        const user = await getUserByVerificationSessionId(session.id);
        if (user && user.verification_session_id === session.id) {
          await updateVerificationOutcome(user.id, session.id, event.type.endsWith(".verified") ? "verified" : "unverified");
        }
        break;
      }
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerEmail = session.customer_details?.email;
        const customerId =
          typeof session.customer === "string" ? session.customer : null;
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : null;
        const clientReferenceId = session.client_reference_id || null;

        // Find user: first try email, then client_reference_id, then metadata
        let user: User | null = null;
        if (customerEmail) {
          user = await getUserByEmail(customerEmail.toLowerCase());
        }
        if (!user && clientReferenceId) {
          const userId = parseInt(clientReferenceId, 10);
          if (!isNaN(userId)) {
            user = await getUserById(userId);
          }
        }
        if (!user && session.metadata?.user_id) {
          const userId = parseInt(session.metadata.user_id, 10);
          if (!isNaN(userId)) {
            user = await getUserById(userId);
          }
        }

        if (!user) {
          logWarn(EVENTS.STRIPE_WEBHOOK_NO_USER, { type: event.type });
          break;
        }

        // One-time upsells are granted only from a paid Checkout Session. The
        // entitlement table makes webhook retries and manual activation idempotent.
        const upsellProduct = session.metadata?.product as PaidUpsellProduct | undefined;
        if (session.mode === "payment" && upsellProduct && session.payment_status === "paid" && session.metadata?.user_id === String(user.id) && upsellPriceId(upsellProduct)) {
          await grantPaidUpsell(user.id, upsellProduct, session.id);
          logInfo(EVENTS.STRIPE_UPSELL_GRANTED, { user_id: user.id, product: upsellProduct });
          break;
        }


        if (customerId && subscriptionId) {
          await updateUserStripeInfo(user.id, customerId, subscriptionId);
          logInfo(EVENTS.STRIPE_SUBSCRIPTION_ACTIVATED, { user_id: user.id, stored_stripe_ids: true });
        } else {
          // Fallback: just activate without storing Stripe IDs
          await updateSubscriptionStatus(user.id, "active");
          logInfo(EVENTS.STRIPE_SUBSCRIPTION_ACTIVATED, { user_id: user.id, stored_stripe_ids: false });
        }

        // Founders Club: assign sequential founder_number if spots remain
        const spotsRemaining = await getFounderSpotsRemaining();
        if (spotsRemaining.remaining > 0) {
          const founderNum = await assignFounderNumber(user.id);
          if (founderNum !== null) {
            logInfo(EVENTS.STRIPE_FOUNDERS_ASSIGNED, {
              user_id: user.id,
              founder_number: founderNum,
              spots_remaining: spotsRemaining.remaining - 1,
            });
          }
        } else {
          logInfo(EVENTS.STRIPE_FOUNDERS_FULL, { user_id: user.id });
        }

        // Check and apply referral reward
        const pendingReward = await getReferralRewardForReferee(user.id);
        if (pendingReward && !pendingReward.applied) {
          await applyReferralReward(pendingReward.id);
          logInfo(EVENTS.STRIPE_REFERRAL_REWARD_APPLIED, {
            referrer_user_id: pendingReward.referrer_user_id,
            referee_user_id: user.id,
          });
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId =
          typeof subscription.customer === "string"
            ? subscription.customer
            : null;

        if (!customerId) {
          logWarn(EVENTS.STRIPE_WEBHOOK_INCOMPLETE, { type: event.type, detail: "no_customer" });
          break;
        }

        const user = await getUserByStripeCustomerId(customerId);
        if (!user) {
          logWarn(EVENTS.STRIPE_WEBHOOK_NO_USER, { type: event.type });
          break;
        }

        await updateSubscriptionStatus(user.id, "inactive");
        // Release the founder claim (number, flag, price lock, badge) so the
        // 1,000-spot cap stays honest; idempotent on webhook retries.
        await revokeFounderState(user.id);
        logInfo(EVENTS.STRIPE_FOUNDER_RELEASED, { user_id: user.id });
        logInfo(EVENTS.STRIPE_SUBSCRIPTION_CANCELLED, { user_id: user.id });
        break;
      }

      default:
        // Ignore other event types
        logInfo(EVENTS.STRIPE_WEBHOOK_UNHANDLED, { type: event.type });
    }
  } catch (err) {
    logError(EVENTS.STRIPE_WEBHOOK_PROCESSING_FAILED, { err });
    return json({ error: "Webhook processing error" }, 500);
  }

  // Always return 200 quickly
  return json({ received: true });
}

// ── Password Reset ─────────────────────────────────────────────

async function handleForgotPassword(req: Request): Promise<Response> {
  const rateLimitResponse = checkStrictRateLimit(req);
  if (rateLimitResponse) return rateLimitResponse;

  const body = await req.json().catch(() => null);
  if (!body?.email) {
    return json({ error: "Email is required" }, 400);
  }

  const email = String(body.email).trim().toLowerCase();
  const user = await getUserByEmail(email);

  // Always return success to avoid email enumeration — even if user doesn't exist
  if (!user) {
    return json({ message: "If an account with that email exists, a reset link has been sent." });
  }

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

  await createPasswordResetToken(user.id, token, expiresAt);

  // Build the full reset URL from the request origin
  const url = new URL(req.url);
  const resetUrl = `${url.origin}/reset-password?token=${token}`;

  // Send email via Resend (gracefully handles missing API key)
  await sendPasswordResetEmail(email, resetUrl);

  return json({ message: "If an account with that email exists, a reset link has been sent." });
}

async function handleResetPassword(req: Request): Promise<Response> {
  const rateLimitResponse = checkStrictRateLimit(req);
  if (rateLimitResponse) return rateLimitResponse;

  const body = await req.json().catch(() => null);
  if (!body?.token || !body?.password) {
    return json({ error: "Token and password are required" }, 400);
  }

  const token = String(body.token).trim();
  const password = String(body.password);

  const passwordError = validateNewPassword(password);
  if (passwordError) {
    return json({ error: passwordError }, 400);
  }

  const resetToken = await getPasswordResetToken(token);
  if (!resetToken) {
    return json({ error: "Invalid or expired reset token" }, 400);
  }

  // Check expiration
  if (new Date(resetToken.expires_at) < new Date()) {
    await markTokenUsed(token);
    return json({ error: "This reset link has expired. Please request a new one." }, 400);
  }

  const passwordHash = await BunPw.hash(password);
  await updateUserPassword(resetToken.user_id, passwordHash);
  await markTokenUsed(token);

  return json({ message: "Password has been reset successfully. You can now log in." });
}

async function handleChangePassword(req: Request): Promise<Response> {
  const user = await getCurrentUser(req);
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body.current_password !== "string" || typeof body.new_password !== "string") {
    return json({ error: "Current password and new password are required" }, 400);
  }
  const currentPassword = body.current_password;
  const newPassword = body.new_password;
  const passwordError = validateNewPassword(newPassword);
  if (passwordError) {
    return json({ error: passwordError }, 400);
  }
  const valid = await BunPw.verify(currentPassword, user.password_hash);
  if (!valid) {
    return json({ error: "Current password is incorrect" }, 401);
  }
  const passwordHash = await BunPw.hash(newPassword);
  await updateUserPassword(user.id, passwordHash);
  // Revoke every other active session so a password change invalidates any
  // session that may have been taken over; keep the current session alive.
  const sessionId = getSessionId(req);
  if (sessionId) await revokeOtherSessions(user.id, sessionId);
  // Audit password changes by privileged roles (best-effort, mirrors the
  // mfa.password_only_denied audit pattern).
  if (["owner", "admin", "moderator"].includes(String(user.role))) {
    await recordAdminAuditEvent({
      actorUserId: user.id,
      actorRole: user.role,
      action: "password.change",
      targetType: "user",
      targetId: String(user.id),
      requestId: requestIdFrom(req),
    }).catch(() => {});
  }
  return json({ ok: true });
}

async function handleDeletePhoto(req: Request, photoId: number): Promise<Response> {
  const user = await getCurrentUser(req);
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const photo = await deleteUserPhoto(photoId, user.id);
  if (!photo) {
    return json({ error: "Photo not found" }, 404);
  }

  // If this was the primary photo, set another photo as primary
  if (photo.is_primary) {
    const remaining = await getUserPhotos(user.id);
    if (remaining.length > 0) {
      await setPrimaryPhoto(user.id, remaining[0].id);
    } else {
      // No photos left — clear users.photo_path
      await updateUserProfile(user.id, {
        display_name: user.display_name || "",
        age: user.age || 0,
        gender: user.gender || "",
        looking_for: user.looking_for || "everyone",
        bio: user.bio || "",
        photo_path: "",
      });
    }
  }

  // Clean up file from storage
  try {
    await deletePhoto(photo.photo_path);
  } catch {
    // Best effort cleanup
  }

  return json({ ok: true });
}

async function handleReorderPhotos(req: Request): Promise<Response> {
  const user = await getCurrentUser(req);
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const body = await req.json().catch(() => null);
  if (!body?.photoIds || !Array.isArray(body.photoIds)) {
    return json({ error: "photoIds array is required" }, 400);
  }

  await reorderUserPhotos(user.id, body.photoIds);
  return json({ ok: true });
}

async function handleSetPrimary(req: Request, photoId: number): Promise<Response> {
  const user = await getCurrentUser(req);
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const photo = await setPrimaryPhoto(user.id, photoId);
  if (!photo) {
    return json({ error: "Photo not found" }, 404);
  }

  return json({ ok: true, photo });
}

// ── Geo Check (Austin gating) ─────────────────────────────

const GEO_CHECK_LIMIT = { maxRequests: 10, windowMs: 60_000 }; // 10 req/min per IP

async function handleGeoCheck(req: Request): Promise<Response> {
  const rateLimitResponse = checkRateLimit(req, "geo-check", GEO_CHECK_LIMIT);
  if (rateLimitResponse) return rateLimitResponse;

  const { city, region, isAustinMetro } = await getApproximateLocation(req);
  return json({ isAustinMetro, city, region, beta_invite_required: betaInviteRequired() });
}

// ── Location ─────────────────────────────────────────────────

async function handleLocationLookup(req: Request): Promise<Response> {
  const body = await req.json().catch(() => null);
  if (!body?.zip || typeof body.zip !== "string") {
    return json({ error: "zip is required" }, 400);
  }

  const zip = String(body.zip).trim();
  const result = lookupZip(zip);

  if (!result) {
    return json({ error: "Invalid zip code" }, 400);
  }

  return json({
    lat: result.lat,
    lng: result.lng,
    city: result.city,
    state: result.state,
  });
}
/**
 * Record a privacy-safe experiment exposure/conversion event. The payload is
 * validated and allowlist-stripped by parseExperimentEvent, so only coarse
 * fields (experiment, variant, event, route, conversion) can reach the log —
 * no identifiers, emails, or free-form content.
 */
async function handleExperimentEvent(req: Request): Promise<Response> {
  const body = await req.json().catch(() => null);
  const parsed = parseExperimentEvent(body);
  if (!parsed) {
    return json({ error: "Invalid experiment event" }, 400);
  }
  if (parsed.event === "exposure") {
    logInfo(EVENTS.EXPERIMENT_EXPOSURE, { experiment: parsed.experiment, variant: parsed.variant, route: parsed.route });
    const secret = process.env.ATTRIBUTION_CLAIM_SECRET;
    if (!secret) return json({ ok: true });
    try {
      const claim = issueAttributionClaim({ experiment: parsed.experiment, variant: parsed.variant, secret, ttlMs: ATTRIBUTION_DEFAULT_TTL_MS });
      if (await persistAttributionClaim(claim)) {
        const token = formatAttributionClaim(claim, secret);
        const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json", "Set-Cookie": `gd_attribution_claim=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${ATTRIBUTION_DEFAULT_TTL_MS / 1000}${secure}` } });
      }
    } catch { /* attribution is best-effort and must never block CTA use */ }
  } else {
    logInfo(EVENTS.EXPERIMENT_CONVERSION, { experiment: parsed.experiment, variant: parsed.variant, route: parsed.route, conversion: parsed.conversion });
  }
  return json({ ok: true });
}

// ── Push Notifications ──────────────────────────────────────

function handleVapidPublicKey(): Response {
  return json({ publicKey: pushEnabled ? VAPID_PUBLIC_KEY : null });
}

async function handlePushSubscribe(req: Request): Promise<Response> {
  if (!pushEnabled) {
    return json({ error: "Push notifications are not configured on this server" }, 503);
  }

  const user = await getCurrentUser(req);
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const body = await req.json().catch(() => null);
  if (!body?.endpoint || !body?.keys?.p256dh || !body?.keys?.auth) {
    return json({ error: "endpoint, keys.p256dh, and keys.auth are required" }, 400);
  }

  await savePushSubscription(
    user.id,
    String(body.endpoint),
    String(body.keys.p256dh),
    String(body.keys.auth),
  );

  return json({ ok: true });
}

async function handlePushUnsubscribe(req: Request): Promise<Response> {
  if (!pushEnabled) {
    return json({ error: "Push notifications are not configured on this server" }, 503);
  }

  const user = await getCurrentUser(req);
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const body = await req.json().catch(() => null);
  if (!body?.endpoint) {
    return json({ error: "endpoint is required" }, 400);
  }

  await deletePushSubscription(user.id, String(body.endpoint));
  return json({ ok: true });
}

// ── Referral ────────────────────────────────────────────────────

async function handleGetReferralCode(req: Request): Promise<Response> {
  const user = await getCurrentUser(req);
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }

  // Generate code if user doesn't have one yet
  let code = await getReferralCode(user.id);
  if (!code) {
    code = await generateReferralCode(user.id);
  }

  const stats = await getReferralStats(user.id);

  // Share URL is built from the request origin (never a hardcoded domain), so
  // referral links point at the same environment the user is actually on.
  const shareUrl = resolveSiteUrl(`/signup?ref=${code.code}`, req.url);
  return json({
    code: code.code,
    uses: stats?.usage_count ?? 0,
    max_uses: code.max_uses ?? 1000,
    rewards_earned: stats?.rewards_earned ?? 0,
    share_url: shareUrl ?? `/signup?ref=${code.code}`,
  });
}

async function handleApplyReferralCode(req: Request): Promise<Response> {
  const user = await getCurrentUser(req);
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const body = await req.json().catch(() => null);
  if (!body?.code || typeof body.code !== "string") {
    return json({ error: "Referral code is required" }, 400);
  }

  const code = String(body.code).trim().toUpperCase();
  const result = await applyReferralCode(code, user.id);

  if (!result.success) {
    return json({ error: result.error }, 400);
  }

  return json({ success: true, message: "Referral code applied! You'll both get a free month when you subscribe." });
}

// ── Founders Club ────────────────────────────────────────────────

async function handleFoundersCheckout(_req: Request): Promise<Response> {
  return json({ error: "Founders Club is included with the monthly Premium subscription; direct purchases are unavailable." }, 410);
}

async function handleFoundersCount(_req: Request): Promise<Response> {
  const count = await getFounderCount();
  return json({ count, remaining: Math.max(0, 1000 - count) });
}

async function handleFounderSpotsRemaining(_req: Request): Promise<Response> {
  const { remaining, total } = await getFounderSpotsRemaining();
  return json({ remaining, total });
}

// ── Beta Invite Admin (Austin cohort issuance) ────────────────
// Owner/admin-only issuance of closed-beta invite codes. The route is already
// behind the privileged-MFA gate in enforceSafety (/api/admin/*); the handler
// additionally restricts issuance to owner/admin (moderators can review but
// cannot mint codes). Issuance is audit-logged (counts only — codes are
// redeemable tokens and are never logged).
//
// Launch flow: POST /api/admin/beta-invites { count, notify: true } issues N
// plain codes and emails the first N waitlist entries (oldest-first, or the
// explicit waitlist_ids list) their personal invite link — one email per
// recipient, never a shared list. The notify path clamps to the cohort's
// remaining redeemable spots so we never email more invites than can be used.
const BETA_INVITE_ISSUE_MAX = 100;
const WAITLIST_ADMIN_LIST_MAX = 200;
async function handleBetaInvitesIssue(req: Request): Promise<Response> {
  const actor = await getCurrentUser(req);
  if (!actor || !hasPermission(actor, ["owner", "admin"])) {
    return json({ error: "Forbidden" }, 403);
  }
  const body = await req.json().catch(() => null);
  const count = Number(body?.count);
  if (!Number.isInteger(count) || count < 1 || count > BETA_INVITE_ISSUE_MAX) {
    return json({ error: `count must be an integer between 1 and ${BETA_INVITE_ISSUE_MAX}` }, 400);
  }
  const notify = body?.notify === true;
  const rawWaitlistIds = Array.isArray(body?.waitlist_ids) ? (body.waitlist_ids as unknown[]) : [];
  const waitlistIds = rawWaitlistIds.map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0);
  if (notify && body?.referrer_email != null) {
    return json({ error: "referrer_email cannot be combined with notify — waitlist invites are plain codes with no referrer" }, 400);
  }
  // Cohort-capacity clamp for the notify path: never email more invites than
  // there are redeemable spots. Plain issuance stays unclamped (the redemption
  // cap is enforced atomically at signup), preserving the existing flow.
  const stats = await getBetaInviteStats();
  const remaining = Math.max(0, stats.cap - stats.redeemed);
  let effective = count;
  let clamped = false;
  if (notify && effective > remaining) { effective = remaining; clamped = true; }
  if (notify && effective < 1) {
    return json({ error: "The Austin beta cohort is full — no spots remain to invite.", code: "BETA_COHORT_FULL" }, 409);
  }
  // Resolve notify recipients: explicit waitlist_ids or oldest-first order.
  // Only waitlist entries are ever emailed — never arbitrary addresses.
  let recipients: Array<{ id: number; email: string }> = [];
  if (notify) {
    const rows = waitlistIds.length > 0
      ? await getWaitlistEntriesByIds(waitlistIds)
      : await listWaitlistEntries({ limit: effective, offset: 0 });
    recipients = ((rows ?? []) as Array<{ id: number; email: string }>).slice(0, effective);
    if (recipients.length < effective) {
      if (recipients.length === 0) {
        return json({ error: "No waitlist entries to invite — ask people to join the waitlist first.", code: "WAITLIST_EMPTY" }, 409);
      }
      effective = recipients.length;
      clamped = true;
    }
  }
  // Referrer linkage: plain issuance keeps the actor (or referrer_email) as the
  // referrer; waitlist invites are always plain codes (referrer_user_id NULL),
  // so the referral reward never fires for a waitlist invite.
  let referrerUserId: number | null = actor.id;
  if (notify) {
    referrerUserId = null;
  } else if (body?.referrer_email) {
    const referrer = await getUserByEmail(String(body.referrer_email).trim().toLowerCase());
    if (!referrer) return json({ error: "Referrer account not found" }, 400);
    referrerUserId = referrer.id;
  }
  // Mint unique codes (deduped against the beta table; the redemption cap is
  // enforced separately at signup, so issuing more than the cap is fine).
  const codes: string[] = [];
  const seen = new Set<string>();
  let attempts = 0;
  while (codes.length < effective && attempts < effective * 25) {
    attempts++;
    const code = generateRandomCode();
    if (seen.has(code)) continue;
    seen.add(code);
    const dup = await getBetaInviteCodeByCode(code);
    if (dup) continue;
    codes.push(code);
  }
  if (codes.length < effective) {
    return json({ error: "Could not generate enough unique codes — please try again" }, 503);
  }
  const issued = await issueBetaInviteCodes({ codes, referrerUserId, issuedByUserId: actor.id });
  await recordAdminAuditEvent({
    actorUserId: actor.id,
    actorRole: actor.role ?? "admin",
    action: "beta_invites.issue",
    targetType: "beta_invite",
    metadata: { count: issued.length, referrer_user_id: referrerUserId, notify },
  });
  // Email each recipient their personal invite link. Each send carries only
  // that recipient's code; failures are logged by email.ts and counted here
  // (the codes stay valid either way). Recipient addresses are never logged.
  let emailed = 0;
  if (notify) {
    const origin = originFromUrl(req.url) ?? "https://gradedate.app";
    let failed = 0;
    for (let i = 0; i < recipients.length; i++) {
      const code = issued[i];
      if (!code) continue;
      const ok = await betaInviteEmailSender({
        email: recipients[i].email,
        inviteUrl: `${origin}/signup?ref=${encodeURIComponent(code)}`,
      });
      if (ok) emailed++;
      else failed++;
    }
    if (failed > 0) {
      await recordAdminAuditEvent({
        actorUserId: actor.id,
        actorRole: actor.role ?? "admin",
        action: "beta_invites.notify",
        targetType: "waitlist",
        metadata: { attempted: recipients.length, delivered: emailed, failed },
      });
    }
  }
  const statsAfter = await getBetaInviteStats();
  return json({
    codes: issued,
    cohort: { cap: statsAfter.cap, redeemed: statsAfter.redeemed, remaining: Math.max(0, statsAfter.cap - statsAfter.redeemed) },
    ...(notify ? { emailed, clamped } : {}),
  });
}
async function handleBetaInvitesStats(req: Request): Promise<Response> {
  const actor = await getCurrentUser(req);
  if (!actor || !hasPermission(actor, ["owner", "admin"])) {
    return json({ error: "Forbidden" }, 403);
  }
  const [stats, waitlistTotal] = await Promise.all([getBetaInviteStats(), getWaitlistCount()]);
  return json({
    cohort: { cap: stats.cap, redeemed: stats.redeemed, remaining: Math.max(0, stats.cap - stats.redeemed) },
    issued: stats.issued,
    waitlist: { total: Number(waitlistTotal ?? 0) },
  });
}
// ── Waitlist Admin (Austin beta launch ops) ────────────────────
// Owner/admin-only waitlist listing for launch ops (see who joined, then issue
// + notify). Already behind the privileged-MFA gate in enforceSafety
// (/api/admin/*); the handler additionally restricts to owner/admin so the
// email list is never exposed to moderators or regular users. Audit-logged
// with counts only.
async function handleWaitlistAdminList(req: Request): Promise<Response> {
  const actor = await getCurrentUser(req);
  if (!actor || !hasPermission(actor, ["owner", "admin"])) {
    return json({ error: "Forbidden" }, 403);
  }
  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get("limit") ?? 100);
  const offsetRaw = Number(url.searchParams.get("offset") ?? 0);
  const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, WAITLIST_ADMIN_LIST_MAX) : 100;
  const offset = Number.isInteger(offsetRaw) && offsetRaw > 0 ? offsetRaw : 0;
  const [rows, total] = await Promise.all([listWaitlistEntries({ limit, offset }), getWaitlistCount()]);
  const entries = ((rows ?? []) as Array<{ id: number; email: string; zip_code: string | null; created_at: string }>)
    .map(({ id, email, zip_code, created_at }) => ({ id, email, zip_code, created_at }));
  await recordAdminAuditEvent({
    actorUserId: actor.id,
    actorRole: actor.role ?? "admin",
    action: "waitlist.read",
    targetType: "waitlist",
    metadata: { limit, offset, total: Number(total ?? 0) },
  });
  return json({ total: Number(total ?? 0), limit, offset, entries });
}

// ── Waitlist ────────────────────────────────────────────────────

// Best-effort waitlist enrollment used when the beta cohort is full, so
// blocked signups still land in the funnel. Mirrors handleWaitlistJoin's
// email validation; never throws.
async function enrollInWaitlistOnFull(email: string): Promise<void> {
  try {
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      await joinWaitlist(email, undefined);
    }
  } catch { /* best-effort — the signup rejection is the primary outcome */ }
}

async function handleWaitlistJoin(req: Request): Promise<Response> {
  // Dedicated waitlist bucket (5/15 min) — separate from signup so waitlist
  // joins can never exhaust the signup budget (and vice versa). Generic 429.
  const rateLimitResponse = checkRateLimit(req, "waitlist", { maxRequests: 5, windowMs: 15 * 60 * 1000 });
  if (rateLimitResponse) return rateLimitResponse;

  const body = await req.json().catch(() => null);
  if (!body?.email || typeof body.email !== "string") {
    return json({ error: "Email is required" }, 400);
  }

  const email = String(body.email).trim().toLowerCase();
  const zipCode = body.zip_code ? String(body.zip_code).trim() : undefined;

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return json({ error: "Please enter a valid email address" }, 400);
  }

  // Validate ZIP code if provided (basic: 5 digits, optional dash+4)
  if (zipCode && !/^\d{5}(-\d{4})?$/.test(zipCode)) {
    return json({ error: "Please enter a valid ZIP code" }, 400);
  }

  // Insert into waitlist. A duplicate email yields null from ON CONFLICT DO
  // NOTHING and is still a success (idempotent join); a real DB error throws
  // and must surface as a 500 so signups are never silently eaten.
  try {
    await joinWaitlist(email, zipCode);
  } catch (err) {
    console.error("waitlist join failed:", err);
    return json({ error: "Could not join the waitlist. Please try again." }, 500);
  }
  // Send confirmation email (best-effort, don't fail if email fails). The CTA
  // link is built from the request origin so it points at the site the visitor
  // actually signed up on.
  await sendWaitlistConfirmation(email, originFromUrl(req.url));

  return json({ success: true });
}

// ── Contact ─────────────────────────────────────────────────────
async function handleContact(req: Request): Promise<Response> {
  const limited = checkRateLimit(req, "contact", { maxRequests: 5, windowMs: 15 * 60 * 1000 });
  if (limited) return limited;
  const body = await req.json().catch(() => null);
  const topics = ["support", "safety", "privacy", "billing", "dmca", "other"];
  if (!body || typeof body !== "object") return json({ error: "A JSON body is required" }, 400);
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const name = body.name == null ? "" : String(body.name).trim();
  const topic = typeof body.topic === "string" ? body.topic : "";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Please enter a valid email address" }, 400);
  if (!message) return json({ error: "Message is required" }, 400);
  if (message.length > 4000) return json({ error: "Message must be 4000 characters or fewer" }, 400);
  if (name.length > 120) return json({ error: "Name must be 120 characters or fewer" }, 400);
  if (!topics.includes(topic)) return json({ error: "Please select a valid topic" }, 400);
  const delivered = await sendContactMessage({ name, email, topic, message });
  if (!delivered) return json({ error: "Message not delivered — please try again shortly." }, 503);
  return json({ ok: true });
}
// ── Badges ─────────────────────────────────────────────────────

async function handleUserBadges(req: Request): Promise<Response> {
  const user = await getCurrentUser(req);
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }
  const badges = await getUserPersistedBadges(user.id);
  return json({ badges });
}

// ── Grade Card ──────────────────────────────────────────────────

async function handleGradeCard(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const userIdStr = url.searchParams.get("userId");
  if (!userIdStr) {
    return json({ error: "userId is required" }, 400);
  }
  // Grade cards include the user's percentile and badges. They are private;
  // userId is not a share credential and must never enable enumeration.
  const currentUser = await getCurrentUser(req);
  if (!currentUser) {
    return json({ error: "Unauthorized" }, 401);
  }
  const userId = Number(userIdStr);
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    return json({ error: "Invalid userId" }, 400);
  }
  if (!isGradeCardOwner(userId, currentUser.id)) {
    return json({ error: "Forbidden" }, 403);
  }

  let displayName = "Anonymous";
  let percentileLabel = "";
  let badgeSvg = "";

  try {
    const user = await getUserById(userId);
    if (!user) {
      return json({ error: "User not found" }, 404);
    }
    displayName = user.display_name || "Anonymous";
    if (user.percentile != null && user.percentile_city) {
      percentileLabel = `${topPercentLabel(user.percentile)} in ${user.percentile_city}`;
    }

    // Badges — nested try/catch so badge DB failure never kills the card
    try {
      // Dynamic badges (Layer B: founder, verified, best_photo, top_rated, active_dater, conversationalist)
      const dynamic = await getUserBadges(user);
      // Persisted badges (Layer A: first_grade, profile_complete, austin_local, founding_member)
      const persisted = await getUserPersistedBadges(user.id);
      const dynamicIds = new Set(dynamic.map((b) => b.id));
      const badgeDefs: Record<string, { emoji: string; name: string }> = {
        first_grade: { emoji: "🎯", name: "First Grade" },
        profile_complete: { emoji: "✨", name: "Profile Complete" },
        austin_local: { emoji: "🤠", name: "Austin Local" },
        founding_member: { emoji: "🏅", name: "Founding Member" },
      };

      // Merge: dynamic badges first, then persisted that aren't already covered
      const merged: { emoji: string; label: string }[] = [
        ...dynamic.map((b) => ({ emoji: b.emoji, label: b.label })),
        ...persisted
          .filter((b) => !dynamicIds.has(b.badge_type))
          .map((b) => {
            const def = badgeDefs[b.badge_type] || { emoji: "🏆", name: b.badge_type };
            return { emoji: def.emoji, label: b.details || def.name };
          }),
      ];

      badgeSvg = merged.slice(0, 6).map((b) => {
        return `<text x="24" y="36" font-size="20">${escapeXml(b.emoji)} ${escapeXml(b.label)}</text>`;
      }).join("\n");
    } catch {
      // Table might not exist yet — continue without badges
    }
  } catch {
    // Fall through to basic card without any user data
  }

  const safeName = escapeXml(displayName);
  const safePercentile = escapeXml(percentileLabel);
  const wantPng = url.searchParams.get("format") === "png";

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0b0b1e"/>
      <stop offset="100%" stop-color="#150a18"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="0%" r="80%">
      <stop offset="0%" stop-color="rgba(244,63,94,0.18)"/>
      <stop offset="100%" stop-color="rgba(244,63,94,0)"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <text x="100" y="590" font-family="Inter, system-ui, sans-serif" font-size="32" font-weight="bold" fill="#f43f5e">❤ Grade</text>
  <text x="235" y="590" font-family="Inter, system-ui, sans-serif" font-size="32" font-weight="bold" fill="#fff">Date</text>
  <text x="425" y="590" font-family="Inter, system-ui, sans-serif" font-size="20" fill="rgba(255,255,255,0.35)">.app</text>
  <text x="420" y="200" font-family="Inter, system-ui, sans-serif" font-size="28" font-weight="bold" fill="rgba(255,255,255,0.5)">${safeName}'s Grade</text>
  ${safePercentile ? `<text x="420" y="260" font-family="Inter, system-ui, sans-serif" font-size="48" font-weight="bold" fill="#f43f5e">${safePercentile}</text>` : ""}
  <text x="420" y="${safePercentile ? "320" : "280"}" font-family="Inter, system-ui, sans-serif" font-size="22" fill="rgba(255,255,255,0.45)">Badges</text>
  ${badgeSvg ? `<g transform="translate(420, ${safePercentile ? "340" : "300"})">${badgeSvg}</g>` : ""}
</svg>`;

  // ── PNG conversion (?format=png) ──────────────────────────
  if (wantPng) {
    try {
      const sharp = (await import("sharp")).default;
      const buf = await sharp(Buffer.from(svg)).png().toBuffer();
      return new Response(buf, {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=3600, s-maxage=86400",
          "CDN-Cache-Control": "public, max-age=86400",
          "Content-Length": String(buf.length),
        },
      });
    } catch (e: any) {
      logError(EVENTS.GRADE_CARD_PNG_FAILED, { err: e });
      // Return error as SVG with error message for debugging
      const errSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#0b0b1e"/>
  <text x="100" y="315" font-family="monospace" font-size="20" fill="#f43f5e">PNG Error: ${escapeXml(String(e?.message || e))}</text>
</svg>`;
      return new Response(errSvg, {
        status: 500,
        headers: { "Content-Type": "image/svg+xml" },
      });
    }
  }

  return new Response(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
      "CDN-Cache-Control": "public, max-age=86400",
    },
  });
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ── Router ────────────────────────────────────────────────────

/**
 * Verify CSRF token for state-changing POST endpoints.
 * Returns an error response if invalid, or null if valid.
 */
function checkCsrf(req: Request): Response | null {
  if (!verifyCsrfToken(req)) {
    return json({ error: "Invalid or missing CSRF token" }, 403);
  }
  return null;
}

// ── Health & Readiness ─────────────────────────────────────────

/**
 * Cheap liveness probe: no dependencies, no database, no auth. Exists so
 * load balancers / uptime checks can distinguish "process up" from anything
 * else. For dependency health, use /api/ready.
 */
async function handleHealth(_req: Request): Promise<Response> {
  return json({ ok: true, status: "ok" });
}

/**
 * Minimal readiness probe: verifies the database answers a trivial query.
 * Never leaks configuration: on any failure (missing DATABASE_URL, invalid
 * connection string, or query error) it returns a coarse 503 with a stable
 * reason code and no error detail, connection string, or stack trace.
 */
async function handleReady(_req: Request): Promise<Response> {
  const result = await checkDatabaseReady();
  if (!result.ok) {
    return json({ ok: false, status: "unavailable", reason: result.reason }, 503);
  }
  // Read-only retention-cron heartbeat (coarse operational facts only: last
  // run time, outcome, result counts, consecutive-failure streak). Fail-closed:
  // null/absent when the state was never recorded or cannot be read — never a
  // throw, and never user data, blob keys, or secrets.
  return json({ ok: true, status: "ready", retention: retentionReadyPayload(await getRetentionCronState()) });
}
/**
 * Shape the retention-cron heartbeat for /api/ready. Exported so the payload
 * contract is unit-testable without a database. Deliberately coarse and
 * key-free; the raw state contains nothing sensitive.
 */
export function retentionReadyPayload(state: { lastRunAt: string; lastOutcome: string; resolvedReports: number; auditEvents: number; quarantinedPhotoCases: number; consecutiveFailures: number } | null) {
  if (!state) return null;
  return {
    last_run_at: state.lastRunAt,
    last_outcome: state.lastOutcome,
    resolved_reports: state.resolvedReports,
    audit_events_deleted: state.auditEvents,
    quarantined_photo_cases_purged: state.quarantinedPhotoCases,
    consecutive_failures: state.consecutiveFailures,
  };
}


function b64url(bytes: Uint8Array): string { return Buffer.from(bytes).toString("base64url"); }
function fromB64url(value: string): Uint8Array { return new Uint8Array(Buffer.from(value, "base64url")); }
async function privilegedCandidate(req: Request): Promise<User | null> {
  const body = await req.json().catch(() => null); if (!body?.email || !body?.password) return null;
  const user = await getUserByEmail(String(body.email).trim().toLowerCase());
  if (!user || !["owner", "admin", "moderator"].includes(String(user.role)) || isSuspended(user) || !(await BunPw.verify(String(body.password), user.password_hash))) return null;
  return user;
}
async function handleMfaEnrollOptions(req: Request): Promise<Response> {
  const user = await getCurrentUser(req); if (!user || !["owner","admin","moderator"].includes(String(user.role)) || isSuspended(user)) return json({error:"Forbidden"},403);
  const credentials = await getWebAuthnCredentials(user.id); const options = await registrationOptions(user, credentials.map(c => String(c.id)));
  const challengeId = await createWebAuthnChallenge({userId:user.id, challenge:options.challenge, purpose:"registration", expiresAt:new Date(Date.now()+MFA_CHALLENGE_TTL_MS)});
  await recordAdminAuditEvent({actorUserId:user.id,actorRole:user.role,action:"mfa.enrollment.started",targetType:"user",targetId:String(user.id),requestId:requestIdFrom(req)});
  return json({options, challenge_id:challengeId});
}
async function handleMfaEnrollVerify(req: Request): Promise<Response> {
  const user = await getCurrentUser(req); if (!user || !["owner","admin","moderator"].includes(String(user.role)) || isSuspended(user)) return json({error:"Forbidden"},403);
  // Failure-path audit so a failed enrollment leaves a trail with the exact
  // reason. Best-effort: a logging failure must never mask the real error.
  const logFail = (reason: string, extra: Record<string, unknown> = {}): Promise<void> =>
    recordAdminAuditEvent({actorUserId:user.id,actorRole:user.role,action:"mfa.enrollment.failed",targetType:"user",targetId:String(user.id),requestId:requestIdFrom(req),metadata:{reason,...extra}}).catch(() => {});
  const body = await req.json().catch(() => null);
  if (body === null || typeof body !== "object") { await logFail("no_body"); return json({error:"Invalid or expired challenge"},400); }
  if (!body?.challenge_id) { await logFail("no_challenge_id"); return json({error:"Invalid or expired challenge"},400); }
  const consumed = await consumeWebAuthnChallenge(String(body.challenge_id),"registration");
  if (!consumed) { await logFail("challenge_unavailable"); return json({error:"Invalid or expired challenge"},400); }
  if (consumed.userId !== user.id) { await logFail("user_mismatch",{challenge_user_id:consumed.userId}); return json({error:"Invalid or expired challenge"},400); }
  if (!body?.response) { await logFail("no_response"); return json({error:"Invalid or expired challenge"},400); }
  try {
    const result = await verifyRegistration(body.response, consumed.challenge);
    if (!result.verified || !result.registrationInfo) { await logFail("assertion_failed",{name:"VerificationResultFailed",message:"assertion did not verify"}); return json({error:"Invalid assertion"},401); }
    const info = result.registrationInfo;
    try {
      await saveWebAuthnCredential({id:info.credential.id,userId:user.id,publicKey:info.credential.publicKey,counter:info.credential.counter,transports:(info.credential.transports??[]) as string[]});
    } catch (e) {
      await logFail("save_failed",{name:e instanceof Error?e.name:"UnknownError",message:e instanceof Error?e.message:"unknown save error"}); return json({error:"Invalid assertion"},401);
    }
    await recordAdminAuditEvent({actorUserId:user.id,actorRole:user.role,action:"mfa.enrollment.completed",targetType:"user",targetId:String(user.id),requestId:requestIdFrom(req),metadata:{reason:"ok"}});
    return json({ok:true});
  } catch (e) {
    await logFail("assertion_failed",{name:e instanceof Error?e.name:"UnknownError",message:e instanceof Error?e.message:"unknown verify error"}); return json({error:"Invalid assertion"},401);
  }
}
async function handlePrivilegedMfaStart(req: Request): Promise<Response> {
  const limited=checkStrictRateLimit(req); if(limited)return limited; const user=await privilegedCandidate(req); if(!user)return json({error:"Invalid credentials or privileged access unavailable",code:"PRIVILEGED_LOGIN_DENIED"},401);
  const credentials=await getWebAuthnCredentials(user.id); if(!credentials.length)return json({error:"Passkey enrollment required",code:"MFA_REQUIRED"},403); const options=await authenticationOptions(credentials.map(c=>String(c.id))); const challengeId=await createWebAuthnChallenge({userId:user.id,challenge:options.challenge,purpose:"authentication",expiresAt:new Date(Date.now()+MFA_CHALLENGE_TTL_MS)}); await recordAdminAuditEvent({actorUserId:user.id,actorRole:user.role,action:"mfa.authentication.started",targetType:"user",targetId:String(user.id),requestId:requestIdFrom(req)}); return json({options,challenge_id:challengeId});
}
async function handlePrivilegedMfaFinish(req: Request): Promise<Response> {
  const limited=checkStrictRateLimit(req); if(limited)return limited; const body=await req.json().catch(()=>null); const consumed=body?.challenge_id?await consumeWebAuthnChallenge(String(body.challenge_id),"authentication"):null; if(!consumed||!body?.response)return json({error:"Invalid or expired challenge"},401); const user=await getUserById(consumed.userId); if(!user||!["owner","admin","moderator"].includes(String(user.role))||isSuspended(user))return json({error:"Privileged access denied"},403); const credentials=await getWebAuthnCredentials(user.id); const cred=credentials.find(c=>String(c.id)===String(body.response?.id)); if(!cred)return json({error:"Invalid assertion"},401); try { const result=await verifyAuthentication(body.response,consumed.challenge,{id:String(cred.id),publicKey:new Uint8Array(cred.public_key),counter:Number(cred.counter)}); if(!result.verified)return json({error:"Invalid assertion"},401); await updateWebAuthnCounter(String(cred.id),result.authenticationInfo.newCounter); const session=await createPrivilegedSession(user.id); await recordAdminAuditEvent({actorUserId:user.id,actorRole:user.role,action:"mfa.authentication.completed",targetType:"session",targetId:String(session.id),requestId:requestIdFrom(req)}); return setSessionCookie(json({user:toSafeUser(user),mfa_verified:true,expires_at:session.expires_at}),session.id); } catch { return json({error:"Invalid assertion"},401); }
}

export async function handleApiRoute(
  req: Request,
): Promise<Response | null> {
  const url = new URL(req.url);
  const { method, pathname } = { method: req.method, pathname: url.pathname };
  if (pathname === "/api/cron/retention") return retentionCronHandler(req);

  const safetyError = await enforceSafety(req, pathname);
  if (safetyError) return safetyError;

  // Health & readiness — public, unauthenticated, no CSRF (GET only)
  if (pathname === "/api/health" && method === "GET") {
    return handleHealth(req);
  }
  if (pathname === "/api/ready" && method === "GET") {
    return handleReady(req);
  }

  // CSRF token endpoint — allows anonymous users to get a token before POST requests
  if (pathname === "/api/csrf" && method === "GET") {
    return setCsrfCookie(json({ ok: true }), generateCsrfToken());
  }

  // Geo check — public, rate-limited, no auth required
  if (pathname === "/api/geo-check" && method === "GET") {
    return handleGeoCheck(req);
  }

  if (pathname === "/api/auth/mfa/enroll/options" && method === "POST") return handleMfaEnrollOptions(req);
  if (pathname === "/api/auth/mfa/enroll/verify" && method === "POST") return handleMfaEnrollVerify(req);
  if (pathname === "/api/auth/privileged/start" && method === "POST") return handlePrivilegedMfaStart(req);
  if (pathname === "/api/auth/privileged/finish" && method === "POST") return handlePrivilegedMfaFinish(req);
  // Auth routes — CSRF not required (pre-auth or token-based)
  if (pathname === "/api/auth/signup" && method === "POST") {
    return handleSignup(req);
  }
  if (pathname === "/api/auth/login" && method === "POST") {
    return handleLogin(req);
  }
  if (pathname === "/api/auth/logout" && method === "POST") {
    const csrfErr = checkCsrf(req);
    if (csrfErr) return csrfErr;
    return handleLogout(req);
  }
  if (pathname === "/api/auth/me" && method === "GET") {
    return handleMe(req);
  }
  if (pathname === "/api/auth/forgot-password" && method === "POST") {
    return handleForgotPassword(req);
  }
  if (pathname === "/api/auth/reset-password" && method === "POST") {
    return handleResetPassword(req);
  }
  // Change password — CSRF required (authenticated sensitive action); rate
  // limited per client so a compromised session cannot be used to brute-force
  // the current password or hammer password changes.
  if (pathname === "/api/auth/change-password" && method === "POST") {
    const csrfErr = checkCsrf(req);
    if (csrfErr) return csrfErr;
    const rateLimitResponse = checkRateLimit(req, "change-password", { maxRequests: 5, windowMs: 15 * 60 * 1000 });
    if (rateLimitResponse) return rateLimitResponse;
    return handleChangePassword(req);
  }

  // Profile — CSRF required
  if (pathname === "/api/auth/update-profile" && method === "POST") {
    const csrfErr = checkCsrf(req);
    if (csrfErr) return csrfErr;
    return handleUpdateProfile(req);
  }

  // Upload — CSRF required
  if (pathname === "/api/upload" && method === "POST") {
    const csrfErr = checkCsrf(req);
    if (csrfErr) return csrfErr;
    return handleUpload(req);
  }

  // Photos management — CSRF required
  const photosDeleteMatch = pathname.match(/^\/api\/photos\/(\d+)$/);
  if (photosDeleteMatch && method === "DELETE") {
    const csrfErr = checkCsrf(req);
    if (csrfErr) return csrfErr;
    return handleDeletePhoto(req, Number(photosDeleteMatch[1]));
  }
  if (pathname === "/api/photos/reorder" && method === "PUT") {
    const csrfErr = checkCsrf(req);
    if (csrfErr) return csrfErr;
    return handleReorderPhotos(req);
  }
  const photosPrimaryMatch = pathname.match(/^\/api\/photos\/(\d+)\/primary$/);
  if (photosPrimaryMatch && method === "PUT") {
    const csrfErr = checkCsrf(req);
    if (csrfErr) return csrfErr;
    return handleSetPrimary(req, Number(photosPrimaryMatch[1]));
  }

  // Location
  if (pathname === "/api/location/lookup" && method === "POST") {
    return handleLocationLookup(req);
  }

  // Grade — CSRF required
  if (pathname === "/api/grade" && method === "POST") {
    const csrfErr = checkCsrf(req);
    if (csrfErr) return csrfErr;
    return handleGrade(req);
  }

  // Multi-photo grading (rebrand) — CSRF required
  if (pathname === "/api/grade-photos" && method === "POST") {
    const csrfErr = checkCsrf(req);
    if (csrfErr) return csrfErr;
    return handleGradePhotos(req);
  }

  // Experiment events — CSRF required; records only coarse allowlisted fields
  if (pathname === "/api/experiment-event" && method === "POST") {
    const csrfErr = checkCsrf(req);
    if (csrfErr) return csrfErr;
    return handleExperimentEvent(req);
  }

  // Percentile
  if (pathname === "/api/percentile" && method === "GET") {
    return handleGetPercentile(req);
  }

  // Badges — requires auth
  if (pathname === "/api/user-badges" && method === "GET") {
    return handleUserBadges(req);
  }

  // Grade card — public, no auth required (for sharing)
  if (pathname === "/api/grade-card" && method === "GET") {
    return handleGradeCard(req);
  }

  // Matches
  if (pathname === "/api/matches" && method === "GET") {
    return handleGetMatches(req);
  }
  if (pathname === "/api/matches/like" && method === "POST") {
    const csrfErr = checkCsrf(req);
    if (csrfErr) return csrfErr;
    return handleLike(req);
  }
  if (pathname === "/api/matches/pass" && method === "POST") {
    const csrfErr = checkCsrf(req);
    if (csrfErr) return csrfErr;
    return handlePass(req);
  }
  if (pathname === "/api/matches/unmatch" && method === "POST") {
    const csrfErr = checkCsrf(req);
    if (csrfErr) return csrfErr;
    return handleUnmatch(req);
  }

  // Messages
  if (pathname === "/api/messages/send" && method === "POST") {
    const csrfErr = checkCsrf(req);
    if (csrfErr) return csrfErr;
    return handleSendMessage(req);
  }
  if (pathname === "/api/messages/unread-count" && method === "GET") {
    return handleUnreadCount(req);
  }
  // GET /api/messages/{match_id}
  const msgMatch = pathname.match(/^\/api\/messages\/(\d+)$/);
  if (msgMatch && method === "GET") {
    return handleGetMessages(req, Number(msgMatch[1]));
  }

  // Connections
  if (pathname === "/api/connections" && method === "GET") {
    return handleGetConnections(req);
  }

  // User Safety — CSRF required
  if (pathname === "/api/users/block" && method === "POST") {
    const csrfErr = checkCsrf(req);
    if (csrfErr) return csrfErr;
    return handleBlock(req);
  }
  if (pathname === "/api/users/report" && method === "POST") {
    const csrfErr = checkCsrf(req);
    if (csrfErr) return csrfErr;
    return handleReport(req);
  }
  if (pathname === "/api/account/delete" && method === "POST") {
    const csrfErr = checkCsrf(req);
    if (csrfErr) return csrfErr;
    return handleDeleteAccount(req);
  }

  const messageModerationMatch = pathname.match(/^\/api\/admin\/message-moderation\/([^/]+)$/);
  if (pathname === "/api/admin/message-moderation" && method === "GET") return handleMessageModerationQueue(req);
  if (messageModerationMatch && method === "GET") return handleMessageModerationDetail(req, messageModerationMatch[1]);
  if (messageModerationMatch && method === "POST") { const csrfErr = checkCsrf(req); if (csrfErr) return csrfErr; return handleMessageModerationMutation(req, messageModerationMatch[1]); }
  const photoModerationMatch = pathname.match(/^\/api\/admin\/photo-moderation\/([^/]+)$/);
  if (pathname === "/api/admin/photo-moderation" && method === "GET") return handlePhotoModerationQueue(req);
  const reviewAccess = pathname.match(/^\/api\/admin\/photo-moderation\/([^/]+)\/access$/); if (reviewAccess && method === "GET") return handlePhotoReviewAccess(req, reviewAccess[1]);
  const reviewBytes = pathname.match(/^\/api\/admin\/photo-moderation\/([^/]+)\/bytes$/); if (reviewBytes && method === "GET") return handlePhotoReviewBytes(req, reviewBytes[1]);
  if (photoModerationMatch && method === "GET") return handlePhotoModerationDetail(req, photoModerationMatch[1]);
  if (photoModerationMatch && method === "POST") { const csrfErr = checkCsrf(req); if (csrfErr) return csrfErr; return handlePhotoModerationMutation(req, photoModerationMatch[1]); }
  const reportMatch = pathname.match(/^\/api\/admin\/reports\/([^/]+)$/);
  if (pathname === "/api/admin/reports" && method === "GET") return handleReportQueue(req);
  if (reportMatch && method === "GET") return handleReportDetail(req, reportMatch[1]);
  if (reportMatch && method === "POST") { const csrfErr = checkCsrf(req); if (csrfErr) return csrfErr; return handleReportMutation(req, reportMatch[1]); }

  if (pathname === "/api/suspension/appeal-status" && (method === "GET" || method === "POST")) { if(method==='POST'){const csrfErr=checkCsrf(req);if(csrfErr)return csrfErr;} return handleSuspensionAppeal(req); }
  if (pathname === "/api/admin/appeals" && method === "GET") return handleSuspensionAdmin(req);
  const appealMatch = pathname.match(/^\/api\/admin\/appeals\/([^/]+)$/); if(appealMatch && method === "POST"){const csrfErr=checkCsrf(req);if(csrfErr)return csrfErr;return handleSuspensionAdmin(req,appealMatch[1]);}
  if (pathname === "/api/admin/suspensions" && method === "POST"){const csrfErr=checkCsrf(req);if(csrfErr)return csrfErr;return handleSuspensionAdmin(req);}
  const suspensionMatch = pathname.match(/^\/api\/admin\/suspensions\/([^/]+)$/); if(suspensionMatch && method === "POST"){const csrfErr=checkCsrf(req);if(csrfErr)return csrfErr;return handleSuspensionAdmin(req,suspensionMatch[1]);}
  if (pathname === "/api/admin/beta-invites" && method === "POST") { const csrfErr = checkCsrf(req); if (csrfErr) return csrfErr; return handleBetaInvitesIssue(req); }
  if (pathname === "/api/admin/beta-invites" && method === "GET") return handleBetaInvitesStats(req);
  if (pathname === "/api/admin/waitlist" && method === "GET") return handleWaitlistAdminList(req);
  // Subscription
  if (pathname === "/api/subscription/status" && method === "GET") {
    return handleSubscriptionStatus(req);
  }
  if (pathname === "/api/subscription/activate" && method === "POST") {
    const csrfErr = checkCsrf(req);
    if (csrfErr) return csrfErr;
    return handleSubscriptionActivate(req);
  }
  if (pathname === "/api/subscription/create-checkout" && method === "POST") {
    const csrfErr = checkCsrf(req);
    if (csrfErr) return csrfErr;
    return handleCreateCheckout(req);
  }

  // Daily likes
  if (pathname === "/api/likes/remaining" && method === "GET") {
    return handleLikesRemaining(req);
  }

  // Upsell checkout / activation — CSRF required. Stripe verifies payment;
  // entitlement grants never trust client-supplied product or payment state.
  if (pathname === "/api/store/create-checkout" && method === "POST") {
    const csrfErr = checkCsrf(req);
    if (csrfErr) return csrfErr;
    return handleUpsellCheckout(req);
  }
  if (pathname === "/api/store/activate" && method === "POST") {
    const csrfErr = checkCsrf(req);
    if (csrfErr) return csrfErr;
    return handleActivateUpsell(req);
  }
  if (pathname === "/api/store/entitlement-status" && method === "GET") {
    return handleUpsellEntitlementStatus(req);
  }

  // Founders Club
  if (pathname === "/api/founders/checkout" && method === "POST") {
    const csrfErr = checkCsrf(req);
    if (csrfErr) return csrfErr;
    return handleFoundersCheckout(req);
  }
  if (pathname === "/api/founders/count" && method === "GET") {
    return handleFoundersCount(req);
  }
  if (pathname === "/api/founder-spots-remaining" && method === "GET") {
    return handleFounderSpotsRemaining(req);
  }

  // Liked Me
  if (pathname === "/api/matches/liked-me" && method === "GET") {
    return handleLikedMe(req);
  }

  if (pathname === "/api/verification/session" && method === "POST") {
    const csrfErr = checkCsrf(req);
    if (csrfErr) return csrfErr;
    return handleVerificationSession(req);
  }

  // Stripe webhook (unauthenticated — validated by Stripe signature, no CSRF)
  if (pathname === "/api/webhooks/stripe" && method === "POST") {
    return handleStripeWebhook(req);
  }

  // Push notifications — CSRF required for subscribe/unsubscribe
  if (pathname === "/api/push/vapid-public-key" && method === "GET") {
    return handleVapidPublicKey();
  }
  if (pathname === "/api/push/subscribe" && method === "POST") {
    const csrfErr = checkCsrf(req);
    if (csrfErr) return csrfErr;
    return handlePushSubscribe(req);
  }
  if (pathname === "/api/push/unsubscribe" && method === "POST") {
    const csrfErr = checkCsrf(req);
    if (csrfErr) return csrfErr;
    return handlePushUnsubscribe(req);
  }

  // Referral
  if (pathname === "/api/referral/code" && method === "GET") {
    return handleGetReferralCode(req);
  }
  if (pathname === "/api/referral-code" && method === "GET") {
    return handleGetReferralCode(req);
  }
  if (pathname === "/api/referral/apply" && method === "POST") {
    const csrfErr = checkCsrf(req);
    if (csrfErr) return csrfErr;
    return handleApplyReferralCode(req);
  }

  if (pathname === "/api/contact" && method === "POST") {
    const csrfErr = checkCsrf(req);
    if (csrfErr) return csrfErr;
    return handleContact(req);
  }
  // Waitlist — public, rate-limited but no CSRF required
  if (pathname === "/api/waitlist/join" && method === "POST") {
    return handleWaitlistJoin(req);
  }

  return null; // Not an API route
}
