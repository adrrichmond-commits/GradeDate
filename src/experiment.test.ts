/**
 * Conversion-experiment framework tests:
 *  - deterministic variant assignment (same anonymous key → same variant);
 *  - anonymous variant persistence across page loads (cookie round-trip);
 *  - event payload validation & redaction (only coarse allowlisted fields can
 *    reach the log);
 *  - honest-copy guard for the grade-result CTA treatment (no dark patterns).
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  EXPERIMENTS,
  assignVariant,
  getExperiment,
  parseExperimentEvent,
} from "./experiment";
import {
  EXPERIMENT_ANON_ID_COOKIE,
  getAnonymousExperimentId,
  getExperimentVariant,
  type CookieStore,
} from "./experiment-client";
import { EVENTS, EVENT_NAME_RE, logInfo, setLogLevel, setLogSink } from "./observability";

/** In-memory CookieStore used to simulate the browser cookie jar. */
class MemCookieStore implements CookieStore {
  private values = new Map<string, string>();
  get(name: string): string | null {
    return this.values.get(name) ?? null;
  }
  set(name: string, value: string, _maxAgeSeconds: number): void {
    this.values.set(name, value);
  }
  seed(name: string, value: string): void {
    this.values.set(name, value);
  }
}

describe("experiment registry", () => {
  test("grade-cta experiment is defined with control/treatment and the CTA conversions", () => {
    const def = getExperiment("grade-cta");
    expect(def).toBeDefined();
    expect(def!.variants).toEqual(["control", "treatment"]);
    expect(def!.weights).toHaveLength(def!.variants.length);
    expect(def!.routes).toContain("grade.result");
    expect(def!.conversions).toEqual(["signup_click", "subscribe_click"]);
  });

  test("weights are balanced and sum to 1", () => {
    const def = EXPERIMENTS.GRADE_CTA;
    const total = def.weights.reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 6);
  });
});

describe("deterministic variant assignment", () => {
  test("same key always maps to the same variant", () => {
    for (const key of ["abc", "user-42", "", "a-very-long-key-".repeat(10)]) {
      expect(assignVariant("grade-cta", key)).toBe(assignVariant("grade-cta", key));
    }
  });

  test("different keys spread across both variants (~50/50)", () => {
    let control = 0;
    for (let i = 0; i < 2000; i++) {
      const v = assignVariant("grade-cta", `key-${i}`);
      if (v === "control") control++;
      else expect(v).toBe("treatment");
    }
    const ratio = control / 2000;
    expect(ratio).toBeGreaterThan(0.4);
    expect(ratio).toBeLessThan(0.6);
  });

  test("every returned variant is a declared variant", () => {
    for (let i = 0; i < 500; i++) {
      expect(["control", "treatment"]).toContain(assignVariant("grade-cta", `k${i}`));
    }
  });

  test("throws on unknown experiment", () => {
    expect(() => assignVariant("no-such-experiment", "key")).toThrow();
  });
});

describe("anonymous variant persistence", () => {
  test("creates and persists an anonymous id (UUID v4) in the store", () => {
    const store = new MemCookieStore();
    const id1 = getAnonymousExperimentId(store);
    const id2 = getAnonymousExperimentId(store);
    expect(id1).toBeTruthy();
    expect(id2).toBe(id1); // no churn across calls
    expect(store.get(EXPERIMENT_ANON_ID_COOKIE)).toBe(id1);
    expect(id1).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  test("variant is stable across page loads for the same anonymous id", () => {
    const firstLoad = new MemCookieStore();
    const v1 = getExperimentVariant("grade-cta", firstLoad);
    expect(v1).not.toBeNull();
    // Simulate a later page load: the browser still has the persisted cookie.
    const nextLoad = new MemCookieStore();
    nextLoad.seed(EXPERIMENT_ANON_ID_COOKIE, firstLoad.get(EXPERIMENT_ANON_ID_COOKIE)!);
    expect(getExperimentVariant("grade-cta", nextLoad)).toBe(v1);
  });

  test("repeated calls within a session return the same variant", () => {
    const store = new MemCookieStore();
    expect(getExperimentVariant("grade-cta", store)).toBe(
      getExperimentVariant("grade-cta", store),
    );
  });

  test("fresh visitors are split across both variants", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const v = getExperimentVariant("grade-cta", new MemCookieStore());
      expect(v).not.toBeNull();
      seen.add(v!);
    }
    expect(seen.has("control")).toBe(true);
    expect(seen.has("treatment")).toBe(true);
  });

  test("unknown experiment yields null, not a variant", () => {
    expect(getExperimentVariant("no-such-experiment", new MemCookieStore())).toBeNull();
  });
});

