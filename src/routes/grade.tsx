import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "~/auth-context";
import { getCsrfToken } from "~/csrf-client";

export const Route = createFileRoute("/grade")({
  component: GradePage,
});

type UIState = "idle" | "uploading" | "analyzing" | "done" | "nsfw" | "error";

function GradePage() {
  const { user, loading: authLoading } = useAuth();

  const [state, setState] = useState<UIState>("idle");
  const [grade, setGrade] = useState<number | null>(null);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [gradingMethod, setGradingMethod] = useState<string | null>(null);
  // Store the photo_path returned by upload for anonymous grading
  const [uploadedPhotoPath, setUploadedPhotoPath] = useState<string | null>(null);

  const isSubscribed = user?.subscription_status === "active";

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setErrorMessage("Only JPEG, PNG, and WebP images are allowed.");
      setState("error");
      return;
    }

    const url = URL.createObjectURL(file);
    setPreview(url);
    setState("uploading");
    setErrorMessage("");

    try {
      const formData = new FormData();
      formData.append("photo", file);

      // Step 1: Upload
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
      const photoPath = uploadData.photo_path as string;

      setUploadedPhotoPath(photoPath);
      setState("analyzing");

      // Step 2: Grade
      const gradeBody: Record<string, string> = {};
      if (user) {
        // Authenticated — grade endpoint reads from profile photo_path
        gradeBody._ = ""; // empty body, just trigger grading
      } else {
        // Anonymous — pass photo_path explicitly
        gradeBody.photo_path = photoPath;
      }

      const gradeRes = await fetch("/api/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() || "" },
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
    } catch {
      setErrorMessage("Network error. Please check your connection and try again.");
      setState("error");
    }
  };

  const reset = () => {
    setState("idle");
    setGrade(null);
    setAnalysis(null);
    setPreview(null);
    setErrorMessage("");
    setGradingMethod(null);
    setUploadedPhotoPath(null);
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

  return (
    <>
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
        <div className="w-full max-w-lg">
          {/* Header */}
          <div className="mb-8 text-center">
            <span className="mb-4 inline-block rounded-full bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-400">
              FREE PREVIEW
            </span>
            <h1 className="text-3xl font-bold sm:text-4xl">Grade Your Selfie</h1>
            <p className="mt-2 text-gray-400">
              Upload your photo and our AI will analyze your facial appearance
              on a 1–10 scale. Screened for appropriate content.
            </p>
          </div>

          <div className="rounded-2xl border border-rose-500/20 bg-gray-900/60 p-8 backdrop-blur-sm">
            {/* ── Idle: Upload prompt ─────────────────────────── */}
            {state === "idle" && (
              <label className="flex cursor-pointer flex-col items-center gap-4 rounded-xl border-2 border-dashed border-gray-600 p-10 transition hover:border-rose-500/50">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-500/10">
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
                      d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z"
                    />
                  </svg>
                </div>
                <span className="text-lg font-medium text-gray-200">
                  Drop your selfie here
                </span>
                <span className="text-sm text-gray-500">
                  or click to browse — JPEG, PNG, WebP accepted
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFile}
                  className="hidden"
                />
              </label>
            )}

            {/* ── Uploading ───────────────────────────────────── */}
            {state === "uploading" && (
              <div className="flex flex-col items-center gap-6 py-8">
                {preview && (
                  <img
                    src={preview}
                    alt="Preview"
                    className="h-40 w-40 rounded-full object-cover ring-3 ring-rose-500/15 ring-offset-2 ring-offset-gray-950"
                  />
                )}
                <div className="loader-pulse" />
                <p className="text-gray-400">Uploading your photo...</p>
              </div>
            )}

            {/* ── Analyzing ───────────────────────────────────── */}
            {state === "analyzing" && (
              <div className="flex flex-col items-center gap-6 py-8">
                {preview && (
                  <img
                    src={preview}
                    alt="Preview"
                    className="h-40 w-40 rounded-full object-cover ring-3 ring-rose-500/15 ring-offset-2 ring-offset-gray-950"
                  />
                )}
                <div className="loader-pulse" />
                <p className="text-gray-400">
                  Analyzing facial features...
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
                <h3 className="text-xl font-bold text-amber-400">
                  Upload Error
                </h3>
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

            {/* ── Done: Grade Reveal ──────────────────────────── */}
            {state === "done" && grade !== null && (
              <div className="flex flex-col items-center gap-6 py-4">
                {preview && (
                  <img
                    src={preview}
                    alt="Preview"
                    className="h-32 w-32 rounded-full object-cover ring-3 ring-rose-500/15 ring-offset-2 ring-offset-gray-950"
                  />
                )}
                <div className="text-center">
                  <div className="animate-[scaleIn_0.6s_ease-out] text-7xl font-black tracking-tighter text-rose-400">
                    {grade}
                  </div>
                  <div className="mt-1 text-sm font-medium text-gray-500">
                    out of 10
                    {gradingMethod === "mock" && (
                      <span className="ml-1 text-xs text-gray-600">(mock)</span>
                    )}
                  </div>
                  {analysis && (
                    <p className="mt-2 text-sm italic text-gray-400">
                      "{analysis}"
                    </p>
                  )}
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

                {/* ── Subscriber flow: link to matches ────────── */}
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

                {/* ── Non-subscriber (anon or logged-in): paywall ── */}
                {!isSubscribed && (
                  <div className="w-full rounded-xl border border-rose-500/30 bg-gradient-to-b from-gray-900 to-gray-950 p-6 text-center shadow-lg shadow-rose-500/5">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-rose-400">
                      See Who's in Your League
                    </div>
                    <p className="mb-1 text-2xl font-extrabold">
                      <span className="text-rose-400">$5.99</span>
                      <span className="text-gray-500 text-lg">/month</span>
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

                {/* ── Re-grade upsell (subscribers only) ────────── */}
                {isSubscribed && (
                  <div className="mt-4 w-full rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-center">
                    <p className="text-sm font-medium text-amber-400">
                      Not happy with your grade?
                    </p>
                    <p className="mt-1 text-xs text-gray-400">
                      Get a fresh AI evaluation for just $2.99.
                    </p>
                    <Link
                      to="/store"
                      className="mt-3 inline-block rounded-full bg-amber-500 px-5 py-2 text-xs font-semibold text-gray-950 transition hover:bg-amber-400"
                    >
                      Re-grade — $2.99 →
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer note */}
          <p className="mt-6 text-center text-xs text-gray-600">
            Photos are screened for inappropriate content before grading.
            Your grade is kept private — only you see it.
          </p>
        </div>
      </main>
    </>
  );
}
