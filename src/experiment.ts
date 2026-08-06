/**
 * Minimal, privacy-safe conversion-experiment framework (foundation).
 *
 * This module is deliberately pure and dependency-free so it can run in any
 * context (browser bundle, server, tests). It owns:
 *
 *  - The experiment registry (currently one experiment: the grade-result
 *    signup/Premium CTA surface).
 *  - Deterministic weighted variant assignment from a stable anonymous key.
 *  - The single validation/redaction gate for incoming event payloads
 *    (`parseExperimentEvent`), used by both the browser client and the server.
 *
 * Privacy contract (what this framework never does):
 *  - Variants are assigned deterministically from a stable *anonymous* key (a
 *    random first-party cookie UUID — see experiment-client.ts). The key is
 *    only used as a hashing seed; it is never sent to the server and never
 *    logged.
 *  - Recorded events carry only coarse, allowlisted fields: experiment,
 *    variant, event kind (exposure | conversion), a coarse route, and an
 *    allowlisted conversion name. `parseExperimentEvent` strips any extra
 *    caller-supplied keys, so no email, user id, photo, message, IP, or
 *    free-form text can reach the log through this path.
 */

export type ExperimentEventKind = "exposure" | "conversion";

export interface ExperimentDefinition {
  /** Stable machine name (must match EVENT_NAME_RE-style dotted identifier). */
  name: string;
  /** Ordered variant names; the first is the control. */
  variants: readonly string[];
  /** Weights parallel to `variants`; must sum to 1. */
  weights: readonly number[];
  /** Coarse routes where this experiment's surface can appear. */
  routes: readonly string[];
  /** Conversion names allowed for this experiment (coarse, allowlisted). */
  conversions: readonly string[];
}

/**
 * Experiment registry. Add new experiments here; never reuse a name, variant,
 * route, or conversion across experiments without a deliberate reason.
 */
export const EXPERIMENTS = {
  /**
   * Grade-result CTA surface (anonymous signup + non-subscriber Premium CTA).
   * Treatment tests two honest copy changes against the current copy:
   *  - anonymous block clarifies that signup is free ($5.99/mo is the Premium
   *    upgrade, not a signup fee);
   *  - subscriber block adds a direct price-in-button and cancel-anytime
   *    reassurance. No urgency, scarcity, or misleading claims in either.
   */
  GRADE_CTA: {
    name: "grade-cta",
    variants: ["control", "treatment"],
    weights: [0.5, 0.5],
    routes: ["grade.result"],
    conversions: ["signup_click", "subscribe_click"],
  },
} as const satisfies Record<string, ExperimentDefinition>;

/** Look up a definition by machine name; undefined for unknown experiments. */
export function getExperiment(name: string): ExperimentDefinition | undefined {
  const registry = EXPERIMENTS as Record<string, ExperimentDefinition>;
  for (const key of Object.keys(registry)) {
    const def = registry[key];
    if (def && def.name === name) return def;
  }
  return undefined;
}

/**
 * FNV-1a 32-bit hash — deterministic, fast, and stable across platforms.
 * (Not cryptographic; it only needs to spread keys uniformly into buckets.)
 */
export function hashString(input: string): number {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193); // FNV prime
  }
  return hash >>> 0;
}

/**
 * Deterministic weighted variant assignment: the same (experiment, stableKey)
 * pair always maps to the same variant. `stableKey` is an anonymous key that
 * the caller persists across sessions (see experiment-client.ts).
 */
export function assignVariant(experimentName: string, stableKey: string): string {
  const def = getExperiment(experimentName);
  if (!def) {
    throw new Error(`Unknown experiment: ${experimentName}`);
  }
  if (def.variants.length === 0) {
    throw new Error(`Experiment ${experimentName} has no variants`);
  }
  const total = def.weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) {
    throw new Error(`Experiment ${experimentName} has invalid weights`);
  }
  // Spread the 32-bit hash over the total weight, then walk the buckets.
  const hash = hashString(`${experimentName}|${stableKey}`);
  let bucket = (hash / 0x1_0000_0000) * total;
  for (let i = 0; i < def.variants.length; i++) {
    bucket -= def.weights[i] ?? 0;
    if (bucket < 0) return def.variants[i]!;
  }
  return def.variants[def.variants.length - 1]!;
}

/** Sanitized event payload: only allowlisted coarse fields survive. */
export interface ExperimentEvent {
  experiment: string;
  variant: string;
  event: ExperimentEventKind;
  route: string;
  conversion?: string;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validate and redact an incoming experiment event payload.
 *
 * Returns a sanitized payload containing only the allowlisted coarse fields,
 * or null if any field is unknown/missing/malformed. This is the single gate
 * both the browser client and the server use, so a payload that reaches the
 * log can never contain identifiers or free-form content.
 */
export function parseExperimentEvent(raw: unknown): ExperimentEvent | null {
  if (!isPlainRecord(raw)) return null;
  const { experiment, variant, event, route, conversion } = raw;
  if (
    typeof experiment !== "string" ||
    typeof variant !== "string" ||
    typeof event !== "string" ||
    typeof route !== "string"
  ) {
    return null;
  }
  const def = getExperiment(experiment);
  if (!def) return null;
  if (!def.variants.includes(variant)) return null;
  if (event !== "exposure" && event !== "conversion") return null;
  if (!def.routes.includes(route)) return null;

  if (event === "exposure") {
    // An exposure never carries a conversion; reject stray fields.
    if (conversion !== undefined) return null;
    return { experiment, variant, event, route };
  }

  // Conversion requires an allowlisted conversion name.
  if (typeof conversion !== "string" || !def.conversions.includes(conversion)) {
    return null;
  }
  return { experiment, variant, event, route, conversion };
}