describe("event payload validation & redaction", () => {
  test("accepts a valid exposure and returns only coarse fields", () => {
    const out = parseExperimentEvent({
      experiment: "grade-cta",
      variant: "control",
      event: "exposure",
      route: "grade.result",
    });
    expect(out).toEqual({
      experiment: "grade-cta",
      variant: "control",
      event: "exposure",
      route: "grade.result",
    });
  });

  test("accepts a valid conversion with an allowlisted conversion name", () => {
    const out = parseExperimentEvent({
      experiment: "grade-cta",
      variant: "treatment",
      event: "conversion",
      route: "grade.result",
      conversion: "subscribe_click",
    });
    expect(out).toEqual({
      experiment: "grade-cta",
      variant: "treatment",
      event: "conversion",
      route: "grade.result",
      conversion: "subscribe_click",
    });
  });

  test("rejects unknown experiments, variants, events, routes, and conversions", () => {
    const base = {
      experiment: "grade-cta",
      variant: "control",
      event: "exposure",
      route: "grade.result",
    };
    expect(parseExperimentEvent({ ...base, experiment: "other" })).toBeNull();
    expect(parseExperimentEvent({ ...base, variant: "bogus" })).toBeNull();
    expect(parseExperimentEvent({ ...base, event: "click" })).toBeNull();
    expect(parseExperimentEvent({ ...base, route: "homepage" })).toBeNull();
    expect(
      parseExperimentEvent({
        ...base,
        event: "conversion",
        conversion: "bogus_conversion",
      }),
    ).toBeNull();
  });

  test("exposure rejects a conversion field; conversion requires one", () => {
    expect(
      parseExperimentEvent({
        experiment: "grade-cta",
        variant: "control",
        event: "exposure",
        route: "grade.result",
        conversion: "signup_click",
      }),
    ).toBeNull();
    expect(
      parseExperimentEvent({
        experiment: "grade-cta",
        variant: "control",
        event: "conversion",
        route: "grade.result",
      }),
    ).toBeNull();
  });

  test("strips extra caller-supplied fields (payload redaction)", () => {
    const out = parseExperimentEvent({
      experiment: "grade-cta",
      variant: "control",
      event: "exposure",
      route: "grade.result",
      email: "someone@example.com",
      user_id: 7,
      session: "abc123",
      photo_path: "/uploads/anon_secret.jpg",
    });
    expect(out).toEqual({
      experiment: "grade-cta",
      variant: "control",
      event: "exposure",
      route: "grade.result",
    });
    const serialized = JSON.stringify(out);
    expect(serialized).not.toContain("someone@example.com");
    expect(serialized).not.toContain("user_id");
    expect(serialized).not.toContain("abc123");
    expect(serialized).not.toContain("photo_path");
  });

  test("rejects non-object payloads", () => {
    expect(parseExperimentEvent(null)).toBeNull();
    expect(parseExperimentEvent(undefined)).toBeNull();
    expect(parseExperimentEvent("grade-cta")).toBeNull();
    expect(parseExperimentEvent([])).toBeNull();
    expect(parseExperimentEvent(42)).toBeNull();
  });

  test("observability layer redacts sensitive values if they ever reach the log", () => {
    // Belt-and-braces: even if a future caller attached a sensitive field to
    // an experiment event, the structured logger must redact it.
    const lines: string[] = [];
    setLogSink((line) => lines.push(line));
    setLogLevel("debug");
    try {
      logInfo(EVENTS.EXPERIMENT_EXPOSURE, {
        experiment: "grade-cta",
        variant: "control",
        route: "grade.result",
        email: "x@y.com",
      });
    } finally {
      setLogSink(null);
      setLogLevel("info");
    }
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("experiment.exposure");
    expect(lines[0]).toContain("grade-cta");
    expect(lines[0]).not.toContain("x@y.com");
    expect(lines[0]).toContain("[REDACTED]");
  });
});

describe("grade-result CTA surfaces (honest copy, no dark patterns)", () => {
  const gradeSrc = readFileSync(path.join(import.meta.dir, "routes/grade.tsx"), "utf8");

  test("treatment copy keeps the canonical $5.99/mo price and honest claims", () => {
    expect(gradeSrc).toContain('"Sign up free"');
    expect(gradeSrc).toContain('"Create Your Free Profile"');
    expect(gradeSrc).toContain('"Subscribe — $5.99/mo"');
    // The price must still appear in the CTA region of grade.tsx.
    const ctaRegion = gradeSrc.slice(gradeSrc.indexOf("CTA section"));
    expect(ctaRegion.match(/\$5\.99/g)).not.toBeNull();
  });

  test("no manufactured urgency or dark-pattern scarcity in the CTA region", () => {
    const ctaRegion = gradeSrc.slice(gradeSrc.indexOf("CTA section"));
    expect(ctaRegion).not.toMatch(
      /urgent|act now|hurry|only \d+ (spot|left|remaining)|final notice|last chance/i,
    );
  });

  test("control copy is preserved for both visitor states", () => {
    expect(gradeSrc).toContain('"Like your grade?"');
    expect(gradeSrc).toContain('"See Your Best Matches"');
    expect(gradeSrc).toContain('"Sign Up to Find Your Matches"');
    expect(gradeSrc).toContain('"Subscribe to See Your Matches — $5.99/mo"');
  });
});

describe("server endpoint surface", () => {
  test("api-handler registers the CSRF-protected experiment-event route", () => {
    const src = readFileSync(path.join(import.meta.dir, "api-handler.ts"), "utf8");
    expect(src).toContain('pathname === "/api/experiment-event"');
    expect(src).toContain("handleExperimentEvent");
    expect(src).toContain("parseExperimentEvent");
    expect(src).toContain("EVENTS.EXPERIMENT_EXPOSURE");
    expect(src).toContain("EVENTS.EXPERIMENT_CONVERSION");
  });

  test("experiment event names are registered in the stable EVENTS registry", () => {
    expect(EVENTS.EXPERIMENT_EXPOSURE).toBe("experiment.exposure");
    expect(EVENTS.EXPERIMENT_CONVERSION).toBe("experiment.conversion");
    expect(EVENTS.EXPERIMENT_EXPOSURE).toMatch(EVENT_NAME_RE);
    expect(EVENTS.EXPERIMENT_CONVERSION).toMatch(EVENT_NAME_RE);
  });
});
