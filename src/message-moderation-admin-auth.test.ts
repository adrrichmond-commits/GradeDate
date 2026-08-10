import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(import.meta.dir, "api-handler.ts"), "utf8");
const handler = (name: string) => source.slice(source.indexOf(`async function ${name}`), source.indexOf("\nasync function ", source.indexOf(`async function ${name}`) + 1));

describe("message moderation admin authorization", () => {
  test("queue requires an authenticated photo-review role and cannot crash unauthenticated requests", () => {
    const body = handler("handleMessageModerationQueue");
    expect(body).toContain("const user = await getCurrentUser(req);");
    expect(body).toContain('if (!user || !canReviewPhoto(user.role)) return json({ error: "Forbidden" }, 403);');
    expect(body).not.toContain("getCurrentUser(req))!.id");
  });

  test("detail requires a reviewer role before recent MFA and uses a checked user", () => {
    const body = handler("handleMessageModerationDetail");
    expect(body).toContain('if (!user || !canReviewPhoto(user.role)) return json({ error: "Forbidden" }, 403);');
    expect(body).toContain("const session = await getCurrentSession(req);");
    expect(body).toContain('if (!recent) return json({ error: "Recent MFA reauthentication required" }, 403);');
    expect(body).not.toContain("getCurrentUser(req)!");
  });

  test("mutation requires a reviewer role and recent MFA before any action", () => {
    const body = handler("handleMessageModerationMutation");
    expect(body).toContain('if (!user || !canReviewPhoto(user.role)) return json({ error: "Forbidden" }, 403);');
    expect(body).toContain('if (!recent) return json({ error: "Recent MFA reauthentication required" }, 403);');
    expect(body).not.toContain("getCurrentUser(req)!");
    expect(body.indexOf("canReviewPhoto")).toBeLessThan(body.indexOf("getMessageModerationContext"));
  });

  test("authorized queue, detail, and mutation retain audit events", () => {
    expect(handler("handleMessageModerationQueue")).toContain('action: "message_moderation.queue.read"');
    expect(handler("handleMessageModerationDetail")).toContain('action: "message_moderation.read"');
    expect(handler("handleMessageModerationMutation")).toContain('action: "message_moderation.mutate"');
  });
});
