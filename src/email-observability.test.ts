import { afterEach, describe, expect, test } from "bun:test";
import { EVENTS, setLogLevel, setLogSink, type LogSink } from "./observability";
import {
  sendPasswordResetEmail,
  sendWaitlistConfirmation,
  type EmailProvider,
} from "./email";

let captured: string[] = [];
const sink: LogSink = (line) => captured.push(line);

afterEach(() => {
  setLogSink(null);
  setLogLevel("info");
});

function capture() {
  captured = [];
  setLogSink(sink);
  setLogLevel("debug");
}

function logs() {
  return captured.map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe("email operational observability", () => {
  test("records missing provider configuration without recipient data", async () => {
    capture();
    await sendPasswordResetEmail("person@example.com", "https://example.test/reset/secret", null);
    expect(logs()).toEqual([
      expect.objectContaining({
        event: EVENTS.EMAIL_PROVIDER_UNCONFIGURED,
        purpose: "password_reset",
        provider: "resend",
      }),
    ]);
    expect(captured.join(" ")).not.toContain("person@example.com");
    expect(captured.join(" ")).not.toContain("secret");
  });

  test("records a coarse provider failure without raw provider error or email", async () => {
    capture();
    const provider: EmailProvider = {
      emails: {
        send: async () => {
          throw new Error("Resend rejected person@example.com with token=provider-secret");
        },
      },
    };
    const delivered = await sendWaitlistConfirmation("person@example.com", "https://example.test", provider);
    expect(delivered).toBe(false);
    expect(logs()).toEqual([
      expect.objectContaining({
        event: EVENTS.EMAIL_SEND_FAILED,
        purpose: "waitlist",
        provider: "resend",
        reason: "provider_error",
      }),
    ]);
    expect(captured.join(" ")).not.toContain("person@example.com");
    expect(captured.join(" ")).not.toContain("provider-secret");
    expect(captured.join(" ")).not.toContain("Resend rejected");
  });

  test("returns success when the provider accepts the message", async () => {
    const provider: EmailProvider = { emails: { send: async () => ({ id: "provider-id" }) } };
    await expect(sendPasswordResetEmail("person@example.com", "https://example.test/reset", provider)).resolves.toBe(true);
  });
});
