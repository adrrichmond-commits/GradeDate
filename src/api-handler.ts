import type { Server } from "bun";
import {
  createUser,
  getUserByEmail,
  getUserById,
  updateUserProfile,
  updateUserGrade,
  updateSubscriptionStatus,
  updateUserStripeInfo,
  getUserByStripeCustomerId,
  getUsersByGradeRange,
  recordLike,
  getLike,
  createSession,
  getSessionById,
  deleteSession,
  createMatch,
  isMatch,
  getMatchById,
  getMatchesForUser,
  createMessage,
  getMessages,
  getUnreadMessageCount,
  markMessagesRead,
  type User,
} from "../src/db.ts";
import Stripe from "stripe";
import { mkdirSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { webcrypto } from "node:crypto";

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
    `${SESSION_COOKIE}=${sessionId}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`,
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

async function getCurrentUser(req: Request): Promise<User | null> {
  const sessionId = getSessionId(req);
  if (!sessionId) return null;
  const session = await getSessionById(sessionId);
  if (!session) return null;
  return getUserById(session.user_id);
}

type SafeUser = Omit<User, "password_hash">;

function toSafeUser(user: User): SafeUser {
  const { password_hash: _, ...safe } = user;
  return safe;
}

function requireSubscription(user: User): Response | null {
  if (user.subscription_status !== "active") {
    return json(
      { error: "Subscription required", code: "NO_SUBSCRIPTION" },
      402,
    );
  }
  return null;
}

// ── API Route Handlers ────────────────────────────────────────

async function handleSignup(req: Request): Promise<Response> {
  const body = await req.json().catch(() => null);
  if (!body?.email || !body?.password) {
    return json({ error: "Email and password are required" }, 400);
  }

  const email = String(body.email).trim().toLowerCase();
  const password = String(body.password);

  if (password.length < 6) {
    return json({ error: "Password must be at least 6 characters" }, 400);
  }

  const existing = await getUserByEmail(email);
  if (existing) {
    return json({ error: "An account with this email already exists" }, 409);
  }

  const passwordHash = await BunPw.hash(password);
  const user = await createUser(email, passwordHash);
  const session = await createSession(user.id);

  return setSessionCookie(json({ user: toSafeUser(user) }, 201), session.id);
}

async function handleLogin(req: Request): Promise<Response> {
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

  const session = await createSession(user.id);
  return setSessionCookie(json({ user: toSafeUser(user) }), session.id);
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
  return json({ user: toSafeUser(user) });
}

async function handleUpload(req: Request): Promise<Response> {
  const user = await getCurrentUser(req);
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return json({ error: "Expected multipart/form-data" }, 400);
  }

  const formData = await req.formData().catch(() => null);
  if (!formData) {
    return json({ error: "Invalid form data" }, 400);
  }

  const file = formData.get("photo") as File | null;
  if (!file) {
    return json({ error: "No photo file provided" }, 400);
  }

  if (!file.type.startsWith("image/")) {
    return json({ error: "File must be an image" }, 400);
  }

  const ext = file.name.split(".").pop() || "jpg";
  const filename = `${user.id}_${Date.now()}.${ext}`;
  const filePath = path.join(uploadsDir(), filename);

  const buffer = await file.arrayBuffer();
  writeFileSync(filePath, new Uint8Array(buffer));

  // Update user's photo_path
  await updateUserProfile(user.id, {
    display_name: user.display_name || "",
    age: user.age || 0,
    gender: user.gender || "",
    bio: user.bio || "",
    photo_path: `/uploads/${filename}`,
  });

  return json({ photo_path: `/uploads/${filename}` });
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

  const { display_name, age, gender, bio, photo_path } = body;

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

  // Merge with existing values for partial updates
  await updateUserProfile(user.id, {
    display_name: display_name !== undefined ? String(display_name).trim() : (user.display_name || ""),
    age: age !== undefined ? Number(age) : (user.age || 0),
    gender: gender !== undefined ? String(gender) : (user.gender || ""),
    bio: bio !== undefined ? String(bio).trim() : (user.bio || ""),
    photo_path: photo_path !== undefined ? String(photo_path) : (user.photo_path || ""),
  });

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

async function gradeWithAI(photoPath: string): Promise<{ grade: number; analysis: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  // Read the photo file from disk
  const dir = uploadsDir();
  const filename = path.basename(photoPath);
  const filePath = path.join(dir, filename);

  let buffer: Buffer;
  try {
    buffer = readFileSync(filePath);
  } catch {
    throw new Error(`Photo file not found: ${filePath}`);
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
            "You are an objective facial appearance rater. Analyze the given photo and rate facial appearance on a 1-10 scale (1=lowest, 10=highest). Consider facial symmetry, proportions, skin clarity, and overall attractiveness. Respond ONLY with a JSON object in this exact format: {\"grade\": <number 1-10>, \"analysis\": \"<brief one-line analysis>\"}",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Rate this person's facial appearance on a 1-10 scale.",
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
  const user = await getCurrentUser(req);
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const subErr = requireSubscription(user);
  if (subErr) return subErr;

  if (!user.photo_path) {
    return json({ error: "You must upload a photo before getting graded" }, 400);
  }

  if (user.grade !== null) {
    return json({ error: "You have already been graded", grade: user.grade }, 400);
  }

  let grade: number;
  let analysis: string | null = null;
  let usedAI = false;

  try {
    const result = await gradeWithAI(user.photo_path);
    grade = result.grade;
    analysis = result.analysis;
    usedAI = true;
  } catch (err) {
    // Fall back to mock weighted random grade on any failure
    console.error("AI grading failed, falling back to mock:", err);
    grade = getWeightedRandomGrade();
    usedAI = false;
  }

  await updateUserGrade(user.id, grade);

  return json({
    grade,
    ...(analysis ? { analysis } : {}),
    grading_method: usedAI ? "ai" : "mock",
  });
}

// ── Matching ─────────────────────────────────────────────────

async function handleGetMatches(req: Request): Promise<Response> {
  const user = await getCurrentUser(req);
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const subErr = requireSubscription(user);
  if (subErr) return subErr;

  if (user.grade === null) {
    return json({ error: "You must get graded before browsing matches", code: "NO_GRADE" }, 400);
  }

  const users = await getUsersByGradeRange(
    user.grade,
    user.grade - 1,
    user.grade + 1,
    user.id,
  );

  // Strip grades from other users in the response
  const safeUsers = users.map((u) => ({
    id: u.id,
    display_name: u.display_name,
    age: u.age,
    gender: u.gender,
    bio: u.bio,
    photo_path: u.photo_path,
  }));

  return json({ matches: safeUsers });
}

async function handleLike(req: Request): Promise<Response> {
  const user = await getCurrentUser(req);
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const body = await req.json().catch(() => null);
  const likedId = body?.liked_id;

  if (!likedId || typeof likedId !== "number") {
    return json({ error: "liked_id is required" }, 400);
  }

  if (likedId === user.id) {
    return json({ error: "You cannot like yourself" }, 400);
  }

  await recordLike(user.id, likedId, "like");

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
    }
  }

  // Get the other user's info for the match celebration
  let otherUser = null;
  if (matched) {
    const other = await getUserById(likedId);
    if (other) {
      otherUser = {
        id: other.id,
        display_name: other.display_name,
        photo_path: other.photo_path,
      };
    }
  }

  return json({ ok: true, matched, match_id: matchId, other_user: otherUser });
}

