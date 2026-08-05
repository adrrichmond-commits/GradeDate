import { afterEach, describe, expect, test } from "bun:test";
import {
  EVENTS,
  EVENT_NAME_RE,
  currentLevel,
  logError,
  logInfo,
  normalizeError,
  redactPath,
  redactUrl,
  redactValue,
  requestIdFrom,
  scanString,
  setLogLevel,
  setLogSink,
  withRequestId,
  type LogSink,
} from "./observability";

// Capture emitted log lines (one JSON record per emit).
let captured: string[] = [];
const testSink: LogSink = (line) => {
  captured.push(line);
};
function capture() {
  captured = [];
  setLogSink(testSink);
  setLogLevel("debug");
}
afterEach(() => {
  setLogSink(null);
  setLogLevel("info");
});

describe("event names", () => {
  test("all EVENTS names are stable and well-formed", () => {
    for (const name of Object.values(EVENTS)) {
      expect(name).toMatch(EVENT_NAME_RE);
    }
  });

  test("logger rejects malformed event names without throwing", () => {
    capture();
    logInfo("Bad Event Name!", {});
    expect(captured).toHaveLength(1);
    const line = JSON.parse(captured[0]!);
    expect(line.event).toBe("logging.invalid_event");
    expect(line.level).toBe("info");
  });
});

describe("scanString / redaction", () => {
  test("redacts emails in place", () => {
    expect(scanString("contact user@example.com now")).toBe("contact [REDACTED] now");
  });

  test("redacts uuid tokens and long hex strings", () => {
    expect(scanString("id 123e4567-e89b-12d3-a456-426614174000 done")).toContain("[REDACTED]");
    expect(scanString("hash a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0 end")).not.toContain("a1b2c3d4e5f6a7b8");
    expect(scanString("hash a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0 end")).toContain("[REDACTED]");
  });

  test("redacts jwt-like tokens", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
    expect(scanString(`token ${jwt}`)).toBe("token [REDACTED]");
  });

  test("redacts urls with credentials and query strings but keeps host", () => {
    expect(redactUrl("https://user:pass@example.com/path?secret=1&x=2#frag")).toBe("https://example.com/path");
    expect(redactUrl("https://store.public.blob.vercel-storage.com/anon_123e4567-e89b-12d3-a456-426614174000.jpg?download=1"))
      .toBe("https://store.public.blob.vercel-storage.com/anon_[REDACTED].jpg");
  });

  test("scanString strips urls inside prose", () => {
    const out = scanString("see https://api.openai.com/v1/chat/completions?api-key=abc123 for details");
    expect(out).not.toContain("api-key");
    expect(out).not.toContain("abc123");
    expect(out).toContain("https://api.openai.com/v1/chat/completions");
  });

  test("redactPath redacts token segments and query strings", () => {
    expect(redactPath("/uploads/anon_123e4567-e89b-12d3-a456-426614174000.jpg?token=x"))
      .toBe("/uploads/anon_[REDACTED].jpg");
    expect(redactPath("/api/grade-photos")).toBe("/api/grade-photos");
    expect(redactPath("/chat/42")).toBe("/chat/42");
  });

  test("truncates long strings", () => {
    const long = "lorem ipsum dolor sit amet consectetur adipiscing ".repeat(100); // ~5100 chars
    const out = scanString(long);
    expect(out.length).toBeLessThan(600);
    expect(out.startsWith(long.slice(0, 20))).toBe(true);
    expect(out.endsWith("chars]")).toBe(true);
  });
});

