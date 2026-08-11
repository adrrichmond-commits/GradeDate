import { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { apiFetch, safeApiError } from "~/client-api";
import { getCsrfToken } from "~/csrf-client";
import type { SafeUser } from "~/auth-context";

/** Whether the onboarding "Skip for now" affordance may be shown: never when
 * verification is required for the beta — the user must complete the check. */
export function skipVerificationVisible(user: SafeUser | null): boolean {
  return !!user && !user.verification_required;
}

export function VerifiedBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-sky-400/25 bg-sky-400/10 px-2 py-0.5 text-xs font-semibold text-sky-300 ${className}`}
      title="Identity verified"
    >
      ✓ Verified
    </span>
  );
}

export function AgeVerificationCard({
  user,
  onComplete,
  compact = false,
}: {
  user: SafeUser;
  onComplete?: () => Promise<void> | void;
  compact?: boolean;
}) {
  const [status, setStatus] = useState<
    "idle" | "starting" | "pending" | "verified" | "error"
  >(
    user.verification_status === "verified"
      ? "verified"
      : user.verification_status === "pending"
        ? "pending"
        : "idle",
  );
  const [message, setMessage] = useState("");

  const poll = async () => {
    const delays = [1000, 2000, 4000, 6000, 8000, 9000];
    for (const delay of delays) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      try {
        const me = await apiFetch<{ user: SafeUser | null }>("/api/auth/me");
        if (me.user?.verification_status === "verified") {
          setStatus("verified");
          setMessage("You're verified ✓");
          await onComplete?.();
          return;
        }
      } catch {
        /* keep polling through transient errors */
      }
    }
    setStatus("pending");
    setMessage(
      "Your check may take a moment. We'll update your badge when Stripe finishes reviewing it.",
    );
    await onComplete?.();
  };

  const begin = async () => {
    setStatus("starting");
    setMessage("");
    try {
      const data = await apiFetch<{
        client_secret: string;
        verified?: boolean;
      }>(
        "/api/verification/session",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": getCsrfToken() || "",
          },
        },
      );
      if (data.verified) {
        // Stripe already finished the check (webhook not yet reflected);
        // the server persisted it, so just show the verified state.
        setStatus("verified");
        setMessage("You're verified ✓");
        await onComplete?.();
        return;
      }
      const key = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as
        | string
        | undefined;
      if (!key)
        throw new Error(
          "Verification is not configured yet. Please try again later.",
        );
      const stripe = await loadStripe(key);
      if (!stripe)
        throw new Error("Unable to load the secure verification form.");
      setStatus("pending");
      const result = await stripe.verifyIdentity(data.client_secret);
      if (result.error) {
        setStatus("error");
        setMessage(
          result.error.message ||
            "Verification was not completed. You can try again.",
        );
        return;
      }
      setMessage("Verification submitted. Checking your status…");
      await poll();
    } catch (error) {
      const apiMessage = safeApiError(
        error,
        "We couldn't start verification. Please try again.",
      );
      setStatus("error");
      setMessage(apiMessage);
    }
  };

  if (status === "verified")
    return (
      <div className="rounded-xl border border-sky-400/25 bg-sky-400/10 p-4">
        <div className="flex items-center gap-2">
          <VerifiedBadge />
          <span className="text-sm text-sky-200">You're verified ✓</span>
        </div>
        {user.verification_verified_at && (
          <p className="mt-2 text-xs text-sky-200/60">
            Verified{" "}
            {new Date(user.verification_verified_at).toLocaleDateString()}
          </p>
        )}
      </div>
    );
  return (
    <div
      className={`rounded-xl border border-rose-500/20 bg-gray-900/70 ${compact ? "p-3" : "p-5"}`}
    >
      <h2 className="text-lg font-semibold text-white">
        Verify your age{" "}
        {user.verification_required ? (
          <span className="text-sm font-normal text-rose-300/90">(required)</span>
        ) : (
          <span className="text-sm font-normal text-gray-500">(optional)</span>
        )}
      </h2>
      {!compact && (
        <p className="mt-2 text-sm leading-relaxed text-gray-400">
          Confirm you're 18+ with a government ID check via Stripe Identity. A
          Verified badge will appear on your profile. GradeDate never stores
          your ID or biometric data — Stripe processes and holds it.
        </p>
      )}
      {user.verification_required && (
        <p className="mt-2 text-sm font-medium text-amber-200/90">
          Required for the beta — verify to like, message, and purchase. Your
          session resumes where you left off if you close it.
        </p>
      )}
      {status === "pending" && (
        <p className="mt-3 text-sm text-amber-300">
          {message || "Verification is in progress…"}
        </p>
      )}
      {message && status !== "pending" && (
        <p
          className={`mt-3 text-sm ${status === "error" ? "text-rose-300" : "text-gray-300"}`}
        >
          {message}
        </p>
      )}
      <div className="mt-4 flex items-center gap-4">
        <button
          type="button"
          onClick={begin}
          disabled={status === "starting"}
          className="rounded-full bg-rose-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-400 disabled:cursor-wait disabled:opacity-60"
        >
          {status === "starting"
            ? "Opening secure check…"
            : status === "pending"
              ? "Resume verification"
              : "Verify now"}
        </button>
        {compact &&
          (user.verification_required ? (
            <span className="text-xs font-semibold text-rose-300/90">Required</span>
          ) : (
            <span className="text-xs text-gray-500">Optional</span>
          ))}
      </div>
    </div>
  );
}
