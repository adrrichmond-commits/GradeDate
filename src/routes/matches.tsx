import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { useAuth } from "~/auth-context";
import { useRequireSubscription, SubscriptionBanner } from "~/subscription-guard";
import { getCsrfToken } from "~/csrf-client";

interface MatchPhoto {
  id: number;
  photo_path: string;
  sort_order: number;
  is_primary: boolean;
}

interface MatchProfile {
  id: number;
  display_name: string | null;
  age: number | null;
  gender: string | null;
  bio: string | null;
  photo_path: string | null;
  photos?: MatchPhoto[];
  distance_km?: number;
  communication_style?: string | null;
  lifestyle?: string | null;
  dating_goals?: string | null;
  is_outside_range?: boolean;
  compatibility_score?: number;
}

const REPORT_REASONS = [
  { value: "inappropriate_photo", label: "Inappropriate Photo" },
  { value: "harassment", label: "Harassment" },
  { value: "underage", label: "Underage User" },
  { value: "fake_profile", label: "Fake Profile" },
  { value: "other", label: "Other" },
];

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

  // Photo carousel state
  const [photoIndex, setPhotoIndex] = useState(0);

  // Daily likes state
  const [likesRemaining, setLikesRemaining] = useState<number | "unlimited" | null>(null);
  const [likePacks, setLikePacks] = useState<number>(0);
  const [showLikesLimitOverlay, setShowLikesLimitOverlay] = useState(false);

  // Report state
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reporting, setReporting] = useState(false);
  const [reportDone, setReportDone] = useState(false);

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

  if (!user) return null;

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
      setPhotoIndex(0);
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

  const fetchLikesRemaining = useCallback(async () => {
    try {
      const res = await fetch("/api/likes/remaining");
      const data = await res.json();
      setLikesRemaining(data.remaining);
      setLikePacks(data.like_packs || 0);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (user) {
      fetchLikesRemaining();
    }
  }, [user]);

  const handleLike = async () => {
    const current = matches[currentIdx];
    if (!current) return;

    setAnimState("like");
    try {
      const res = await fetch("/api/matches/like", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": getCsrfToken() || "",
        },
        body: JSON.stringify({ liked_id: current.id }),
      });
      const data = await res.json();

      if (!res.ok && data.code === "DAILY_LIMIT") {
        setAnimState(null);
        setShowLikesLimitOverlay(true);
        setLikesRemaining(0);
        return;
      }

      // Refresh likes remaining
      fetchLikesRemaining();

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
            setPhotoIndex(0);
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
        setPhotoIndex(0);
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
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": getCsrfToken() || "",
        },
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
        setPhotoIndex(0);
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

      {/* Likes remaining badge */}
      {likesRemaining !== null && (
        <div className="flex justify-center mb-4">
          {likesRemaining === "unlimited" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-xs font-medium text-rose-400 border border-rose-500/20">
              Unlimited likes ❤️
            </span>
          ) : likesRemaining === 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-400 border border-amber-500/20">
              0 likes remaining —{" "}
              {likePacks > 0 ? (
                <span>{likePacks} extra like{likePacks !== 1 ? "s" : ""} available</span>
              ) : (
                <a href="/subscribe" className="underline hover:text-amber-300">Subscribe for unlimited</a>
              )}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-800 px-3 py-1 text-xs font-medium text-gray-400 border border-gray-700">
              {likesRemaining} like{likesRemaining !== 1 ? "s" : ""} remaining today
            </span>
          )}
        </div>
      )}

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

      {/* No location prompt */}
      {!current && !error && !user.latitude && !user.longitude && (
        <div className="flex flex-col items-center gap-4 card p-12 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-800">
            <svg
              className="h-8 w-8 text-amber-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-semibold">Set your location to see nearby matches</h3>
          <p className="text-sm text-gray-500">
            Add your ZIP code so we can show you singles near you.
          </p>
          <Link to="/profile/setup" className="btn-primary">
            Set Location
          </Link>
        </div>
      )}

      {/* No matches empty state */}
      {!current && !error && (user.latitude || user.longitude) && (
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
            {/* Photo Carousel */}
            <div className="relative aspect-[3/4] w-full bg-gray-800 overflow-hidden">
              {(() => {
                // Sort photos: primary first, then by sort_order
                const photos = current.photos && current.photos.length > 0
                  ? [...current.photos].sort((a, b) => {
                      if (a.is_primary) return -1;
                      if (b.is_primary) return 1;
                      return a.sort_order - b.sort_order;
                    })
                  : null;

                if (!photos && !current.photo_path) {
                  return (
                    <div className="flex h-full w-full items-center justify-center text-gray-600">
                      <svg className="h-20 w-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                      </svg>
                    </div>
                  );
                }

                const photoUrls = photos
                  ? photos.map((p) => p.photo_path)
                  : current.photo_path
                    ? [current.photo_path]
                    : [];
                const totalPhotos = photoUrls.length;
                const idx = Math.min(photoIndex, totalPhotos - 1);

                return (
                  <>
                    <img
                      src={photoUrls[idx]}
                      alt={current.display_name || "Match"}
                      className="h-full w-full object-cover"
                    />

                    {/* Left/Right navigation arrows */}
                    {totalPhotos > 1 && (
                      <>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPhotoIndex((prev) => (prev > 0 ? prev - 1 : totalPhotos - 1));
                          }}
                          className="absolute left-2 top-1/2 -translate-y-1/2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white/80 transition hover:bg-black/60 hover:text-white"
                          aria-label="Previous photo"
                        >
                          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPhotoIndex((prev) => (prev < totalPhotos - 1 ? prev + 1 : 0));
                          }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white/80 transition hover:bg-black/60 hover:text-white"
                          aria-label="Next photo"
                        >
                          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      </>
                    )}

                    {/* Dots indicator */}
                    {totalPhotos > 1 && (
                      <div className="absolute bottom-20 left-0 right-0 z-10 flex justify-center gap-1.5">
                        {photoUrls.map((_, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPhotoIndex(i);
                            }}
                            className={`h-2 rounded-full transition-all ${
                              i === idx
                                ? "w-5 bg-white"
                                : "w-2 bg-white/50 hover:bg-white/80"
                            }`}
                            aria-label={`Photo ${i + 1}`}
                          />
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}

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
                {current.distance_km !== undefined && (
                  <p className="mt-1 text-xs text-gray-500">
                    📍 {Math.round(current.distance_km * 0.621371)} mi away
                  </p>
                )}
                {current.is_outside_range && (
                  <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-400 border border-amber-500/20">
                    🌟 Outside your range
                  </span>
                )}
                {current.compatibility_score != null && current.compatibility_score > 0 && (
                  <div className="mt-2 flex items-center gap-1.5">
                    <div className="h-1.5 flex-1 rounded-full bg-gray-700 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400"
                        style={{ width: `${current.compatibility_score}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500">{current.compatibility_score}%</span>
                  </div>
                )}
              </div>
            </div>

            {/* Bio */}
            <div className="border-t border-white/5 bg-gray-900 p-5">
              <p className="text-sm leading-relaxed text-gray-300">
                {current.bio || "No bio yet."}
              </p>
              {(current.communication_style || current.lifestyle || current.dating_goals) && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {current.communication_style && (
                    <span className="rounded-full bg-gray-800 px-2.5 py-0.5 text-xs text-gray-400 border border-gray-700">
                      {current.communication_style === "texter" ? "💬 Texting" :
                       current.communication_style === "caller" ? "📞 Phone Calls" :
                       current.communication_style === "either" ? "💬📞 Either" : current.communication_style}
                    </span>
                  )}
                  {current.lifestyle && (
                    <span className="rounded-full bg-gray-800 px-2.5 py-0.5 text-xs text-gray-400 border border-gray-700">
                      {current.lifestyle === "active" ? "🏃 Active" :
                       current.lifestyle === "chill" ? "😌 Chill" :
                       current.lifestyle === "social" ? "🎉 Social" :
                       current.lifestyle === "homebody" ? "🏠 Homebody" : current.lifestyle}
                    </span>
                  )}
                  {current.dating_goals && (
                    <span className="rounded-full bg-gray-800 px-2.5 py-0.5 text-xs text-gray-400 border border-gray-700">
                      {current.dating_goals === "long_term" ? "💍 Long Term" :
                       current.dating_goals === "casual" ? "🍸 Casual" :
                       current.dating_goals === "still_figuring_it_out" ? "🤔 Figuring Out" :
                       current.dating_goals === "new_connections" ? "🔗 New Connections" : current.dating_goals}
                    </span>
                  )}
                </div>
              )}
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

          {/* Report & Counter */}
          <div className="mt-6 space-y-2">
            <p className="text-center text-xs text-gray-600">
              {currentIdx + 1} of {matches.length} in your range
            </p>
            <button
              onClick={() => {
                setReportReason("");
                setReportDone(false);
                setShowReportModal(true);
              }}
              className="mx-auto block text-xs text-gray-500 underline transition hover:text-red-400"
            >
              Report this user
            </button>
          </div>
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

      {/* Daily Likes Limit Overlay */}
      {showLikesLimitOverlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm animate-[bounceIn_0.5s_ease-out] rounded-2xl bg-gray-900 p-8 text-center shadow-2xl">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10">
              <svg className="h-8 w-8 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold">You're out of likes!</h2>
            <p className="mt-2 text-sm text-gray-400">
              You've used all your likes for today.
              {likePacks > 0
                ? ` You have ${likePacks} extra like${likePacks !== 1 ? "s" : ""} available — keep swiping!`
                : " Subscribe for $5.99/mo to get unlimited likes, or buy a like pack from the store."}
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <a href="/subscribe" className="btn-primary justify-center">
                Subscribe for $5.99/mo
              </a>
              <a href="/store" className="btn-secondary justify-center">
                Buy Like Packs
              </a>
              <button
                onClick={() => setShowLikesLimitOverlay(false)}
                className="btn-secondary justify-center"
              >
                Maybe later
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Report Modal */}
      {showReportModal && current && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-2xl bg-gray-900 p-6 shadow-2xl">
            <h3 className="text-lg font-bold">Report {current.display_name || "User"}</h3>
            <p className="mt-1 text-sm text-gray-400">
              {reportDone
                ? "Thank you. Your report has been submitted."
                : "Why are you reporting this user?"}
            </p>

            {!reportDone && (
              <>
                <div className="mt-4 space-y-2">
                  {REPORT_REASONS.map((r) => (
                    <label
                      key={r.value}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm transition ${
                        reportReason === r.value
                          ? "border-rose-500/50 bg-rose-500/10 text-white"
                          : "border-gray-700 text-gray-300 hover:border-gray-600"
                      }`}
                    >
                      <input
                        type="radio"
                        name="reportReason"
                        value={r.value}
                        checked={reportReason === r.value}
                        onChange={(e) => setReportReason(e.target.value)}
                        className="accent-rose-500"
                      />
                      {r.label}
                    </label>
                  ))}
                </div>

                <div className="mt-5 flex gap-3">
                  <button
                    onClick={() => setShowReportModal(false)}
                    className="flex-1 rounded-full border border-gray-600 px-4 py-2 text-sm text-gray-300 transition hover:border-gray-500"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      if (!reportReason || !current) return;
                      setReporting(true);
                      try {
                        await fetch("/api/users/report", {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                            "X-CSRF-Token": getCsrfToken() || "",
                          },
                          body: JSON.stringify({ user_id: current.id, reason: reportReason }),
                        });
                        setReportDone(true);
                      } catch {
                        // ignore
                      } finally {
                        setReporting(false);
                      }
                    }}
                    disabled={!reportReason || reporting}
                    className="flex-1 rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:opacity-50"
                  >
                    {reporting ? "Submitting..." : "Submit Report"}
                  </button>
                </div>
              </>
            )}

            {reportDone && (
              <div className="mt-5">
                <button
                  onClick={() => {
                    setShowReportModal(false);
                    setReportDone(false);
                  }}
                  className="w-full rounded-full border border-gray-600 px-4 py-2 text-sm text-gray-300 transition hover:border-gray-500"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
