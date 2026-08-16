import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { apiFetch, safeApiError } from "~/client-api";
import { useState, useMemo } from "react";
import { useAuth } from "~/auth-context";
import { isTrialActive } from "~/canonical-entitlements";
import { getCsrfToken } from "~/csrf-client";
import { getSignupDays } from "~/signup-date";
import { AgeVerificationCard, skipVerificationVisible } from "~/age-verification";

export const Route = createFileRoute("/signup")({
  component: Signup,
  validateSearch: (search: Record<string, string>) => ({
    ref: search.ref || "",
  }),
});

function Signup() {
  const navigate = useNavigate();
  const { user, refetch } = useAuth();
  const search = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [dobMonth, setDobMonth] = useState("");
  const [dobDay, setDobDay] = useState("");
  const [dobYear, setDobYear] = useState("");
  const [referralCode, setReferralCode] = useState(search.ref || "");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [termsError, setTermsError] = useState(false);
  const [showChoice, setShowChoice] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  // Generate year options (from 18 years ago back to ~100 years ago)
  const currentYear = new Date().getFullYear();
  const years = useMemo(() => {
    const y: number[] = [];
    for (let i = currentYear - 18; i >= currentYear - 100; i--) y.push(i);
    return y;
  }, [currentYear]);

  const months = useMemo(() => {
    return [
      { value: "01", label: "January" },
      { value: "02", label: "February" },
      { value: "03", label: "March" },
      { value: "04", label: "April" },
      { value: "05", label: "May" },
      { value: "06", label: "June" },
      { value: "07", label: "July" },
      { value: "08", label: "August" },
      { value: "09", label: "September" },
      { value: "10", label: "October" },
      { value: "11", label: "November" },
      { value: "12", label: "December" },
    ];
  }, []);

  // Compute days based on selected month/year
  const days = useMemo(
    () => getSignupDays(dobMonth, dobYear),
    [dobMonth, dobYear],
  );

  // Validate age
  const getAge = (): number | null => {
    if (!dobMonth || !dobDay || !dobYear) return null;
    const month = parseInt(dobMonth);
    const day = parseInt(dobDay);
    const year = parseInt(dobYear);
    if (isNaN(month) || isNaN(day) || isNaN(year)) return null;
    const dob = new Date(year, month - 1, day);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
    return age;
  };

  // Redirect if already logged in (skip if showing choice screen)
  if (user && !showChoice) {
    navigate({ to: "/profile" });
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validate DOB
    const age = getAge();
    if (age === null) {
      setError("Please enter your full date of birth");
      return;
    }
    if (age < 18) {
      setError("You must be at least 18 years old to use GradeDate");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (!agreedToTerms) {
      setTermsError(true);
      setError("You must agree to the Terms of Service and Privacy Policy");
      return;
    }

    setSubmitting(true);
    try {
      // Format date_of_birth as YYYY-MM-DD
      const dateOfBirth = `${dobYear}-${dobMonth}-${String(dobDay).padStart(2, "0")}`;
      const data = await apiFetch<any>("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          date_of_birth: dateOfBirth,
          referral_code: referralCode || undefined,
        }),
      });

      await refetch();
      setShowChoice(true);
    } catch (error) {
      setError(safeApiError(error, "Please try again."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleContinueFree = () => {
    navigate({ to: "/profile/setup" });
  };

  const handleBecomeFounder = async () => {
    setCheckoutLoading(true);
    setError("");
    try {
      const csrfToken = getCsrfToken();
      const data = await apiFetch<any>("/api/subscription/create-checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
        },
        body: JSON.stringify({ plan: "monthly" }),
      });

      if (data.url) {
        window.location.href = data.url;
      } else {
        setError("Could not start checkout. Please try again.");
      }
    } catch (error) {
      setError(safeApiError(error, "Please try again."));
    } finally {
      setCheckoutLoading(false);
    }
  };

  // ── Choice screen after successful signup ───────────────────
  if (showChoice) {
    return (
      <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4">
        <div className="w-full max-w-lg">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-rose-500/10 ring-1 ring-rose-500/20">
              <span className="text-3xl">🎉</span>
            </div>
            <h1 className="text-3xl font-bold">You're in!</h1>
            <p className="mt-2 text-gray-400">
              Your account is ready. Choose how you want to start.
            </p>
          </div>

          {user && (
            <div className="mb-6">
              <AgeVerificationCard user={user} onComplete={refetch} />
              {skipVerificationVisible(user) && (
                <button
                  type="button"
                  onClick={handleContinueFree}
                  className="mt-3 w-full text-center text-sm text-gray-500 underline-offset-4 hover:text-gray-300 hover:underline"
                >
                  Skip for now
                </button>
              )}
            </div>
          )}

          {/* Active 14-day trial banner — the invite reward is invisible to
              new users, so surface it here with the exact end date. */}
          {user && isTrialActive(user.trial_ends_at) && (
            <div
              role="status"
              className="mb-6 rounded-xl border border-green-500/30 bg-green-500/10 p-4 text-center"
            >
              <p className="font-semibold text-green-400">
                Your 14-day Premium trial is active 🎉
              </p>
              <p className="mt-1 text-sm text-green-400/80">
                Enjoy unlimited likes, premium regrades, and see-who-liked-you
                until {new Date(user.trial_ends_at!).toLocaleDateString()}.
              </p>
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-center text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Continue Free */}
            <button
              onClick={handleContinueFree}
              className="rounded-2xl border border-gray-600 bg-gray-900/60 p-6 text-left backdrop-blur-sm transition-all duration-200 hover:border-gray-400 hover:bg-gray-800/80"
            >
              <p className="text-lg font-semibold text-gray-200">
                Continue Free
              </p>
              <p className="mt-2 text-sm leading-relaxed text-gray-400">
                Set up your profile, get graded, and start matching at no cost.
              </p>
              <p className="mt-4 text-xs text-gray-500">
                You can always upgrade later
              </p>
            </button>

            {/* Become Founder — relabeled while a 14-day trial is active so
                the card sells the trial, not a second purchase */}
            <button
              onClick={handleBecomeFounder}
              disabled={checkoutLoading}
              className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/20 via-amber-600/10 to-amber-500/5 p-6 text-left shadow-lg shadow-amber-500/10 backdrop-blur-sm transition-all duration-200 hover:border-amber-400/50 hover:shadow-amber-500/20 hover:scale-[1.02] disabled:opacity-70 disabled:cursor-wait"
            >
              {/* Shimmer overlay */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-[shimmer_2s_ease-in-out_infinite]" />
              <div className="relative">
                <div className="mb-2 inline-block rounded-full border border-amber-400/40 bg-amber-500/15 px-3 py-0.5 text-xs font-semibold text-amber-400">
                  ⭐ FOUNDERS CLUB · ONLY 1,000 SPOTS
                </div>
                <p className="mt-2 text-lg font-bold text-amber-300">
                  {isTrialActive(user?.trial_ends_at) ? (
                    "Start your 14-day Premium trial"
                  ) : (
                    <>
                      Become a Founder{" "}
                      <span className="text-base font-semibold text-amber-400">
                        $5.99
                      </span>
                    </>
                  )}
                </p>
                <ul className="mt-3 space-y-1.5 text-sm text-amber-200/80">
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 shrink-0 text-amber-400">🔒</span>
                    Lifetime price lock at $5.99/mo
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 shrink-0 text-amber-400">🏅</span>
                    Numbered founding member badge
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 shrink-0 text-amber-400">🚀</span>
                    Premium likes, regrades & boosts
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 shrink-0 text-amber-400">👀</span>
                    See who liked you first
                  </li>
                </ul>
                {checkoutLoading && (
                  <p className="mt-4 text-center text-sm text-amber-400/70">
                    Redirecting to secure checkout...
                  </p>
                )}
              </div>
            </button>
          </div>

          <p className="mt-6 text-center text-xs text-gray-400">
            Only 1,000 Founder spots will ever exist. Once they're claimed, the
            Founders Club closes forever. Cancel anytime — but your price lock
            is yours forever as long as you stay subscribed.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold">Create Your Account</h1>
          <p className="mt-2 text-gray-400">
            Join GradeDate and start your confidence journey.
          </p>
        </div>

        <div className="rounded-2xl border border-white/5 bg-gray-900/60 p-8 backdrop-blur-sm">
          <form
            onSubmit={handleSubmit}
            className="space-y-5"
            aria-describedby={error ? "signup-error" : undefined}
          >
            {error && (
              <div
                id="signup-error"
                role="alert"
                aria-live="assertive"
                className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400"
              >
                {error}
              </div>
            )}

            <fieldset>
              <legend className="mb-1.5 block text-sm font-medium text-gray-300">
                Date of Birth
              </legend>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label htmlFor="dobMonth" className="sr-only">
                    Month
                  </label>
                  <select
                    id="dobMonth"
                    required
                    value={dobMonth}
                    onChange={(e) => {
                      setDobMonth(e.target.value);
                      setDobDay("");
                    }}
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-gray-100 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                  >
                    <option value="">Month</option>
                    {months.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="dobDay" className="sr-only">
                    Day
                  </label>
                  <select
                    id="dobDay"
                    required
                    value={dobDay}
                    onChange={(e) => setDobDay(e.target.value)}
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-gray-100 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                  >
                    <option value="">Day</option>
                    {days.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="dobYear" className="sr-only">
                    Year
                  </label>
                  <select
                    id="dobYear"
                    required
                    value={dobYear}
                    onChange={(e) => {
                      setDobYear(e.target.value);
                      setDobDay("");
                    }}
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-gray-100 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                  >
                    <option value="">Year</option>
                    {years.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </fieldset>

            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-sm font-medium text-gray-300"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-gray-100 placeholder-gray-500 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-sm font-medium text-gray-300"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-gray-100 placeholder-gray-500 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                placeholder="At least 6 characters"
              />
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="mb-1.5 block text-sm font-medium text-gray-300"
              >
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-gray-100 placeholder-gray-500 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                placeholder="Re-enter your password"
              />
            </div>

            <div>
              <label
                htmlFor="referralCode"
                className="mb-1.5 block text-sm font-medium text-gray-300"
              >
                Invite / Referral Code{" "}
                <span className="text-xs font-normal text-gray-500">
                  (optional)
                </span>
              </label>
              <input
                id="referralCode"
                type="text"
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-gray-100 placeholder-gray-500 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                placeholder="Enter your invite or referral code"
              />
              {referralCode && (
                <p className="mt-1 text-xs text-amber-400">
                  Invite codes start a 14-day Premium trial. Referral codes
                  give you and a friend a free month of Premium when you
                  subscribe.
                </p>
              )}
              {search.ref && !referralCode && (
                <p className="mt-1 text-xs text-green-400">
                  🎉 You've been invited! Enter the code above to claim your
                  invite or referral reward.
                </p>
              )}
              <p className="mt-2 text-xs text-gray-500">
                No invite code yet? The Austin beta is invite-only —{" "}
                <a
                  href="/#waitlist"
                  className="text-rose-400 underline hover:text-rose-300"
                >
                  join the waitlist
                </a>{" "}
                to be notified when it opens.
              </p>
            </div>

            <div>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  id="terms"
                  type="checkbox"
                  checked={agreedToTerms}
                  aria-invalid={termsError}
                  aria-describedby={termsError ? "signup-error" : undefined}
                  onChange={(e) => {
                    setAgreedToTerms(e.target.checked);
                    if (e.target.checked) setTermsError(false);
                  }}
                  className={`mt-0.5 h-4 w-4 rounded border bg-gray-800 accent-rose-500 focus:ring-rose-500 ${
                    termsError ? "border-red-500" : "border-gray-600"
                  }`}
                />
                <span
                  className={`text-sm ${termsError ? "text-red-400" : "text-gray-400"}`}
                >
                  I am 18+ and agree to the{" "}
                  <a
                    href="/terms"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-rose-400 underline hover:text-rose-300"
                  >
                    Terms of Service
                  </a>{" "}
                  and{" "}
                  <a
                    href="/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-rose-400 underline hover:text-rose-300"
                  >
                    Privacy Policy
                  </a>
                </span>
              </label>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-full bg-rose-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:opacity-50"
            >
              {submitting ? "Creating account..." : "Create Account"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-400">
            Already have an account?{" "}
            <Link
              to="/login"
              className="font-medium text-rose-400 hover:text-rose-300"
            >
              Log in
            </Link>
          </p>
          <p className="mt-4 text-center text-xs text-gray-400">
            By signing up, you agree to our AI-powered facial grading, which is
            experimental and subjective.
          </p>
        </div>
      </div>
    </div>
  );
}
