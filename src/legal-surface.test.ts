/**
 * /legal (Law Enforcement Guidelines) surface guards.
 *
 * Pins the page to the owner-ratified commitments (2026-08-17) PLUS the
 * 2026-08-30 provider-accuracy update for Stripe review:
 *   - Data descriptions reflect actual operating systems: AI photo analysis,
 *     third-party AI moderation (AWS Rekognition for photos, OpenAI for text),
 *     the optional OpenAI profile-review feature, and the private quarantine
 *     store for flagged photos.
 *   - A 2.3 Third-Party Providers table names each real provider and what it
 *     processes (AWS Rekognition, OpenAI, Stripe, Stripe Identity, Resend,
 *     Vercel / Vercel Blob / Vercel Analytics).
 *   - Section 7 keeps every ratified retention number and adds the clarifying
 *     sentence about flagged/automated photo cases (scan-before-complete,
 *     durable pending row, sweep of stuck automated cases).
 *   - The page NEVER claims legal-counsel review and never names an owner or
 *     entity that the owner has not registered.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
const SRC = path.join(import.meta.dir);
const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf8");
// JSX text wraps across source lines; flatten whitespace so assertions are
// stable against editor line-wrapping of the route file.
const flat = (s: string) => s.replace(/\s+/g, " ").trim();
const route = flat(read("routes/legal.tsx"));

describe("/legal page resolves and stays honest", () => {
  test("route file defines /legal with its own head()", () => {
    expect(route).toContain('createFileRoute("/legal")');
    expect(route).toContain("head: () => staticPageHead(");
    expect(route).toContain("GradeDate — Law Enforcement Guidelines");
  });

  test("last-updated date reflects the 2026-08-30 provider-accuracy update", () => {
    expect(route).toContain("Last updated: August 30, 2026");
  });

  test("2.1 describes AI photo analysis with grade/percentile private to the user", () => {
    expect(route).toContain("GradeDate performs AI-based analysis of uploaded photos");
    expect(route).toContain("profile grading, best-photo recommendation, city percentile");
    expect(route).toContain("private to the user and are not disclosed to other users");
  });

  test("2.1 includes a Moderation and automated analysis records row naming the real providers", () => {
    expect(route).toContain("Moderation and automated analysis records");
    expect(route).toContain("photo content via AWS Rekognition");
    expect(route).toContain("text content via OpenAI");
    expect(route).toContain("optional profile-review feature");
    expect(route).toContain("separate private quarantine store with short-lived, case-bound review access");
  });

  test("2.3 Third-Party Providers lists every real provider and what it processes", () => {
    expect(route).toContain("2.3 Third-Party Providers");
    for (const provider of [
      "AWS Rekognition",
      "OpenAI",
      "Stripe",
      "Stripe Identity",
      "Resend",
      "Vercel",
    ]) {
      expect(route).toContain(provider);
    }
    expect(route).toContain("Vercel Blob hosts the private quarantine store for flagged photos");
    expect(route).toContain("Vercel Analytics collects anonymous page-view statistics");
    expect(route).toContain("GradeDate does not store payment card data, government-ID images");
  });

  test("2.2 keeps the explicit list of data GradeDate does NOT have", () => {
    expect(route).toContain("Information GradeDate does NOT have");
    expect(route).toContain("Payment card numbers or full payment details");
    expect(route).toContain("Government ID images or selfies submitted for age verification");
    expect(route).toContain("Plaintext passwords");
    expect(route).toContain("Message content after account deletion");
  });

  test("section 7 preserves every ratified retention commitment and adds the flagged-case sentence", () => {
    expect(route).toContain("Safety reports are retained for 12 months after resolution");
    expect(route).toContain("administrative audit records are retained for a minimum of 24 months");
    expect(route).toContain("quarantined photo review cases are retained per our moderation retention schedule (default 30 days)");
    expect(route).toContain("photo uploads await their content scan before completing");
    expect(route).toContain("failed quarantine keeps the case as a durable pending row");
    expect(route).toContain("sweep purges stuck automated cases after the retention window");
    expect(route).toContain("Legal-hold evidence is never purged early");
  });

  test("every ratified timeline/number is unchanged on the page", () => {
    expect(route).toContain("Payson, Utah, United States");
    expect(route).toContain("90 days");
    expect(route).toContain("2 business days");
    expect(route).toContain("10 business days");
    expect(route).toContain("24 hours");
    expect(route).toContain("18 U.S.C. § 2258A");
    expect(route).toContain("1-888-373-7888");
    expect(route).toContain("messages are hard-deleted immediately upon account deletion");
  });

  test("the page never claims legal-counsel review or a registered entity name", () => {
    expect(route).not.toMatch(/legal counsel/i);
    expect(route).not.toMatch(/attorney\s*review/i);
    expect(route).not.toMatch(/\b(?:LLC|Inc|Corporation)\b/i);
  });
});