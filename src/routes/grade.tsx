import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "~/auth-context";
import { getCsrfToken } from "~/csrf-client";

export const Route = createFileRoute("/grade")({
  component: GradePage,
});

type UIState =
  | "idle"
  | "uploading"
  | "analyzing"
  | "done"
  | "nsfw"
  | "error";

interface PhotoEntry {
  file: File;
  previewUrl: string;
  photoPath?: string; // set after upload
}

interface PhotoGradeResult {
  photo_path: string;
  grade: number;
  feedback: string;
  is_best: boolean;
}

function GradePage() {
  const { user, loading: authLoading } = useAuth();

  const [state, setState] = useState<UIState>("idle");
  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  const [errorMessage, setErrorMessage] = useState<string>("");

  // Results (single-photo / anonymous)
  const [grade, setGrade] = useState<number | null>(null);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [gradingMethod, setGradingMethod] = useState<string | null>(null);

  // Multi-photo results
  const [photoGrades, setPhotoGrades] = useState<PhotoGradeResult[] | null>(null);
  const [percentile, setPercentile] = useState<number | null>(null);
  const [percentileCity, setPercentileCity] = useState<string | null>(null);
  const [percentileLabel, setPercentileLabel] = useState<string | null>(null);

  // Free tier regrade info
  const [freeRegradeInfo, setFreeRegradeInfo] = useState<string>("");

  const csrfFetched = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isSubscribed = user?.subscription_status === "active";
  const isAuthenticated = !!user;
  const maxPhotos = isAuthenticated ? 5 : 1;

  // For anonymous users, fetch a CSRF token on mount so upload/grade POSTs work
  useEffect(() => {
    if (!authLoading && !user && !csrfFetched.current) {
      csrfFetched.current = true;
      fetch("/api/csrf").catch(() => {
        // Silently fail
      });
    }
  }, [authLoading, user]);

  // Derive free regrade info
  useEffect(() => {
    if (!user) {
      setFreeRegradeInfo("");
      return;
    }
    if (isSubscribed) {
      setFreeRegradeInfo("Unlimited regrades");
      return;
    }
    // Free tier
    const lastFree = user.last_free_regrade_at
      ? new Date(user.last_free_regrade_at)
      : null;
    const now = new Date();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    if (!lastFree) {
      setFreeRegradeInfo("Free regrades: 1 per week. Available now");
    } else if (now.getTime() - lastFree.getTime() < sevenDaysMs) {
      const daysLeft = Math.ceil(
        7 - (now.getTime() - lastFree.getTime()) / (24 * 60 * 60 * 1000)
      );
      setFreeRegradeInfo(
        `Free regrade available in ${daysLeft} day${daysLeft > 1 ? "s" : ""}. Upgrade for unlimited.`
      );
    } else {
      setFreeRegradeInfo("Free regrades: 1 per week. Available now");
    }
  }, [user, isSubscribed]);

  const handleAddPhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    for (const file of files) {
      if (!allowedTypes.includes(file.type)) {
        setErrorMessage("Only JPEG, PNG, and WebP images are allowed.");
        setState("error");
        return;
      }
    }

    const remaining = maxPhotos - photos.length;
    const toAdd = files.slice(0, remaining);

    const newPhotos: PhotoEntry[] = toAdd.map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
    }));

    setPhotos((prev) => [...prev, ...newPhotos]);
    setErrorMessage("");

    // Reset the file input so the same file can be added again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleRemovePhoto = (index: number) => {
    setPhotos((prev) => {
      const next = [...prev];
      URL.revokeObjectURL(next[index].previewUrl);
      next.splice(index, 1);
      return next;
    });
  };

  const handleGradePhotos = async () => {
    if (photos.length === 0) return;

    setState("uploading");
    setErrorMessage("");

    try {
      // Step 1: Upload all photos
      const uploadPaths: string[] = [];

      for (const photo of photos) {
        if (photo.photoPath) {
          uploadPaths.push(photo.photoPath);
          continue;
        }

        const formData = new FormData();
        formData.append("photo", photo.file);

        const uploadRes = await fetch("/api/upload", {
          method: "POST",
          headers: { "X-CSRF-Token": getCsrfToken() || "" },
          body: formData,
        });

        if (!uploadRes.ok) {
          const errData = await uploadRes.json().catch(() => null);
          setErrorMessage(errData?.error || "Upload failed. Please try again.");
          setState("error");
          return;
        }

        const uploadData = await uploadRes.json();
        // Handle multi-photo response: photo_paths array or single photo_path
        const paths: string[] =
          uploadData.photo_paths ||
          (uploadData.photos?.map((p: { photo_path: string }) => p.photo_path)) ||
          (uploadData.photo_path ? [uploadData.photo_path] : []);

        if (paths.length > 0) {
          uploadPaths.push(...paths);
          // Update local state with paths
          setPhotos((prev) =>
            prev.map((p) =>
              p.file === photo.file ? { ...p, photoPath: paths[0] } : p
            )
          );
        }
      }

      // If anonymous: keep single-photo flow using old /api/grade
      if (!isAuthenticated) {
        setState("analyzing");

        const gradeBody: Record<string, string> = {};
        if (uploadPaths.length > 0) {
          gradeBody.photo_path = uploadPaths[0];
        }

        const gradeRes = await fetch("/api/grade", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": getCsrfToken() || "",
          },
          body: JSON.stringify(gradeBody),
        });

        const gradeData = await gradeRes.json();

        if (!gradeRes.ok) {
          if (gradeData.code === "NSFW") {
            setState("nsfw");
            return;
          }
          setErrorMessage(gradeData.error || "Grading failed. Please try again.");
          setState("error");
          return;
        }

        setGrade(gradeData.grade);
        setAnalysis(gradeData.analysis || null);
        setGradingMethod(gradeData.grading_method || null);
        setState("done");
        return;
      }

      // Authenticated: use multi-photo grading
      setState("analyzing");

      const gradeRes = await fetch("/api/grade-photos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": getCsrfToken() || "",
        },
        body: JSON.stringify({ photo_paths: uploadPaths }),
      });

      const gradeData = await gradeRes.json();

      if (!gradeRes.ok) {
        if (gradeData.code === "NSFW") {
          setState("nsfw");
          return;
        }
        if (gradeData.code === "FREE_REGRADE_USED") {
          setErrorMessage(gradeData.error || "Free regrade already used this week.");
          setState("error");
          return;
        }
        setErrorMessage(gradeData.error || "Grading failed. Please try again.");
        setState("error");
        return;
      }

      // Build photo grades with preview URLs
      const gradesWithPreviews: PhotoGradeResult[] = (gradeData.grades || []).map(
        (g: PhotoGradeResult, i: number) => ({
          ...g,
          // Match preview URL by index
          previewUrl: photos[i]?.previewUrl || "",
        })
      );

      setPhotoGrades(gradesWithPreviews);
      setPercentile(gradeData.percentile ?? null);
      setPercentileCity(gradeData.percentile_city ?? null);
      setPercentileLabel(gradeData.percentile_label ?? null);

      // Set single grade for share card (use best photo grade)
      const bestGrade = gradesWithPreviews.find((g) => g.is_best)?.grade;
      setGrade(bestGrade ?? gradesWithPreviews[0]?.grade ?? null);

      setState("done");
    } catch {
      setErrorMessage("Network error. Please check your connection and try again.");
      setState("error");
    }
  };

  const reset = () => {
    setState("idle");
    setGrade(null);
    setAnalysis(null);
    setErrorMessage("");
    setGradingMethod(null);
    setPhotoGrades(null);
    setPercentile(null);
    setPercentileCity(null);
    setPercentileLabel(null);
    // Revoke preview URLs
    photos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    setPhotos([]);
  };

  const getMessage = (g: number) => {
    if (g >= 9)
      return "Absolute smoke show. You're in the top tier — expect premium matches.";
    if (g >= 7)
      return "Looking sharp! You'll have plenty of great matches at your level.";
    if (g >= 5)
      return "Solid score. Lots of compatible singles in your range.";
    if (g >= 3)
      return "Everyone's got their type — own it and find your people.";
    return "Confidence is everything. Real connections happen here.";
  };

  const handleShare = async () => {
    const shareText = percentileLabel && grade !== null
      ? `I'm in the ${percentileLabel.toLowerCase()}. Find your percentile at gradedate.app`
      : `I just got my profile graded. Find your best photos at gradedate.app`;

    const shareData = {
      title: "My GradeDate Profile",
      text: shareText,
      url: "https://gradedate.app/grade",
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        // Fall through to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(shareText);
      const el = document.getElementById("share-feedback");
      if (el) {
        el.classList.remove("opacity-0");
        setTimeout(() => el.classList.add("opacity-0"), 2000);
      }
    } catch {
      const el = document.getElementById("share-fallback-text");
      if (el) {
        el.classList.remove("hidden");
        if (el) el.textContent = shareText;
      }
    }
  };

  const handleCopyGrade = async () => {
    const text = percentileLabel && grade !== null
      ? `I'm in the ${percentileLabel.toLowerCase()}. Find your percentile at gradedate.app`
      : `I just got my profile graded. Find your best photos at gradedate.app`;

    try {
      await navigator.clipboard.writeText(text);
      const el = document.getElementById("copy-feedback");
      if (el) {
        el.classList.remove("opacity-0");
        setTimeout(() => el.classList.add("opacity-0"), 2000);
      }
    } catch {
      // do nothing
    }
  };

  // ── Render ───────────────────────────────────────────────────────
  return (
    <>
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
        <div className="w-full max-w-lg">
          {/* Header */}
          <div className="mb-8 text-center">
            <span className="mb-4 inline-block rounded-full bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-400">
              FREE PREVIEW
            </span>
            <h1 className="text-3xl font-bold sm:text-4xl">
              Build a Better Dating Profile
            </h1>
            <p className="mt-2 text-gray-400">
              {isAuthenticated
                ? "Upload up to 5 photos. Our AI grades each one and gives you actionable tips."
                : "Upload a photo and get an AI-powered grade on a 1–10 scale."}
            </p>
          </div>

          <div className="rounded-2xl border border-rose-500/20 bg-gray-900/60 p-8 backdrop-blur-sm">
            {/* ── Idle: Upload prompt ─────────────────────────── */}
            {state === "idle" && (
              <div className="flex flex-col items-center gap-4">
                {/* Photo thumbnails */}
                {photos.length > 0 && (
                  <div className="flex flex-wrap justify-center gap-3">
                    {photos.map((photo, i) => (
                      <div key={i} className="relative">
                        <img
                          src={photo.previewUrl}
                          alt={`Photo ${i + 1}`}
                          className="h-20 w-20 rounded-lg object-cover ring-2 ring-rose-500/20"
                        />
                        <button
                          onClick={() => handleRemovePhoto(i)}
                          className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-gray-800 text-xs text-gray-400 ring-1 ring-gray-600 transition hover:bg-red-600 hover:text-white hover:ring-red-600"
                          aria-label={`Remove photo ${i + 1}`}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Upload area */}
                {photos.length < maxPhotos && (
                  <label className="flex w-full cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed border-gray-600 p-6 transition hover:border-rose-500/50">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-500/10">
                      <svg
                        className="h-7 w-7 text-rose-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M12 4.5v15m7.5-7.5h-15"
                        />
                      </svg>
                    </div>
                    <span className="text-sm font-medium text-gray-300">
                      {photos.length === 0
                        ? isAuthenticated
                          ? "Drop up to 5 photos here"
                          : "Drop your selfie here"
                        : "Add another photo"}
                    </span>
                    <span className="text-xs text-gray-500">
                      {isAuthenticated
                        ? `${photos.length}/${maxPhotos} photos — JPEG, PNG, WebP`
                        : "JPEG, PNG, WebP accepted"}
                    </span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple={isAuthenticated}
                      onChange={handleAddPhotos}
                      className="hidden"
                    />
                  </label>
                )}

                {/* Grade button */}
                {photos.length > 0 && (
                  <button
                    onClick={handleGradePhotos}
                    className="w-full rounded-full bg-rose-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-rose-600/25 transition hover:bg-rose-500 hover:shadow-rose-500/30"
                  >
                    {isAuthenticated
                      ? `Grade My ${photos.length === 1 ? "Photo" : `${photos.length} Photos`}`
                      : "Grade My Photo"}
                  </button>
                )}

                {/* Free tier regrade info */}
                {freeRegradeInfo && (
                  <p className="text-xs text-gray-500">{freeRegradeInfo}</p>
                )}
              </div>
            )}

            {/* ── Uploading ───────────────────────────────────── */}
            {state === "uploading" && (
              <div className="flex flex-col items-center gap-6 py-8">
                {photos.length > 0 && (
                  <div className="flex flex-wrap justify-center gap-2">
                    {photos.map((photo, i) => (
                      <img
                        key={i}
                        src={photo.previewUrl}
                        alt={`Photo ${i + 1}`}
                        className="h-16 w-16 rounded-lg object-cover ring-2 ring-rose-500/15"
                      />
                    ))}
                  </div>
                )}
                <div className="loader-pulse" />
                <p className="text-gray-400">Uploading your photos...</p>
              </div>
            )}

            {/* ── Analyzing ───────────────────────────────────── */}
            {state === "analyzing" && (
              <div className="flex flex-col items-center gap-6 py-8">
                {photos.length > 0 && (
                  <div className="flex flex-wrap justify-center gap-2">
                    {photos.map((photo, i) => (
                      <img
                        key={i}
                        src={photo.previewUrl}
                        alt={`Photo ${i + 1}`}
                        className="h-16 w-16 rounded-lg object-cover ring-2 ring-rose-500/15"
                      />
                    ))}
                  </div>
                )}
                <div className="loader-pulse" />
                <p className="text-gray-400">
                  AI is analyzing your photos...
                </p>
                <div className="h-1 w-48 overflow-hidden rounded-full bg-gray-800">
                  <div className="h-full animate-[progress_2s_ease-in-out_forwards] rounded-full bg-gradient-to-r from-rose-500 to-purple-500" />
                </div>
              </div>
            )}

            {/* ── NSFW ────────────────────────────────────────── */}
            {state === "nsfw" && (
              <div className="flex flex-col items-center gap-6 py-4">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-500/10">
                  <svg
                    className="h-10 w-10 text-red-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                    />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-red-400">
                  Content Not Allowed
                </h3>
                <p className="text-center text-gray-300">
                  This photo appears to contain inappropriate content. Please
                  upload a different photo that follows our content rules.
                </p>
                <button
                  onClick={reset}
                  className="rounded-full bg-rose-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-500"
                >
                  Try a Different Photo
                </button>
              </div>
            )}

            {/* ── Error ───────────────────────────────────────── */}
            {state === "error" && (
              <div className="flex flex-col items-center gap-6 py-4">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-amber-500/10">
                  <svg
                    className="h-10 w-10 text-amber-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                    />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-amber-400">Error</h3>
                <p className="text-center text-gray-300">
                  {errorMessage || "Something went wrong. Please try again."}
                </p>
                <button
                  onClick={reset}
                  className="rounded-full bg-rose-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-500"
                >
                  Try Again
                </button>
              </div>
            )}

            {/* ── Done: Multi-Photo Results ───────────────────── */}
            {state === "done" && photoGrades && photoGrades.length > 0 && (
              <div className="flex flex-col gap-6 py-4">
                {/* Per-photo grade cards */}
                <div className="space-y-3">
                  {photoGrades.map((pg, i) => (
                    <div
                      key={i}
                      className={`relative flex items-center gap-3 rounded-xl border p-3 ${
                        pg.is_best
                          ? "border-amber-500/40 bg-amber-500/5"
                          : "border-gray-700/50 bg-gray-800/30"
                      }`}
                    >
                      {/* Photo thumbnail */}
                      <img
                        src={photos[i]?.previewUrl || pg.photo_path}
                        alt={`Photo ${i + 1}`}
                        className="h-14 w-14 shrink-0 rounded-lg object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold text-white">
                            {pg.grade}
                            <span className="text-xs text-gray-500">/10</span>
                          </span>
                          {pg.is_best && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
                              <svg
                                className="h-3 w-3"
                                fill="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                              </svg>
                              Best Photo
                            </span>
                          )}
                        </div>
                        {pg.feedback && (
                          <p className="text-xs text-gray-400 truncate">
                            {pg.feedback}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Percentile card */}
                <div className="rounded-xl border border-rose-500/20 bg-gradient-to-r from-rose-500/5 to-purple-500/5 p-4 text-center">
                  <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Your Percentile
                  </div>
                  {percentileLabel ? (
                    <>
                      <div className="mt-1 text-2xl font-extrabold text-white">
                        {percentileLabel}
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        Based on other users in your city
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="mt-1 text-lg font-semibold text-gray-400">
                        Not enough data yet
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        More users in your city needed for percentile ranking
                      </p>
                    </>
                  )}
                </div>

                {/* Shareable card */}
                <ShareCard
                  grade={grade}
                  percentileLabel={percentileLabel}
                  handleShare={handleShare}
                  handleCopyGrade={handleCopyGrade}
                />

                {/* CTA section */}
                {isSubscribed && (
                  <div className="flex gap-3">
                    <button
                      onClick={reset}
                      className="rounded-full border border-gray-600 px-6 py-2.5 text-sm font-medium text-gray-300 transition hover:border-gray-400 hover:text-white"
                    >
                      Try Again
                    </button>
                    <Link
                      to="/matches"
                      className="rounded-full bg-rose-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-500"
                    >
                      Browse Your Matches
                    </Link>
                  </div>
                )}

                {!user && (
                  <div className="w-full rounded-xl border border-rose-500/30 bg-gradient-to-b from-gray-900 to-gray-950 p-6 text-center shadow-lg shadow-rose-500/5">
                    <div className="mb-3 text-sm font-medium text-gray-200">
                      Like your grade?
                    </div>
                    <p className="mb-1 text-2xl font-extrabold">
                      <span className="text-rose-400">$5.99</span>
                      <span className="text-lg text-gray-500">/month</span>
                    </p>
                    <p className="mb-5 text-sm text-gray-400">
                      Sign up to find matches at your level, chat, and connect
                      with real people.
                    </p>
                    <Link
                      to="/signup"
                      className="inline-block w-full rounded-full bg-rose-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-rose-600/25 transition hover:bg-rose-500 hover:shadow-rose-500/30"
                    >
                      Sign Up to Find Your Matches
                    </Link>
                    <button
                      onClick={reset}
                      className="mt-3 text-xs text-gray-500 underline transition hover:text-gray-300"
                    >
                      Try Different Photos
                    </button>
                  </div>
                )}

                {user && !isSubscribed && (
                  <div className="w-full rounded-xl border border-rose-500/30 bg-gradient-to-b from-gray-900 to-gray-950 p-6 text-center shadow-lg shadow-rose-500/5">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-rose-400">
                      See Who's in Your League
                    </div>
                    <p className="mb-1 text-2xl font-extrabold">
                      <span className="text-rose-400">$5.99</span>
                      <span className="text-lg text-gray-500">/month</span>
                    </p>
                    <p className="mb-5 text-sm text-gray-400">
                      Subscribe to browse matches at your grade level, chat,
                      and connect with real people.
                    </p>
                    <Link
                      to="/subscribe"
                      className="inline-block w-full rounded-full bg-rose-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-rose-600/25 transition hover:bg-rose-500 hover:shadow-rose-500/30"
                    >
                      Subscribe to See Your Matches — $5.99/mo
                    </Link>
                    <button
                      onClick={reset}
                      className="mt-3 text-xs text-gray-500 underline transition hover:text-gray-300"
                    >
                      Try Different Photos
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── Done: Single-Photo / Anonymous Results ──────── */}
            {state === "done" && !photoGrades && grade !== null && (
              <div className="flex flex-col items-center gap-6 py-4">
                {photos[0]?.previewUrl && (
                  <img
                    src={photos[0].previewUrl}
                    alt="Preview"
                    className="h-32 w-32 rounded-full object-cover ring-3 ring-rose-500/15 ring-offset-2 ring-offset-gray-950"
                  />
                )}
                <div className="text-center">
                  <div className="text-xs font-semibold uppercase tracking-widest text-gray-500">
                    Your Match Level
                  </div>
                  <div className="animate-[scaleIn_0.6s_ease-out] text-7xl font-black tracking-tighter text-rose-400">
                    {grade}
                    <span className="text-3xl text-gray-500">/10</span>
                  </div>
                  {gradingMethod === "mock" && (
                    <div className="mt-1 text-xs text-gray-600">(mock)</div>
                  )}
                  {analysis && (
                    <p className="mt-2 text-sm italic text-gray-400">
                      "{analysis}"
                    </p>
                  )}
                  <p className="mt-2 text-xs text-gray-500">
                    This is used only to find looks-compatible matches.
                    It is never shared with other users.
                  </p>
                  <p className="mt-1 text-xs text-gray-600">
                    AI-generated estimate for entertainment purposes.
                    Results may vary.
                  </p>
                </div>

                <div className="flex w-full max-w-xs gap-0.5">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div
                      key={i}
                      className={`h-2 flex-1 rounded-full ${
                        i < grade
                          ? "bg-gradient-to-r from-rose-500 to-purple-500"
                          : "bg-gray-800"
                      }`}
                    />
                  ))}
                </div>

                <p className="text-center text-gray-300">
                  {getMessage(grade)}
                </p>

                <ShareCard
                  grade={grade}
                  percentileLabel={null}
                  handleShare={handleShare}
                  handleCopyGrade={handleCopyGrade}
                />

                {isSubscribed && (
                  <div className="flex gap-3">
                    <button
                      onClick={reset}
                      className="rounded-full border border-gray-600 px-6 py-2.5 text-sm font-medium text-gray-300 transition hover:border-gray-400 hover:text-white"
                    >
                      Try Again
                    </button>
                    <Link
                      to="/matches"
                      className="rounded-full bg-rose-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-500"
                    >
                      Browse Your Matches
                    </Link>
                  </div>
                )}

                {!user && (
                  <div className="w-full rounded-xl border border-rose-500/30 bg-gradient-to-b from-gray-900 to-gray-950 p-6 text-center shadow-lg shadow-rose-500/5">
                    <div className="mb-3 text-sm font-medium text-gray-200">
                      Like your grade?
                    </div>
                    <p className="mb-1 text-2xl font-extrabold">
                      <span className="text-rose-400">$5.99</span>
                      <span className="text-lg text-gray-500">/month</span>
                    </p>
                    <p className="mb-5 text-sm text-gray-400">
                      Sign up to find matches at your level, chat, and connect
                      with real people.
                    </p>
                    <Link
                      to="/signup"
                      className="inline-block w-full rounded-full bg-rose-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-rose-600/25 transition hover:bg-rose-500 hover:shadow-rose-500/30"
                    >
                      Sign Up to Find Your Matches
                    </Link>
                    <button
                      onClick={reset}
                      className="mt-3 text-xs text-gray-500 underline transition hover:text-gray-300"
                    >
                      Try a Different Photo
                    </button>
                  </div>
                )}

                {user && !isSubscribed && (
                  <div className="w-full rounded-xl border border-rose-500/30 bg-gradient-to-b from-gray-900 to-gray-950 p-6 text-center shadow-lg shadow-rose-500/5">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-rose-400">
                      See Who's in Your League
                    </div>
                    <p className="mb-1 text-2xl font-extrabold">
                      <span className="text-rose-400">$5.99</span>
                      <span className="text-lg text-gray-500">/month</span>
                    </p>
                    <p className="mb-5 text-sm text-gray-400">
                      Subscribe to browse matches at your grade level, chat,
                      and connect with real people.
                    </p>
                    <Link
                      to="/subscribe"
                      className="inline-block w-full rounded-full bg-rose-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-rose-600/25 transition hover:bg-rose-500 hover:shadow-rose-500/30"
                    >
                      Subscribe to See Your Matches — $5.99/mo
                    </Link>
                    <button
                      onClick={reset}
                      className="mt-3 text-xs text-gray-500 underline transition hover:text-gray-300"
                    >
                      Try a Different Photo
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer note */}
          <p className="mt-6 text-center text-xs text-gray-600">
            Photos are screened for inappropriate content before grading.
            Your match level is kept private — only you see it.
          </p>
        </div>
      </main>
    </>
  );
}

// ── Shareable Grade Card Component ──────────────────────────────────
function ShareCard({
  grade,
  percentileLabel,
  handleShare,
  handleCopyGrade,
}: {
  grade: number | null;
  percentileLabel: string | null;
  handleShare: () => void;
  handleCopyGrade: () => void;
}) {
  const displayGrade = grade ?? "?";
  const shareText =
    percentileLabel && grade !== null
      ? `I'm in the ${percentileLabel.toLowerCase()}. Find your percentile at gradedate.app`
      : `I just got my profile graded. Find your best photos at gradedate.app`;

  return (
    <div className="w-full">
      <div className="mb-2 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">
        Share Your Grade
      </div>

      <div
        id="grade-card"
        className="relative overflow-hidden rounded-2xl border border-rose-500/30 bg-gray-950 p-6 text-center shadow-2xl"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, rgba(244,63,94,0.12) 0%, rgba(3,7,18,1) 60%)",
        }}
      >
        {/* Logo area */}
        <div className="mb-4 flex items-center justify-center gap-2">
          <svg
            width="24"
            height="24"
            viewBox="0 0 48 48"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <defs>
              <linearGradient
                id="gclg2"
                x1="0"
                y1="0"
                x2="48"
                y2="48"
                gradientUnits="userSpaceOnUse"
              >
                <stop offset="0%" stopColor="#f43f5e" />
                <stop offset="100%" stopColor="#f59e0b" />
              </linearGradient>
            </defs>
            <circle
              cx="24"
              cy="24"
              r="23"
              fill="none"
              stroke="url(#gclg2)"
              strokeWidth="1.5"
              opacity="0.3"
            />
            <path
              d="M24 35C24 35 8 27 8 17.5c0-4.14 3.36-7.5 7.5-7.5 2.48 0 4.66 1.2 6 3.07L24 15l2.5-1.93c1.34-1.87 3.52-3.07 6-3.07 4.14 0 7.5 3.36 7.5 7.5C40 27 24 35 24 35z"
              fill="url(#gclg2)"
              opacity="0.9"
            />
            <text
              x="24"
              y="26.5"
              textAnchor="middle"
              fill="#030712"
              fontFamily="Inter, sans-serif"
              fontSize="10"
              fontWeight="900"
            >
              10
            </text>
          </svg>
          <span className="text-lg font-bold tracking-tight">
            <span className="text-rose-500">Grade</span>
            <span className="text-white">Date</span>
          </span>
        </div>

        {/* Grade / percentile display */}
        {percentileLabel && grade !== null ? (
          <div className="my-3">
            <div className="text-xs font-semibold uppercase tracking-widest text-gray-500">
              My Percentile
            </div>
            <div className="text-4xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-rose-400 to-rose-600">
              {percentileLabel}
            </div>
          </div>
        ) : (
          <div className="my-3">
            <div className="text-xs font-semibold uppercase tracking-widest text-gray-500">
              My Match Level
            </div>
            <div className="text-8xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-rose-400 to-rose-600">
              {displayGrade}
              <span className="text-3xl text-gray-600">/10</span>
            </div>
          </div>
        )}

        {/* Tagline */}
        <p className="mt-2 text-xs text-gray-500">
          Find your best photos at gradedate.app
        </p>

        {/* Decorative corner glows */}
        <div className="pointer-events-none absolute -top-8 -right-8 h-24 w-24 rounded-full bg-rose-500/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-8 -left-8 h-24 w-24 rounded-full bg-purple-500/10 blur-2xl" />
      </div>

      {/* Action buttons */}
      <div className="mt-3 flex gap-2">
        <button
          onClick={handleShare}
          className="flex flex-1 items-center justify-center gap-2 rounded-full border border-gray-600 bg-gray-800/60 px-4 py-2.5 text-sm font-medium text-gray-200 transition hover:border-gray-400 hover:text-white hover:bg-gray-700/60"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z"
            />
          </svg>
          Share
        </button>
        <button
          onClick={handleCopyGrade}
          className="flex flex-1 items-center justify-center gap-2 rounded-full border border-gray-600 bg-gray-800/60 px-4 py-2.5 text-sm font-medium text-gray-200 transition hover:border-gray-400 hover:text-white hover:bg-gray-700/60"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"
            />
          </svg>
          Copy
        </button>
      </div>

      {/* Feedback indicators */}
      <p
        id="share-feedback"
        className="mt-2 text-center text-xs text-green-400 opacity-0 transition-opacity duration-200"
      >
        Copied to clipboard!
      </p>
      <p
        id="copy-feedback"
        className="mt-2 text-center text-xs text-green-400 opacity-0 transition-opacity duration-200"
      >
        Copied!
      </p>
      <p
        id="share-fallback-text"
        className="mt-2 hidden text-center text-xs text-gray-400"
      >
        {shareText}
      </p>
    </div>
  );
}