async function handlePass(req: Request): Promise<Response> {
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
  const user = await getCurrentUser(req);
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const body = await req.json().catch(() => null);
  const { match_id, content } = body || {};

  if (!match_id || typeof match_id !== "number") {
    return json({ error: "match_id is required" }, 400);
  }
  if (!content || typeof content !== "string" || content.trim().length === 0) {
    return json({ error: "content is required" }, 400);
  }

  // Verify user is a participant in this match
  const match = await getMatchById(match_id);
  if (!match) {
    return json({ error: "Match not found" }, 404);
  }
  if (match.user1_id !== user.id && match.user2_id !== user.id) {
    return json({ error: "You are not a participant in this match" }, 403);
  }

  const message = await createMessage(match_id, user.id, content.trim());

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

async function handleSubscriptionActivate(req: Request): Promise<Response> {
  const user = await getCurrentUser(req);
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }

  if (user.subscription_status === "active") {
    return json({
      ok: true,
      message: "Subscription already active",
      subscription_status: "active",
    });
  }

  await updateSubscriptionStatus(user.id, "active");
  return json({
    ok: true,
    message: "Subscription activated",
    subscription_status: "active",
  });
}

// ── Stripe Webhook ─────────────────────────────────────────────

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.warn("STRIPE_SECRET_KEY not configured — Stripe features disabled");
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

  let event: Stripe.Event;

  if (webhookSecret) {
    const stripe = getStripe();
    if (!stripe) {
      return json({ error: "Stripe not configured" }, 500);
    }
    try {
      event = stripe.webhooks.constructEvent(
        rawBody,
        signature,
        webhookSecret,
      );
    } catch (err) {
      console.error("Stripe webhook signature verification failed:", err);
      return json({ error: "Invalid signature" }, 400);
    }
  } else {
    // Fallback: no webhook secret configured — parse without verification
    console.warn(
      "STRIPE_WEBHOOK_SECRET not set — accepting webhook without signature verification",
    );
    try {
      event = JSON.parse(rawBody) as Stripe.Event;
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
  }

  console.log(`Stripe webhook received: ${event.type}`);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerEmail = session.customer_details?.email;
        const customerId =
          typeof session.customer === "string" ? session.customer : null;
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : null;

        if (!customerEmail) {
          console.warn(
            "checkout.session.completed: no customer email in session",
          );
          break;
        }

        // Find user by email
        const user = await getUserByEmail(customerEmail.toLowerCase());
        if (!user) {
          console.warn(
            `checkout.session.completed: no user found for email ${customerEmail}`,
          );
          break;
        }

        if (customerId && subscriptionId) {
          await updateUserStripeInfo(user.id, customerId, subscriptionId);
          console.log(
            `Subscription activated for user ${user.id} (${customerEmail}) — sub: ${subscriptionId}`,
          );
        } else {
          // Fallback: just activate without storing Stripe IDs
          await updateSubscriptionStatus(user.id, "active");
          console.log(
            `Subscription activated for user ${user.id} (${customerEmail}) — no Stripe IDs stored`,
          );
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
          console.warn(
            "customer.subscription.deleted: no customer ID in subscription",
          );
          break;
        }

        const user = await getUserByStripeCustomerId(customerId);
        if (!user) {
          console.warn(
            `customer.subscription.deleted: no user found for customer ${customerId}`,
          );
          break;
        }

        await updateSubscriptionStatus(user.id, "inactive");
        console.log(
          `Subscription cancelled for user ${user.id} (stripe customer: ${customerId})`,
        );
        break;
      }

      default:
        // Ignore other event types
        console.log(`Unhandled Stripe event type: ${event.type}`);
    }
  } catch (err) {
    console.error("Error processing Stripe webhook:", err);
    return json({ error: "Webhook processing error" }, 500);
  }

  // Always return 200 quickly
  return json({ received: true });
}

