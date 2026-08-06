import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "~/auth-context";
import { getCsrfToken } from "~/csrf-client";
import { gradeAnonymousPhotos } from "~/anonymous-grading";
import { EXPERIMENTS } from "~/experiment";
import {
  getExperimentVariant,
  recordExperimentEvent,
} from "~/experiment-client";

import { resolveSiteOrigin, resolveSiteUrl } from "~/site-url";
import {
  attachPhotoSources,
  ensurePhotoDataUrls,
  fileToDataUrl,
  resolveEntryPhotoSrc,
  resolveGradePhotoSrc,
  type GradePhotoEntry,
} from "~/grade-photo-source";
export const Route = createFileRoute("/grade")({
  component: GradePage,
});

/**
 * Share CTA with the current site origin appended (never a hardcoded domain).
 * Resolves to the runtime origin in the browser; falls back to the bare verb
 * when no origin is available (e.g. server render).
 */
function gradeCta(verb: "Craft your confidence" | "Find your best photos"): string {
  const origin = resolveSiteOrigin();
  return origin ? `${verb} at ${origin}` : verb;
}
/** Absolute /grade share URL for the current origin, or a relative fallback. */
function gradeShareUrl(): string {
  return resolveSiteUrl("/grade") ?? "/grade";
}
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
  /** Durable base64 source, read async after selection (anonymous preview). */
  dataUrl?: string;
  photoPath?: string; // set after upload
}

interface PhotoGradeResult {
  photo_path: string;
  /** Client-only durable source retained for anonymous results. */
  dataUrl?: string;
  previewUrl?: string;
  grade: number;
  feedback: string;
  is_best: boolean;
}

interface CoachingTip {
  id: string;
  text: string;
  source: "rule";
}

/**
 * Result-card photo: renders the actual uploaded photo with accessible alt
 * text and a graceful placeholder on load/error instead of a broken-image
 * glyph. `src` is resolved by the caller (data URL > blob preview > path).
 */
