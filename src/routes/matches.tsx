import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { useAuth } from "~/auth-context";
import { useRequireSubscription, SubscriptionBanner } from "~/subscription-guard";

interface MatchProfile {
  id: number;
  display_name: string | null;
  age: number | null;
  gender: string | null;
  bio: string | null;
  photo_path: string | null;
}

export const Route = createFileRoute("/matches")({
  component: MatchesPage,
});

function MatchesPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { isSubscribed, checking } = useRequireSubscription();
  const [matches, setMatches] = useState<MatchProfile[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [animState, setAnimState] = useState<"idle" | "like" | "pass" | null>(null);
  const [matchCelebration, setMatchCelebration] = useState<{
    match_id: number;
    other_user: { id: number; display_name: string | null; photo_path: string | null } | null;
  } | null>(null);

  // Redirect if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/login" });
      return;
    }
    if (user && user.grade === null) {
      navigate({ to: "/profile" });
      return;
    }
  }, [loading, user]);

  if (loading || checking) {
    return (
      <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4">
        <div className="flex flex-col items-center gap-4">
          <div className="loader-pulse" />
          <p className="text-sm text-gray-400">Loading your matches...</p>
        </div>
      </div>
    );
  }

  if (!user || !isSubscribed) return null;

  const fetchMatches = useCallback(async () => {
    setFetching(true);
    setError("");
    try {
      const res = await fetch("/api/matches");
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "NO_GRADE") {
          navigate({ to: "/profile" });
          return;
        }
        setError(data.error || "Failed to load matches");
        return;
      }
      setMatches(data.matches || []);
      setCurrentIdx(0);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    if (user && user.grade !== null) {
      fetchMatches();
    }
  }, [user]);

  const handleLike = async () => {
    const current = matches[currentIdx];
    if (!current) return;

    setAnimState("like");
    try {
      const res = await fetch("/api/matches/like", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ liked_id: current.id }),
      });
      const data = await res.json();

      if (data.matched) {
        setMatchCelebration({
          match_id: data.match_id,
          other_user: data.other_user,
        });
        setTimeout(() => {
          setMatchCelebration(null);
          setAnimState(null);
          if (currentIdx >= matches.length - 1) {
            setMatches([]);
          } else {
            setCurrentIdx((i) => i + 1);
          }
        }, 3000);
        return;
      }
    } catch {
      // Silently fail
    }

    setTimeout(() => {
      setAnimState(null);
      if (currentIdx >= matches.length - 1) {
        setMatches([]);
      } else {
        setCurrentIdx((i) => i + 1);
      }
    }, 400);
  };

  const handlePass = async () => {
    const current = matches[currentIdx];
    if (!current) return;

    setAnimState("pass");
    try {
      await fetch("/api/matches/pass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passed_id: current.id }),
      });
    } catch {
      // Silently fail
    }

    setTimeout(() => {
      setAnimState(null);
      if (currentIdx >= matches.length - 1) {
        setMatches([]);
      } else {
        setCurrentIdx((i) => i + 1);
      }
    }, 400);
  };

  if (loading || fetching) {
    return (
      <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4">
        <div className="flex flex-col items-center gap-4">
          <div className="loader-pulse" />
          <p className="text-sm text-gray-400">Finding your matches...</p>
        </div>
      </div>
    );
  }

  const current = matches[currentIdx];

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <SubscriptionBanner />

      {/* Header */}
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold">Your Matches</h1>
        <p className="mt-2 text-gray-400">
          Swipe right to like, left to pass. All at your level.
        </p>
        {user.grade !== null && (
          <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-3 py-1 text-xs text-rose-400">
            Your grade: <span className="font-bold">{user.grade}</span>/10
          </div>
        )}
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-center text-sm text-red-400">
          {error}
          <button
            onClick={fetchMatches}
            className="mt-2 block w-full text-center text-xs underline"
          >
            Try again
          </button>
        </div>
      )}

      {/* No matches empty state */}
      {!current && !error && (
        <div className="flex flex-col items-center gap-4 card p-12 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-800">
            <svg
              className="h-8 w-8 text-rose-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-semibold">No matches right now</h3>
          <p className="text-sm text-gray-500">
            We're looking for more singles in your grade range. Check back soon!
          </p>
          <button
            onClick={fetchMatches}
            className="btn-secondary"
          >
            Refresh
          </button>
        </div>
      )}

      {/* Card */}
      {current && (
        <div className="relative">
          <div
            key={current.id}
            className={`animate-[cardEnter_0.4s_ease-out] rounded-2xl overflow-hidden transition-all duration-300 ${
              animState === "like"
                ? "translate-x-full opacity-0 rotate-6"
                : animState === "pass"
                  ? "-translate-x-full opacity-0 -rotate-6"
                  : ""
            }`}
            style={{
              animation: animState === null ? "cardEnter 0.4s ease-out" : undefined,
              boxShadow:
                "0 0 20px 1px rgba(244,63,94,0.1), 0 0 40px 5px rgba(244,63,94,0.04)",
            }}
          >
            {/* Photo */}
            <div className="relative aspect-[3/4] w-full bg-gray-800">
              {current.photo_path ? (
                <img
                  src={current.photo_path}
                  alt={current.display_name || "Match"}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-gray-600">
                  <svg
                    className="h-20 w-20"
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

              {/* Photo vignette overlay */}
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(3,7,18,0.6)_100%)]" />

              {/* Dramatic LIKE overlay */}
              {animState === "like" && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-green-500/20 backdrop-blur-[2px]">
                  <span className="animate-[likeStamp_0.3s_ease-out] rounded-xl border-[3px] border-green-400 px-8 py-3 text-4xl font-black text-green-400 -rotate-12 shadow-2xl">
                    LIKE
                  </span>
                </div>
              )}

              {/* Dramatic PASS overlay */}
              {animState === "pass" && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-red-500/20 backdrop-blur-[2px]">
                  <span className="animate-[passStamp_0.3s_ease-out] rounded-xl border-[3px] border-red-400 px-8 py-3 text-4xl font-black text-red-400 rotate-12 shadow-2xl">
                    PASS
                  </span>
                </div>
              )}

              {/* Player info gradient overlay */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-gray-950/95 via-gray-950/40 to-transparent p-6 pt-20">
                <h2 className="text-2xl font-bold">
                  {current.display_name || "Anonymous"}, {current.age || "?"}
                </h2>
                {current.gender && (
                  <p className="mt-1 text-sm capitalize text-gray-400">
                    {current.gender}
                  </p>
                )}
              </div>
            </div>

            {/* Bio */}
            <div className="border-t border-white/5 bg-gray-900 p-5">
              <p className="text-sm leading-relaxed text-gray-300">
                {current.bio || "No bio yet."}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-6 flex items-center justify-center gap-6">
            <button
              onClick={handlePass}
              disabled={animState !== null}
              className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-red-500/40 bg-gray-900 text-red-400 transition-all duration-200 hover:scale-110 hover:border-red-400 hover:bg-red-500/10 hover:shadow-lg hover:shadow-red-500/10 disabled:opacity-50"
              aria-label="Pass"
            >
              <svg
                className="h-8 w-8"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>

            <button
              onClick={handleLike}
              disabled={animState !== null}
              className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-rose-500/40 bg-gray-900 text-rose-400 transition-all duration-200 hover:scale-110 hover:border-rose-400 hover:bg-rose-500/10 hover:shadow-lg hover:shadow-rose-500/20 disabled:opacity-50"
              aria-label="Like"
            >
              <svg
                className="h-10 w-10"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
                />
              </svg>
            </button>

            <button
              onClick={handlePass}
              disabled={animState !== null}
              className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-red-500/40 bg-gray-900 text-red-400 transition-all duration-200 hover:scale-110 hover:border-red-400 hover:bg-red-500/10 hover:shadow-lg hover:shadow-red-500/10 disabled:opacity-50"
              aria-label="Pass"
            >
              <svg
                className="h-8 w-8"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Counter */}
          <p className="mt-4 text-center text-xs text-gray-600">
            {currentIdx + 1} of {matches.length} in your range
          </p>
        </div>
      )}

      {/* Match Celebration Modal */}
      {matchCelebration && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm animate-[bounceIn_0.5s_ease-out] rounded-2xl bg-gray-900 p-8 text-center shadow-2xl animate-[celebratePulse_2s_ease-in-out_infinite]">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-rose-500/20 to-amber-500/20">
              <svg
                className="h-10 w-10 text-rose-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
                />
              </svg>
            </div>
            <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-rose-400 to-amber-400">
              It's a Match!
            </h2>
            <p className="mt-2 text-gray-400">
              You and{" "}
              <span className="font-semibold text-white">
                {matchCelebration.other_user?.display_name || "someone"}
              </span>{" "}
              liked each other!
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <Link
                to="/chat/$matchId"
                params={{ matchId: String(matchCelebration.match_id) }}
                className="btn-primary justify-center"
                onClick={() => setMatchCelebration(null)}
              >
                Send a message
              </Link>
              <button
                onClick={() => setMatchCelebration(null)}
                className="btn-secondary justify-center"
              >
                Keep swiping
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