// ── Router ────────────────────────────────────────────────────

export async function handleApiRoute(
  req: Request,
): Promise<Response | null> {
  const url = new URL(req.url);
  const { method, pathname } = { method: req.method, pathname: url.pathname };

  // Auth routes
  if (pathname === "/api/auth/signup" && method === "POST") {
    return handleSignup(req);
  }
  if (pathname === "/api/auth/login" && method === "POST") {
    return handleLogin(req);
  }
  if (pathname === "/api/auth/logout" && method === "POST") {
    return handleLogout(req);
  }
  if (pathname === "/api/auth/me" && method === "GET") {
    return handleMe(req);
  }

  // Profile
  if (pathname === "/api/auth/update-profile" && method === "POST") {
    return handleUpdateProfile(req);
  }

  // Upload
  if (pathname === "/api/upload" && method === "POST") {
    return handleUpload(req);
  }

  // Grade
  if (pathname === "/api/grade" && method === "POST") {
    return handleGrade(req);
  }

  // Matches
  if (pathname === "/api/matches" && method === "GET") {
    return handleGetMatches(req);
  }
  if (pathname === "/api/matches/like" && method === "POST") {
    return handleLike(req);
  }
  if (pathname === "/api/matches/pass" && method === "POST") {
    return handlePass(req);
  }

  // Messages
  if (pathname === "/api/messages/send" && method === "POST") {
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

  // Subscription
  if (pathname === "/api/subscription/status" && method === "GET") {
    return handleSubscriptionStatus(req);
  }
  if (pathname === "/api/subscription/activate" && method === "POST") {
    return handleSubscriptionActivate(req);
  }

  // Stripe webhook (unauthenticated — validated by Stripe signature)
  if (pathname === "/api/webhooks/stripe" && method === "POST") {
    return handleStripeWebhook(req);
  }

  return null; // Not an API route
}
