import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "~/auth-context";
import { useRequireSubscription, SubscriptionBanner } from "~/subscription-guard";

export const Route = createFileRoute("/profile/")({
  component: ProfilePage,
});

function ProfilePage() {
  const navigate = useNavigate();
  const { user, loading, refetch } = useAuth();
  const [grading, setGrading] = useState(false);
  const [gradeError, setGradeError] = useState("");
  const { isSubscribed, checking } = useRequireSubscription();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/login" });
    }
  }, [loading, user]);

  // Redirect to setup if no profile
  useEffect(() => {
    if (user && !user.display_name) {
      navigate({ to: "/profile/setup" });
    }
  }, [user]);

  const handleGetGraded = async () => {
    setGrading(true);
    setGradeError("");
    try {
      const res = await fetch("/api/grade", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setGradeError(data.error || "Grading failed");
        return;
      }
      await refetch();
    } catch {
      setGradeError("Network error. Please try again.");
    } finally {
      setGrading(false);
    }
  };

  if (loading || checking) {
    return (
      <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 animate-bounce rounded-full bg-rose-500 [animation-delay:0ms]" />
          <div className="h-3 w-3 animate-bounce rounded-full bg-rose-500 [animation-delay:150ms]" />
          <div className="h-3 w-3 animate-bounce rounded-full bg-rose-500 [animation-delay:300ms]" />
        </div>
      </div>
    );
  }

  if (!user || !isSubscribed) return null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold">Your Profile</h1>
        <p className="mt-2 text-gray-400">
          This is how other GradeDate members see you.
        </p>
      </div>

      <div className="rounded-2xl border border-white/5 bg-gray-900/60 p-8 backdrop-blur-sm">
        {/* Photo */}
        <div className="mb-8 flex justify-center">
          {user.photo_path ? (
            <img
              src={user.photo_path}
              alt={user.display_name || "Profile"}
              className="h-40 w-40 rounded-full object-cover ring-4 ring-rose-500/20"
            />
          ) : (
            <div className="flex h-40 w-40 items-center justify-center rounded-full bg-gray-800 text-gray-500">
              <svg
                className="h-16 w-16"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
                />
              </svg>
            </div>
          )}
        </div>

        {/* Grade Display */}
        {user.grade !== null && (
          <div className="mb-8 text-center">
            <div className="inline-flex flex-col items-center rounded-xl border border-rose-500/20 bg-rose-500/5 px-8 py-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-rose-400">
                Your Grade
              </span>
              <span className="text-5xl font-black text-rose-400">
                {user.grade}
              </span>
              <span className="text-xs text-gray-500">/ 10</span>
            </div>
            <div className="mt-3">
              <Link
                to="/matches"
                className="inline-flex items-center gap-2 rounded-full bg-rose-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-500"
              >
                Browse Matches →
              </Link>
            </div>
          </div>
        )}

        {/* Get Graded CTA — user has photo but no grade */}
        {user.grade === null && user.photo_path && (
          <div className="mb-8 text-center">
            {grading ? (
              <div className="flex flex-col items-center gap-4 py-4">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 animate-bounce rounded-full bg-rose-500 [animation-delay:0ms]" />
                  <div className="h-3 w-3 animate-bounce rounded-full bg-rose-500 [animation-delay:150ms]" />
                  <div className="h-3 w-3 animate-bounce rounded-full bg-rose-500 [animation-delay:300ms]" />
                </div>
                <p className="text-gray-400">Analyzing your photo...</p>
                <div className="h-1 w-48 overflow-hidden rounded-full bg-gray-800">
                  <div className="h-full animate-[progress_2s_ease-in-out_forwards] rounded-full bg-gradient-to-r from-rose-500 to-purple-500" />
                </div>
              </div>
            ) : (
              <div className="inline-flex flex-col items-center rounded-xl border border-amber-500/30 bg-amber-500/5 px-8 py-6">
                <svg
                  className="mb-3 h-8 w-8 text-amber-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
                  />
                </svg>
                <span className="text-sm font-semibold text-amber-400">
                  Ready to get graded?
                </span>
                <p className="mt-1 text-xs text-gray-500">
                  Your photo will be analyzed and assigned a 1–10 score
                </p>
                <button
                  onClick={handleGetGraded}
                  className="mt-4 inline-flex items-center gap-2 rounded-full bg-amber-500 px-6 py-2.5 text-sm font-semibold text-gray-950 transition hover:bg-amber-400"
                >
                  Get Graded
                </button>
                {gradeError && (
                  <p className="mt-2 text-xs text-red-400">{gradeError}</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* No photo yet — need to upload first */}
        {user.grade === null && !user.photo_path && (
          <div className="mb-8 text-center">
            <div className="inline-flex flex-col items-center rounded-xl border border-gray-700 bg-gray-800/30 px-8 py-6">
              <svg
                className="mb-3 h-8 w-8 text-gray-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"
                />
              </svg>
              <span className="text-sm font-medium text-gray-400">
                Upload a photo to get graded
              </span>
              <Link
                to="/profile/setup"
                className="mt-4 rounded-full border border-gray-600 px-6 py-2 text-sm text-gray-300 transition hover:border-gray-400 hover:text-white"
              >
                Edit Profile
              </Link>
            </div>
          </div>
        )}

        {/* Details */}
        <div className="space-y-4">
          <div className="rounded-lg border border-white/5 bg-gray-800/40 p-4">
            <span className="text-xs font-medium uppercase tracking-wider text-gray-500">
              Display Name
            </span>
            <p className="mt-1 text-lg font-semibold text-gray-100">
              {user.display_name || "Not set"}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border border-white/5 bg-gray-800/40 p-4">
              <span className="text-xs font-medium uppercase tracking-wider text-gray-500">
                Age
              </span>
              <p className="mt-1 text-lg font-semibold text-gray-100">
                {user.age || "—"}
              </p>
            </div>

            <div className="rounded-lg border border-white/5 bg-gray-800/40 p-4">
              <span className="text-xs font-medium uppercase tracking-wider text-gray-500">
                Gender
              </span>
              <p className="mt-1 text-lg font-semibold capitalize text-gray-100">
                {user.gender || "—"}
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-white/5 bg-gray-800/40 p-4">
            <span className="text-xs font-medium uppercase tracking-wider text-gray-500">
              Bio
            </span>
            <p className="mt-1 text-gray-300">
              {user.bio || "No bio yet."}
            </p>
          </div>

          <div className="rounded-lg border border-white/5 bg-gray-800/40 p-4">
            <span className="text-xs font-medium uppercase tracking-wider text-gray-500">
              Email
            </span>
            <p className="mt-1 text-gray-400">{user.email}</p>
          </div>

          <div className="rounded-lg border border-white/5 bg-gray-800/40 p-4">
            <span className="text-xs font-medium uppercase tracking-wider text-gray-500">
              Subscription
            </span>
            <p className="mt-1 capitalize text-gray-400">
              {user.subscription_status}
            </p>
          </div>
        </div>

        <div className="mt-8 text-center">
          <Link
            to="/profile/setup"
            className="rounded-full border border-gray-600 px-6 py-2.5 text-sm font-medium text-gray-300 transition hover:border-gray-400 hover:text-white"
          >
            Edit Profile
          </Link>
        </div>
      </div>
    </div>
  );
}
