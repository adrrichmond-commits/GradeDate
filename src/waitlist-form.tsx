import { useState } from "react";

// ---------------------------------------------------------------------------
// Shared waitlist join form — one field (email), friendly client validation,
// server-error handling, and a clear success state. This is THE primary CTA
// for anonymous pre-launch visitors (owner CTA-hierarchy decision, D2.2), so
// it is shared by the homepage hero, the homepage closing CTA, and the
// pricing block (anonymous visitors only) — one component, one source of
// truth. The submit button uses btn-primary (filled rose): the canonical
// PRIMARY style of the whole hierarchy system.
// ---------------------------------------------------------------------------
export function WaitlistForm({ idPrefix }: { idPrefix: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      setErrorMsg("Please enter your email address");
      setState("error");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setErrorMsg("Please enter a valid email address");
      setState("error");
      return;
    }

    setState("submitting");
    setErrorMsg("");

    try {
      const res = await fetch("/api/waitlist/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = await res.json();
      if (data.success) {
        setState("success");
        setEmail("");
      } else {
        setErrorMsg(data.error || "Something went wrong. Please try again.");
        setState("error");
      }
    } catch {
      setErrorMsg("Network error. Please check your connection and try again.");
      setState("error");
    }
  };

  if (state === "success") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex flex-col items-center gap-3 rounded-2xl border border-green-500/25 bg-green-500/[0.06] px-6 py-8"
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500/10 ring-1 ring-green-500/30">
          <svg className="h-7 w-7 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-lg font-semibold text-white">You&apos;re on the list!</p>
        <p className="text-sm text-gray-400">
          Check your email for confirmation. We&apos;ll reach out when your city opens.
        </p>
        <button
          onClick={() => setState("idle")}
          className="mt-1 text-xs text-gray-500 underline transition hover:text-gray-300"
        >
          Sign up another email
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="mx-auto w-full max-w-xl">
      <div className="flex flex-col gap-3 sm:flex-row">
        <label htmlFor={`waitlist-email-${idPrefix}`} className="sr-only">
          Email address
        </label>
        <input
          id={`waitlist-email-${idPrefix}`}
          type="email"
          inputMode="email"
          autoComplete="email"
          aria-describedby={state === "error" ? `waitlist-error-${idPrefix}` : undefined}
          aria-invalid={state === "error"}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (state === "error") setState("idle");
          }}
          placeholder="you@email.com"
          className="input-field flex-1 px-5 py-3.5 text-base"
          disabled={state === "submitting"}
        />
        <button
          type="submit"
          disabled={state === "submitting"}
          className="btn-primary justify-center whitespace-nowrap px-8 py-3.5 text-base"
        >
          {state === "submitting" ? (
            <span className="flex items-center gap-2">
              <span className="loader-pulse" />
              Joining...
            </span>
          ) : (
            "Join the Waitlist"
          )}
        </button>
      </div>

      {state === "error" && errorMsg && (
        <p
          id={`waitlist-error-${idPrefix}`}
          role="alert"
          aria-live="assertive"
          className="mt-3 text-sm text-red-400"
        >
          {errorMsg}
        </p>
      )}
    </form>
  );
}
