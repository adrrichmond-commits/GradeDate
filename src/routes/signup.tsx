import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useAuth } from "~/auth-context";

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
  const days = useMemo(() => {
    const month = parseInt(dobMonth);
    const year = parseInt(dobYear);
    if (!month || !year) return 31;
    const daysInMonth = new Date(year, month, 0).getDate();
    const d: number[] = [];
    for (let i = 1; i <= daysInMonth; i++) d.push(i);
    return d;
  }, [dobMonth, dobYear]);

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

  // Redirect if already logged in
  if (user) {
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
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, date_of_birth: dateOfBirth, referral_code: referralCode || undefined }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Signup failed");
        return;
      }

      await refetch();
      navigate({ to: "/profile/setup" });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold">Create Your Account</h1>
          <p className="mt-2 text-gray-400">
            Join GradeDate and find your looks-match.
          </p>
        </div>

        <div className="rounded-2xl border border-white/5 bg-gray-900/60 p-8 backdrop-blur-sm">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
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
                Referral Code{" "}
                <span className="text-xs font-normal text-gray-500">(optional)</span>
              </label>
              <input
                id="referralCode"
                type="text"
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-gray-100 placeholder-gray-500 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                placeholder="e.g. GRD8XK2P"
              />
              {referralCode && (
                <p className="mt-1 text-xs text-amber-400">
                  🎁 You and your friend will both get 1 month free when you subscribe!
                </p>
              )}
              {search.ref && !referralCode && (
                <p className="mt-1 text-xs text-green-400">
                  🎉 You've been invited! Enter the code above to claim your free month.
                </p>
              )}
            </div>

            <div>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(e) => {
                    setAgreedToTerms(e.target.checked);
                    if (e.target.checked) setTermsError(false);
                  }}
                  className={`mt-0.5 h-4 w-4 rounded border bg-gray-800 accent-rose-500 focus:ring-rose-500 ${
                    termsError ? "border-red-500" : "border-gray-600"
                  }`}
                />
                <span className={`text-sm ${termsError ? "text-red-400" : "text-gray-400"}`}>
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
          <p className="mt-4 text-center text-xs text-gray-600">
            By signing up, you agree to our AI-powered facial grading, which is experimental and subjective.
          </p>
        </div>
      </div>
    </div>
  );
}
