import { neon } from "@neondatabase/serverless";
import { timingSafeEqual, createHash } from "node:crypto";
import { runRetentionCleanup, type RetentionResult } from "./retention-cleanup";
import { getPrivateReviewProvider } from "./private-review-provider";
import { recordCronRunState, type RetentionCounts } from "./retention-cron-state";

type Cleanup = () => Promise<RetentionResult>;
type RecordRun = (outcome: "success" | "failure", counts: RetentionCounts) => Promise<void>;

/** Compare secrets without revealing whether a prefix matched. */
export function constantTimeSecretEqual(expected: string, provided: string): boolean {
  const expectedDigest = createHash("sha256").update(expected).digest();
  const providedDigest = createHash("sha256").update(provided).digest();
  return timingSafeEqual(expectedDigest, providedDigest);
}

function authorized(req: Request, secret: string | undefined): boolean {
  if (!secret) return false;
  const value = req.headers.get("authorization");
  const prefix = "Bearer ";
  return !!value && value.startsWith(prefix) && constantTimeSecretEqual(secret, value.slice(prefix.length));
}

function databaseCleanup(): Cleanup {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Database unavailable");
  const db = neon(url);
  return () => runRetentionCleanup({ query: (sql, values) => db.query(sql, values) }, new Date(), getPrivateReviewProvider());
}

function databaseRecordRun(): RecordRun | undefined {
  const url = process.env.DATABASE_URL;
  if (!url) return undefined;
  let db;
  try { db = neon(url); } catch { return undefined; }
  // Heartbeat is best-effort observability: a missing/malformed database
  // configuration must never crash the cron route, just skip the heartbeat.
  return (outcome, counts) => recordCronRunState({ query: (sql, values) => db.query(sql, values) }, outcome, counts);
}

/** Protected Vercel Cron endpoint. The secret is never included in responses or logs. */
export async function retentionCronHandler(req: Request, cleanup?: Cleanup, recordRun?: RecordRun): Promise<Response> {
  if (req.method !== "GET") return Response.json({ error: "Method not allowed" }, { status: 405, headers: { Allow: "GET" } });
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "Scheduler unavailable" }, { status: 503 });
  if (!authorized(req, secret)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const record = recordRun ?? databaseRecordRun();
  try {
    const result = await (cleanup ?? databaseCleanup())();
    // Heartbeat is best-effort observability: a record failure must not change the response.
    await record?.("success", result).catch(() => {});
    return Response.json({ ok: true, result });
  } catch {
    await record?.("failure", { resolvedReports: 0, auditEvents: 0, quarantinedPhotoCases: 0 }).catch(() => {});
    return Response.json({ error: "Retention cleanup failed" }, { status: 500 });
  }
}