describe("redactValue", () => {
  test("drops sensitive keys recursively", () => {
    const out = redactValue({
      user_id: 42,
      email: "a@b.co",
      profile: { password: "hunter2", photo_path: "/uploads/anon_abc.jpg" },
      grade: 7,
    }) as Record<string, unknown>;
    expect(out.user_id).toBe(42);
    expect(out.email).toBe("[REDACTED]");
    expect((out.profile as Record<string, unknown>).password).toBe("[REDACTED]");
    expect((out.profile as Record<string, unknown>).photo_path).toBe("[REDACTED]");
    expect(out.grade).toBe(7);
  });

  test("redacts chat message content", () => {
    const out = redactValue({ message: { content: "hey bb wanna hang" } }) as Record<string, unknown>;
    expect(out.message).toBe("[REDACTED]");
  });

  test("handles circular references without throwing", () => {
    const a: Record<string, unknown> = {};
    const b: Record<string, unknown> = { a };
    a.self = a;
    a.b = b;
    const out = redactValue(a) as Record<string, unknown>;
    expect(out.self).toBe("[REDACTED]");
    expect((out.b as Record<string, unknown>).a).toBe("[REDACTED]");
  });

  test("bounds depth and key count", () => {
    const deep = { l1: { l2: { l3: { l4: { l5: { l6: { l7: { secret_thing: "x" } } } } } } } };
    const out = redactValue(deep) as Record<string, unknown>;
    expect(JSON.stringify(out)).toContain("[REDACTED]");
    const many = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`k${i}`, i]));
    const out2 = redactValue(many) as Record<string, unknown>;
    expect(Object.keys(out2).length).toBeLessThanOrEqual(41);
  });

  test("scans values inside non-sensitive keys", () => {
    const out = redactValue({ note: "reach me at x@y.com" }) as Record<string, unknown>;
    expect(out.note).toBe("reach me at [REDACTED]");
  });
});

describe("normalizeError", () => {
  test("produces a bounded shape with redacted message", () => {
    const err = new Error("failed to fetch https://user:pass@api.example.com/x?key=abc from a@b.co");
    const norm = normalizeError(err);
    expect(norm.name).toBe("Error");
    expect(norm.message).not.toContain("user:pass");
    expect(norm.message).not.toContain("a@b.co");
    expect(norm.stack).toBeDefined();
    expect(norm.stack!.length).toBeLessThan(2000);
  });

  test("keeps short string error codes", () => {
    const err = Object.assign(new Error("boom"), { code: "E_CONN_REFUSED" });
    expect(normalizeError(err).code).toBe("E_CONN_REFUSED");
  });

  test("normalizes non-Error values", () => {
    expect(normalizeError("plain string").name).toBe("UnknownError");
    expect(normalizeError(undefined).message.length).toBeGreaterThan(0);
  });
});

describe("logger envelope", () => {
  test("emits versioned JSON with level, event, time and redacted fields", () => {
    capture();
    logInfo(EVENTS.SERVER_STARTED, { port: 3000, env: "production" }, "site started");
    expect(captured).toHaveLength(1);
    const line = JSON.parse(captured[0]!) as Record<string, unknown>;
    expect(line.v).toBe(1);
    expect(line.level).toBe("info");
    expect(line.event).toBe("server.started");
    expect(typeof line.time).toBe("string");
    expect(line.port).toBe(3000);
    expect(line.msg).toBe("site started");
  });

  test("normalizes err field into the bounded shape", () => {
    capture();
    logError(EVENTS.GEO_PROVIDER_FAILED, { err: new Error("boom at https://x.io/?k=secret") });
    const line = JSON.parse(captured[0]!) as Record<string, unknown>;
    expect((line.err as Record<string, unknown>).message).toBeDefined();
    expect(JSON.stringify(line)).not.toContain("secret");
  });

  test("respects level filtering", () => {
    capture();
    setLogLevel("warn");
    logInfo(EVENTS.REQUEST_COMPLETE, { status: 200 });
    logError(EVENTS.REQUEST_FAILED, {});
    expect(captured).toHaveLength(1);
    expect(JSON.parse(captured[0]!).level).toBe("error");
  });
});

describe("request ids", () => {
  test("requestIdFrom reads the x-request-id header", () => {
    const req = new Request("https://example.com/", { headers: { "x-request-id": "abc-123" } });
    expect(requestIdFrom(req)).toBe("abc-123");
    expect(requestIdFrom(new Request("https://example.com/"))).toBeNull();
  });

  test("withRequestId sets and preserves the response header", () => {
    const res = new Response("ok", { status: 201 });
    const withId = withRequestId(res, "rid-1");
    expect(withId.headers.get("x-request-id")).toBe("rid-1");
    const again = withRequestId(withId, "rid-2");
    expect(again.headers.get("x-request-id")).toBe("rid-1"); // preserved
    expect(again.status).toBe(201);
  });
});

describe("level configuration", () => {
  test("currentLevel defaults to info and setLogLevel overrides", () => {
    expect(currentLevel()).toBe("info");
    setLogLevel("debug");
    expect(currentLevel()).toBe("debug");
    setLogLevel("info");
  });
});
