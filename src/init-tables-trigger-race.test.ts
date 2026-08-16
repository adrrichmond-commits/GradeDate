import { describe, expect, test } from "bun:test";
import { ensureAdminAuditImmutableTrigger } from "./db";

type Exec = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;

// Fails only on the CREATE TRIGGER call (the DROP must always succeed); records
// the normalized SQL of each call.
function mockExec(calls: string[], createError?: { code?: string } | Error): Exec {
  return async (strings) => {
    const sql = strings.join("").replace(/\s+/g, " ").trim();
    calls.push(sql);
    if (createError && sql.includes("CREATE TRIGGER")) throw createError;
    return [];
  };
}

// Live prod regression (2026-08-16 22:06:43): repeated
// `vercel.db.init_failed` with `NeonDbError: trigger "..." for relation
// "admin_audit_events" already exists` (code 42710) on cold start. Two+
// serverless instances both reached CREATE TRIGGER after the DROP (A drops,
// B drops no-op, A creates, B creates → 42710), initTables threw, and every
// migration after the trigger (likes, matches, messages, reports, moderation
// tables, beta invites, waitlist, ...) was silently skipped. The fix swallows
// ONLY code 42710 while keeping DROP+CREATE semantics for trigger replacement.
describe("ensureAdminAuditImmutableTrigger (admin_audit_events trigger race)", () => {
  test("does not throw when CREATE TRIGGER fails with 42710 (already exists)", async () => {
    const calls: string[] = [];
    const exec = mockExec(calls, { code: "42710" });
    await expect(ensureAdminAuditImmutableTrigger(exec as never)).resolves.toBeUndefined();
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain("DROP TRIGGER IF EXISTS admin_audit_events_immutable");
    expect(calls[1]).toContain("CREATE TRIGGER admin_audit_events_immutable");
  });

  test("rethrows errors that are NOT 42710", async () => {
    const calls: string[] = [];
    const exec = mockExec(calls, { code: "42601" }); // syntax error — must surface
    await expect(ensureAdminAuditImmutableTrigger(exec as never)).rejects.toMatchObject({ code: "42601" });
  });

  test("rethrows non-Postgres errors", async () => {
    const calls: string[] = [];
    const exec = mockExec(calls, new Error("connection refused"));
    await expect(ensureAdminAuditImmutableTrigger(exec as never)).rejects.toThrow("connection refused");
  });

  test("keeps DROP+CREATE semantics on success (trigger body can be replaced)", async () => {
    const calls: string[] = [];
    const exec = mockExec(calls);
    await ensureAdminAuditImmutableTrigger(exec as never);
    expect(calls).toHaveLength(2);
    // DROP runs first, then CREATE — the array order is the execution order.
    expect(calls[0]).toContain("DROP TRIGGER IF EXISTS admin_audit_events_immutable");
    expect(calls[1]).toContain("CREATE TRIGGER admin_audit_events_immutable");
    expect(calls[1]).toContain("EXECUTE FUNCTION deny_admin_audit_mutation()");
  });
});