function ResultPhoto({ src, alt }: { src: string; alt: string }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    setLoaded(false);
    setFailed(false);
  }, [src]);
  // Belt-and-braces: never let the reveal depend on React's onLoad event. For
  // data: URLs the load event can fire before React's delegation listener is
  // ready, which previously left the img permanently `hidden` (display:none)
  // behind a skeleton even though the image had fully decoded. If the img is
  // already complete on mount — or hasn't raised onLoad within a short grace
  // period — derive the state from the img's actual decode status.
  useEffect(() => {
    const el = imgRef.current;
    if (!el || !src) return;
    if (el.complete) {
      if (el.naturalWidth > 0) setLoaded(true);
      else setFailed(true);
      return;
    }
    const timer = window.setTimeout(() => {
      if (el.complete) {
        if (el.naturalWidth > 0) setLoaded(true);
        else setFailed(true);
      }
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [src]);
  if (!src || failed) {
    return (
      <div
        role="img"
        aria-label={alt}
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-gray-700/60 bg-gray-800/60 p-1 text-center text-[10px] font-semibold text-gray-500"
      >
        {alt}
      </div>
    );
  }
  return (
    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-gray-800/60">
      {!loaded && (
        <div className="absolute inset-0 animate-pulse bg-gray-800" aria-hidden="true" />
      )}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className="relative h-full w-full object-cover"
      />
    </div>
  );
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
  const [coachingTips, setCoachingTips] = useState<CoachingTip[]>([]);

  // Free tier regrade info
  const [freeRegradeInfo, setFreeRegradeInfo] = useState<string>("");

  const csrfFetched = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isSubscribed = user?.subscription_status === "active";
  const isAuthenticated = !!user;
  const maxPhotos = 5; // All users can upload up to 5 photos

  // ── Conversion experiment: grade-result CTA (anonymous signup + Premium) ──
  const ctaExperiment = EXPERIMENTS.GRADE_CTA.name; // "grade-cta"
  const ctaRoute = EXPERIMENTS.GRADE_CTA.routes[0]!; // "grade.result"
  // The variant resolves after mount (it derives from the anonymous cookie);
  // until then the control copy renders, which matches the server render so
  // there is no hydration mismatch.
  const [ctaVariant, setCtaVariant] = useState<string | null>(null);
  useEffect(() => {
    setCtaVariant(getExperimentVariant(ctaExperiment));
  }, [ctaExperiment]);
  // One exposure per result view per visitor state (anon vs free user).
  const ctaExposureKey = useRef<string | null>(null);
  useEffect(() => {
    if (authLoading || state !== "done" || ctaVariant === null || isSubscribed) return;
    const key = user ? "free" : "anon";
    if (ctaExposureKey.current === key) return;
    ctaExposureKey.current = key;
    void recordExperimentEvent(ctaExperiment, "exposure", { route: ctaRoute });
  }, [authLoading, state, ctaVariant, user, isSubscribed, ctaExperiment, ctaRoute]);
  const recordSignupClick = () => {
    void recordExperimentEvent(ctaExperiment, "conversion", {
      route: ctaRoute,
      conversion: "signup_click",
    });
  };
  const recordSubscribeClick = () => {
    void recordExperimentEvent(ctaExperiment, "conversion", {
      route: ctaRoute,
      conversion: "subscribe_click",
    });
  };
  const showTreatmentCta = ctaVariant === "treatment";

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
      setFreeRegradeInfo("Premium regrades");
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
        `Free regrade available in ${daysLeft} day${daysLeft > 1 ? "s" : ""}. Upgrade to premium.`
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

    // Read a durable base64 source for each photo now (all users). The upload
    // is deleted right after anonymous grading, and blob: preview URLs are
    // CSP-blocked (`img-src` has no blob:) and can be invalidated, so result
    // cards must not depend on either. The data URL is the only page-lifetime
    // source that is guaranteed to render.
    for (const entry of newPhotos) {
      fileToDataUrl(entry.file)
        .then((dataUrl) => {
          setPhotos((prev) =>
            prev.map((ph) => (ph.file === entry.file ? { ...ph, dataUrl } : ph))
          );
        })
        .catch(() => {
          // Non-fatal: result cards fall back to the blob preview / path.
        });
    }

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
      // Snapshot durable sources before starting the request (all users).
      // FileReader is asynchronous; if grading finishes first, the result card
      // can render after the anonymous upload has been deleted while its data
      // URL is still missing from React state. Awaiting here makes the source
      // available for the first result render instead of relying on a later
      // state update (or a now-dead blob/server URL).
      const photosForGrade = await ensurePhotoDataUrls(photos);
      setPhotos(photosForGrade);

      // Step 1: Upload all photos
      const uploadPaths: string[] = [];

      for (const photo of photosForGrade) {
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

      // If anonymous: reuse the per-photo /api/grade endpoint for each photo
      // (no auth or persistence needed), then compose the same result shape the
      // authenticated /api/grade-photos flow returns.
      if (!isAuthenticated) {
        setState("analyzing");

        const result = await gradeAnonymousPhotos(
          uploadPaths,
          getCsrfToken() || ""
        );

        if (!result.ok) {
          if (result.kind === "nsfw") {
            setState("nsfw");
            return;
          }
          setErrorMessage(result.message);
          setState("error");
          return;
        }

        // Build photo grades with their durable render sources (data URL >
        // blob preview > server path), matched by index.
        const gradesWithPreviews: PhotoGradeResult[] = attachPhotoSources(
          result.grades,
          photosForGrade
        );

        setPhotoGrades(gradesWithPreviews);
        setCoachingTips(result.coaching);
        setGradingMethod(result.grading_method);

        // Set single grade for share card (use best photo grade)
        const bestGrade = gradesWithPreviews.find((g) => g.is_best)?.grade;
        setGrade(bestGrade ?? gradesWithPreviews[0]?.grade ?? null);

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
        if (gradeData.code === "MODERATION_UNAVAILABLE") {
          setErrorMessage(gradeData.error || "This photo was not approved or graded yet because moderation is temporarily unavailable. Please try again; this does not mean the photo is unsafe.");
          setState("error");
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

      // Build photo grades with their durable render sources (data URL >
      // blob preview > server path), matched by index.
      const gradesWithPreviews: PhotoGradeResult[] = attachPhotoSources(
        gradeData.grades || [],
        photosForGrade
      );

      setPhotoGrades(gradesWithPreviews);
      setPercentile(gradeData.percentile ?? null);
      setPercentileCity(gradeData.percentile_city ?? null);
      setPercentileLabel(gradeData.percentile_label ?? null);
      setCoachingTips(gradeData.coaching || []);
      setGradingMethod(gradeData.grading_method || null);

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
    setCoachingTips([]);
    // Allow the next result view to record a fresh CTA exposure.
    ctaExposureKey.current = null;
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
      return "Solid score. Lots of compatible singles for you.";
    if (g >= 3)
      return "Everyone's got their type — own it and find your people.";
    return "Confidence is everything. Real connections happen here.";
  };

  const handleShare = async () => {
    const shareText = percentileLabel && grade !== null
      ? `I scored ${grade}/10 — ${percentileLabel}${percentileCity ? ` in ${percentileCity}` : ""}. ${gradeCta("Craft your confidence")}`
      : `I just got my profile graded. ${gradeCta("Find your best photos")}`;

    const shareData = {
      title: "My GradeDate Profile",
      text: shareText,
      url: gradeShareUrl(),
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
      ? `I scored ${grade}/10 — ${percentileLabel}${percentileCity ? ` in ${percentileCity}` : ""}. ${gradeCta("Craft your confidence")}`
      : `I just got my profile graded. ${gradeCta("Find your best photos")}`;

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
              Upload up to 5 photos. Our AI grades each one and gives you actionable tips.
            </p>
          </div>

          <div className="rounded-2xl border border-rose-500/20 bg-gray-900/60 p-4 sm:p-8 backdrop-blur-sm">
            {/* ── Idle: Upload prompt ─────────────────────────── */}
            {state === "idle" && (
              <div className="flex flex-col items-center gap-4">
                {/* Photo thumbnails */}
                {photos.length > 0 && (
                  <div className="flex flex-wrap justify-center gap-3">
                    {photos.map((photo, i) => (
                      <div key={i} className="relative">
                        <img
                          src={resolveGradePhotoSrc(photo.dataUrl, photo.previewUrl, photo.photoPath)}
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
                        ? "Drop up to 5 photos here"
                        : "Add another photo"}
                    </span>
                    <span className="text-xs text-gray-500">
                      {`${photos.length}/${maxPhotos} photos — JPEG, PNG, WebP`}
                    </span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      aria-label="Upload photos"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      onChange={handleAddPhotos}
                      className="sr-only"
                    />
                  </label>
                )}

                {/* Grade button */}
                {photos.length > 0 && (
                  <button
                    onClick={handleGradePhotos}
                    className="w-full rounded-full bg-rose-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-rose-600/25 transition hover:bg-rose-500 hover:shadow-rose-500/30"
                  >
                    {`Grade My ${
                      photos.length === 1 ? "Photo" : `${photos.length} Photos`
                    }`}
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
                        src={resolveGradePhotoSrc(photo.dataUrl, photo.previewUrl, photo.photoPath)}
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
                        src={resolveGradePhotoSrc(photo.dataUrl, photo.previewUrl, photo.photoPath)}
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
                      {/* Photo thumbnail (durable source: data URL > blob preview > path) */}
                      <ResultPhoto
                        src={resolveGradePhotoSrc(pg.dataUrl, pg.previewUrl, pg.photo_path)}
                        alt={`Photo ${i + 1}`}
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
                      {/* Per-photo share button */}
                      <ShareCard
                        grade={pg.grade}
                        percentileLabel={null}
                        photoUrl={resolveGradePhotoSrc(pg.dataUrl, pg.previewUrl, pg.photo_path)}
                        gradingMethod={gradingMethod}
                        compact
                      />
                    </div>
                  ))}
                </div>

                {/* Grading method notice (simulated/mixed fallback) */}
                {gradingMethod && gradingMethod !== "ai" && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-center">
                    <p className="text-xs text-amber-300">
                      {gradingMethod === "mock"
                        ? "AI grading was unavailable, so these grades are simulated. Try again later for AI-assisted grades."
                        : "AI grading was unavailable for some photos — those grades are simulated."}
                    </p>
                  </div>
                )}

                {/* Coaching tips */}
                {coachingTips.length > 0 && (
                  <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wider text-purple-400">
                      Coaching Tips
                    </div>
                    <ul className="mt-2 space-y-1.5">
                      {coachingTips.map((tip) => (
                        <li
                          key={tip.id}
                          className="flex items-start gap-2 text-sm text-gray-300"
                        >
                          <span className="mt-0.5 shrink-0 text-purple-400">✦</span>
                          {tip.text}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-[10px] text-gray-600">
                      Suggestions to try — not a judgment of your photos.
                    </p>
                  </div>
                )}

                {/* Percentile card (authenticated only — anonymous previews
                    have no city or percentile yet) */}
                {isAuthenticated && (
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
                )}

                {/* Shareable card */}
                <ShareCard
                  grade={grade}
                  percentileLabel={percentileLabel}
                  gradingMethod={gradingMethod}
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
                      {showTreatmentCta ? "Sign up free" : "Like your grade?"}
                    </div>
                    <p className="mb-1 text-2xl font-extrabold">
                      <span className="text-rose-400">$5.99</span>
                      <span className="text-lg text-gray-500">/month</span>
                    </p>
                    <p className="mb-5 text-sm text-gray-400">
                      {showTreatmentCta
                        ? "Create your profile for free, see matches at your level, and chat with real people. Upgrade to Premium for $5.99/mo anytime."
                        : "Sign up to find matches at your level, chat, and connect with real people."}
                    </p>
                    <Link
                      to="/signup"
                      onClick={recordSignupClick}
                      className="inline-block w-full rounded-full bg-rose-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-rose-600/25 transition hover:bg-rose-500 hover:shadow-rose-500/30"
                    >
                      {showTreatmentCta
                        ? "Create Your Free Profile"
                        : "Sign Up to Find Your Matches"}
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
                      {showTreatmentCta
                        ? "Unlock your matches"
                        : "See Your Best Matches"}
                    </div>
                    <p className="mb-1 text-2xl font-extrabold">
                      <span className="text-rose-400">$5.99</span>
                      <span className="text-lg text-gray-500">/month</span>
                    </p>
                    <p className="mb-5 text-sm text-gray-400">
                      {showTreatmentCta
                        ? "Subscribe to browse matches at your grade level, chat, and connect with real people. $5.99/mo — cancel anytime."
                        : "Subscribe to browse matches at your grade level, chat, and connect with real people."}
                    </p>
                    <Link
                      to="/subscribe"
                      onClick={recordSubscribeClick}
                      className="inline-block w-full rounded-full bg-rose-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-rose-600/25 transition hover:bg-rose-500 hover:shadow-rose-500/30"
                    >
                      {showTreatmentCta
                        ? "Subscribe — $5.99/mo"
                        : "Subscribe to See Your Matches — $5.99/mo"}
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
                {resolveEntryPhotoSrc(photos[0]) && (
                  <img
                    src={resolveEntryPhotoSrc(photos[0])}
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
                    <div className="mt-1 text-xs font-medium text-amber-500">
                      Simulated grade — AI grading was unavailable
                    </div>
                  )}
                  {analysis && (
                    <p className="mt-2 text-sm italic text-gray-400">
                      "{analysis}"
                    </p>
                  )}
                  <p className="mt-2 text-xs text-gray-500">
                    Your grade helps us find your best matches. It is never shown to other users.
                  </p>
                  <p className="mt-1 text-[10px] text-gray-700">
                    {gradingMethod === "mock"
                      ? "AI grading was unavailable, so this grade is simulated. Try again later for an AI-assisted grade."
                      : "AI-generated estimate. Results may vary."}
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
                      {showTreatmentCta ? "Sign up free" : "Like your grade?"}
                    </div>
                    <p className="mb-1 text-2xl font-extrabold">
                      <span className="text-rose-400">$5.99</span>
                      <span className="text-lg text-gray-500">/month</span>
                    </p>
                    <p className="mb-5 text-sm text-gray-400">
                      {showTreatmentCta
                        ? "Create your profile for free, see matches at your level, and chat with real people. Upgrade to Premium for $5.99/mo anytime."
                        : "Sign up to find matches at your level, chat, and connect with real people."}
                    </p>
                    <Link
                      to="/signup"
                      onClick={recordSignupClick}
                      className="inline-block w-full rounded-full bg-rose-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-rose-600/25 transition hover:bg-rose-500 hover:shadow-rose-500/30"
                    >
                      {showTreatmentCta
                        ? "Create Your Free Profile"
                        : "Sign Up to Find Your Matches"}
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
                      {showTreatmentCta
                        ? "Unlock your matches"
                        : "See Your Best Matches"}
                    </div>
                    <p className="mb-1 text-2xl font-extrabold">
                      <span className="text-rose-400">$5.99</span>
                      <span className="text-lg text-gray-500">/month</span>
                    </p>
                    <p className="mb-5 text-sm text-gray-400">
                      {showTreatmentCta
                        ? "Subscribe to browse matches at your grade level, chat, and connect with real people. $5.99/mo — cancel anytime."
                        : "Subscribe to browse matches at your grade level, chat, and connect with real people."}
                    </p>
                    <Link
                      to="/subscribe"
                      onClick={recordSubscribeClick}
                      className="inline-block w-full rounded-full bg-rose-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-rose-600/25 transition hover:bg-rose-500 hover:shadow-rose-500/30"
                    >
                      {showTreatmentCta
                        ? "Subscribe — $5.99/mo"
                        : "Subscribe to See Your Matches — $5.99/mo"}
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
  percentileCity,
  photoUrl,
  gradingMethod,
  compact,
}: {
  grade: number | null;
  percentileLabel: string | null;
  percentileCity?: string | null;
  photoUrl?: string;
  gradingMethod?: string | null;
  compact?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [statusMsg, setStatusMsg] = useState("");
  const [statusVisible, setStatusVisible] = useState(false);

  // Site origin resolved client-side after mount (avoids SSR/hydration
  // mismatch while keeping the card CTA pointing at the real origin).
  const [siteOrigin, setSiteOrigin] = useState<string | null>(null);
  useEffect(() => {
    setSiteOrigin(resolveSiteOrigin());
  }, []);
  const tagline = siteOrigin ? `Craft your confidence at ${siteOrigin}` : "Craft your confidence";
  const methodLabel = gradingMethod && gradingMethod !== "ai" ? (gradingMethod === "mock" ? "Simulated grade — AI unavailable" : "Some grades simulated — AI unavailable") : "AI-assisted grade";

  const displayGrade = grade ?? "?";

  const shareText =
    percentileLabel && grade !== null
      ? `I scored ${grade}/10 — ${percentileLabel}${percentileCity ? ` in ${percentileCity}` : ""}. ${methodLabel}. ${tagline}`
      : grade !== null
        ? `I scored ${grade}/10. ${methodLabel}. ${tagline}`
        : tagline;

  const showFeedback = (msg: string) => {
    setStatusMsg(msg);
    setStatusVisible(true);
    setTimeout(() => setStatusVisible(false), 2500);
  };

  // Render the share card to an offscreen canvas and return a PNG blob
  const renderToCanvas = async (): Promise<Blob> => {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 630;
    const ctx = canvas.getContext("2d")!;

    // ── Background ──
    const bgGrad = ctx.createLinearGradient(0, 0, 0, 630);
    bgGrad.addColorStop(0, "#0b0b1e");
    bgGrad.addColorStop(1, "#150a18");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 1200, 630);

    // Top rose accent glow
    const glow = ctx.createRadialGradient(600, 0, 0, 600, 0, 900);
    glow.addColorStop(0, "rgba(244, 63, 94, 0.18)");
    glow.addColorStop(0.5, "rgba(244, 63, 94, 0.04)");
    glow.addColorStop(1, "rgba(244, 63, 94, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 1200, 630);

    // Bottom purple accent
    const glow2 = ctx.createRadialGradient(600, 630, 0, 600, 630, 700);
    glow2.addColorStop(0, "rgba(168, 85, 247, 0.12)");
    glow2.addColorStop(1, "rgba(168, 85, 247, 0)");
    ctx.fillStyle = glow2;
    ctx.fillRect(0, 0, 1200, 630);

    // ── Photo thumbnail (left side) ──
    if (photoUrl) {
      try {
        const img = await loadImage(photoUrl);
        const photoSize = 260;
        const photoX = 100;
        const photoY = (630 - photoSize) / 2;

        // Circular clip
        ctx.save();
        ctx.beginPath();
        ctx.arc(photoX + photoSize / 2, photoY + photoSize / 2, photoSize / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();

        // Scale to cover the circle
        const scale = Math.max(photoSize / img.width, photoSize / img.height);
        const sw = img.width * scale;
        const sh = img.height * scale;
        const sx = photoX + (photoSize - sw) / 2;
        const sy = photoY + (photoSize - sh) / 2;
        ctx.drawImage(img, sx, sy, sw, sh);

        ctx.restore();

        // Ring around photo
        ctx.beginPath();
        ctx.arc(photoX + photoSize / 2, photoY + photoSize / 2, photoSize / 2 + 3, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(244, 63, 94, 0.4)";
        ctx.lineWidth = 4;
        ctx.stroke();
      } catch {
        // Draw placeholder if image fails to load
        const cx = 230;
        const cy = 315;
        ctx.beginPath();
        ctx.arc(cx, cy, 130, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(244, 63, 94, 0.1)";
        ctx.fill();
        ctx.strokeStyle = "rgba(244, 63, 94, 0.3)";
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    } else {
      // Placeholder circle
      const cx = 230;
      const cy = 315;
      ctx.beginPath();
      ctx.arc(cx, cy, 130, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(244, 63, 94, 0.08)";
      ctx.fill();
      ctx.strokeStyle = "rgba(244, 63, 94, 0.25)";
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // ── Right side: Grade and text ──
    const textX = 420;
    let textY = 160;

    // Grade number
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 140px Inter, system-ui, sans-serif";
    ctx.fillText(String(displayGrade), textX, textY + 120);

    // /10
    ctx.fillStyle = "#9ca3af";
    ctx.font = "48px Inter, system-ui, sans-serif";
    ctx.fillText("/10", textX + 180, textY + 120);

    // Percentile badge
    if (percentileLabel) {
      textY += 170;
      const badgeText = percentileLabel;
      const badgeCity = percentileCity ? ` in ${percentileCity}` : "";

      // Badge background
      const badgeW = ctx.measureText(badgeText).width + 60;
      const badgeH = 46;
      const badgeX = textX;
      const badgeY = textY;

      ctx.fillStyle = "rgba(244, 63, 94, 0.2)";
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 23);
      ctx.fill();
      ctx.strokeStyle = "rgba(244, 63, 94, 0.4)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = "#f43f5e";
      ctx.font = "bold 28px Inter, system-ui, sans-serif";
      ctx.fillText(badgeText, badgeX + 30, badgeY + 33);

      if (badgeCity) {
        ctx.fillStyle = "rgba(255,255,255,0.6)";
        ctx.font = "20px Inter, system-ui, sans-serif";
        ctx.fillText(badgeCity, badgeX + 30 + ctx.measureText(badgeText).width + 10, badgeY + 33);
      }
    }

    // Tagline
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = "24px Inter, system-ui, sans-serif";
    ctx.fillText(methodLabel, textX, 500);
    ctx.fillText("Craft your confidence at", textX, 530);

    // ── Bottom branding ──
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font = "bold 32px Inter, system-ui, sans-serif";
    const brandX = 100;
    const brandY = 590;

    // Heart icon
    ctx.fillStyle = "#f43f5e";
    ctx.beginPath();
    const hx = brandX;
    const hy = brandY - 22;
    ctx.moveTo(hx + 12, hy + 6);
    ctx.bezierCurveTo(hx + 12, hy + 2, hx + 8, hy, hx + 4, hy);
    ctx.bezierCurveTo(hx - 2, hy, hx - 2, hy + 8, hx + 2, hy + 14);
    ctx.bezierCurveTo(hx + 6, hy + 18, hx + 10, hy + 20, hx + 12, hy + 22);
    ctx.bezierCurveTo(hx + 14, hy + 20, hx + 18, hy + 18, hx + 22, hy + 14);
    ctx.bezierCurveTo(hx + 26, hy + 8, hx + 26, hy, hx + 20, hy);
    ctx.bezierCurveTo(hx + 16, hy, hx + 12, hy + 2, hx + 12, hy + 6);
    ctx.fill();

    ctx.fillStyle = "#f43f5e";
    ctx.font = "bold 26px Inter, system-ui, sans-serif";
    ctx.fillText("Grade", brandX + 34, brandY);
    ctx.fillStyle = "#ffffff";
    ctx.fillText("Date", brandX + 100, brandY);
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font = "20px Inter, system-ui, sans-serif";
    ctx.fillText(".app", brandX + 172, brandY);

    // ── Export ──
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Failed to generate image"));
      }, "image/png");
    });
  };

  const handleDownload = async () => {
    try {
      setStatusMsg("Generating card…");
      setStatusVisible(true);
      const blob = await renderToCanvas();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "gradedate-card.png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showFeedback("Card downloaded!");
    } catch (err) {
      console.error("Download failed:", err);
      showFeedback("Failed to generate card. Try again.");
    }
  };

  const handleShareImage = async () => {
    try {
      setStatusMsg("Generating card…");
      setStatusVisible(true);
      const blob = await renderToCanvas();
      const file = new File([blob], "gradedate-card.png", { type: "image/png" });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: "My GradeDate Card",
          text: shareText,
          files: [file],
        });
        showFeedback("Shared!");
      } else if (navigator.share) {
        // Fallback: share text + URL only
        await navigator.share({
          title: "My GradeDate Card",
          text: shareText,
          url: siteOrigin ? `${siteOrigin}/grade` : "/grade",
        });
        showFeedback("Shared!");
      } else {
        // Clipboard fallback
        await navigator.clipboard.writeText(shareText);
        showFeedback("Copied to clipboard!");
      }
    } catch (err) {
      // User cancelled or error - try clipboard
      if (err instanceof DOMException && err.name === "AbortError") {
        setStatusVisible(false);
        return;
      }
      try {
        await navigator.clipboard.writeText(shareText);
        showFeedback("Copied to clipboard!");
      } catch {
        showFeedback("Sharing not supported on this browser");
      }
    }
  };

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      showFeedback("Copied!");
    } catch {
      showFeedback("Copy failed");
    }
  };

  if (compact) {
    return (
      <div className="relative inline-flex items-center gap-1">
        <button
          onClick={handleShareImage}
          className="inline-flex items-center gap-1 rounded-full border border-gray-600 bg-gray-800/60 px-2.5 py-1 text-xs font-medium text-gray-300 transition hover:border-gray-400 hover:text-white hover:bg-gray-700/60"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
          </svg>
          Share
        </button>
        {statusVisible && (
          <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] text-green-400">
            {statusMsg}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="mb-2 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">
        Share Your Card
      </div>

      {/* Visual preview card (HTML/CSS) */}
      <div
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
              <linearGradient id="gclg3" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#f43f5e" />
                <stop offset="100%" stopColor="#f59e0b" />
              </linearGradient>
            </defs>
            <circle cx="24" cy="24" r="23" fill="none" stroke="url(#gclg3)" strokeWidth="1.5" opacity="0.3" />
            <path d="M24 35C24 35 8 27 8 17.5c0-4.14 3.36-7.5 7.5-7.5 2.48 0 4.66 1.2 6 3.07L24 15l2.5-1.93c1.34-1.87 3.52-3.07 6-3.07 4.14 0 7.5 3.36 7.5 7.5C40 27 24 35 24 35z" fill="url(#gclg3)" opacity="0.9" />
            <text x="24" y="26.5" textAnchor="middle" fill="#030712" fontFamily="Inter, sans-serif" fontSize="10" fontWeight="900">10</text>
          </svg>
          <span className="text-lg font-bold tracking-tight">
            <span className="text-rose-500">Grade</span>
            <span className="text-white">Date</span>
          </span>
        </div>

        {/* Photo thumbnail in card */}
        {photoUrl && (
          <div className="mb-3 flex justify-center">
            <img
              src={photoUrl}
              alt="Profile"
              className="h-20 w-20 rounded-full object-cover ring-2 ring-rose-500/30"
            />
          </div>
        )}

        {/* Grade / percentile display */}
        {percentileLabel && grade !== null ? (
          <div className="my-3">
            <div className="text-xs font-semibold uppercase tracking-widest text-gray-500">
              My Percentile
            </div>
            <div className="text-4xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-rose-400 to-rose-600">
              {percentileLabel}
            </div>
            {percentileCity && (
              <div className="mt-1 text-xs text-gray-500">in {percentileCity}</div>
            )}
            <div className="mt-2 text-sm font-bold text-white">
              {displayGrade}
              <span className="text-xs text-gray-500">/10</span>
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
          {tagline}
        </p>

        {/* Decorative corner glows */}
        <div className="pointer-events-none absolute -top-8 -right-8 h-24 w-24 rounded-full bg-rose-500/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-8 -left-8 h-24 w-24 rounded-full bg-purple-500/10 blur-2xl" />
      </div>

      {/* Action buttons */}
      <div className="mt-3 flex gap-2">
        <button
          onClick={handleShareImage}
          className="flex flex-1 items-center justify-center gap-2 rounded-full border border-gray-600 bg-gray-800/60 px-4 py-2.5 text-sm font-medium text-gray-200 transition hover:border-gray-400 hover:text-white hover:bg-gray-700/60"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
          </svg>
          Share
        </button>
        <button
          onClick={handleDownload}
          className="flex flex-1 items-center justify-center gap-2 rounded-full border border-gray-600 bg-gray-800/60 px-4 py-2.5 text-sm font-medium text-gray-200 transition hover:border-gray-400 hover:text-white hover:bg-gray-700/60"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          Download
        </button>
        <button
          onClick={handleCopyText}
          className="flex items-center justify-center gap-2 rounded-full border border-gray-600 bg-gray-800/60 px-3 py-2.5 text-sm font-medium text-gray-200 transition hover:border-gray-400 hover:text-white hover:bg-gray-700/60"
          title="Copy text"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
          </svg>
        </button>
      </div>

      {/* Status feedback */}
      <p
        className={`mt-2 text-center text-xs text-green-400 transition-opacity duration-200 ${statusVisible ? "opacity-100" : "opacity-0"}`}
      >
        {statusMsg}
      </p>
    </div>
  );
}

// Helper: load an image from a URL (handles blob URLs and remote URLs)
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}
