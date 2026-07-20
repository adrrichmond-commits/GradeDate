import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
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

  // Edit mode state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editAge, setEditAge] = useState("");
  const [editGender, setEditGender] = useState("");
  const [editLookingFor, setEditLookingFor] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editPhotoFile, setEditPhotoFile] = useState<File | null>(null);
  const [editPhotoPreview, setEditPhotoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const successTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Delete account
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/login" });
    }
  }, [loading, user]);

  useEffect(() => {
    if (user && !user.display_name) {
      navigate({ to: "/profile/setup" });
    }
  }, [user]);

  // Clear success toast after 3s
  useEffect(() => {
    return () => {
      if (successTimeout.current) clearTimeout(successTimeout.current);
    };
  }, []);

  const initEditFields = () => {
    if (!user) return;
    setEditName(user.display_name || "");
    setEditAge(user.age?.toString() || "");
    setEditGender(user.gender || "");
    setEditLookingFor(user.looking_for || "everyone");
    setEditBio(user.bio || "");
    setEditPhotoFile(null);
    setEditPhotoPreview(null);
    setSaveError("");
    setSaveSuccess(false);
  };

  const handleEnterEdit = () => {
    initEditFields();
    setEditing(true);
  };

  const handleCancelEdit = () => {
    initEditFields();
    setEditing(false);
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setEditPhotoFile(file);
    setEditPhotoPreview(URL.createObjectURL(file));
  };

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

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      await fetch("/api/account/delete", { method: "POST" });
      // Clear auth context and redirect
      await refetch();
      navigate({ to: "/" });
    } catch {
      setDeleting(false);
    }
  };

  const handleUploadPhoto = async (): Promise<string | null> => {
    if (!editPhotoFile) return null;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("photo", editPhotoFile);
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error || "Upload failed");
        return null;
      }
      return data.photo_path;
    } catch {
      setSaveError("Photo upload failed. Please try again.");
      return null;
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setSaveError("");
    setSaveSuccess(false);

    // Validate required fields
    if (!editName.trim()) {
      setSaveError("Display name is required");
      return;
    }

    const ageNum = parseInt(editAge, 10);
    if (!editAge || isNaN(ageNum) || ageNum < 18 || ageNum > 120) {
      setSaveError("Please enter a valid age (18-120)");
      return;
    }

    if (!editGender) {
      setSaveError("Please select your gender");
      return;
    }

    if (!editLookingFor) {
      setSaveError("Please select who you're looking for");
      return;
    }

    setSaving(true);

    // Upload photo first if a new one was selected
    let photoPath = user?.photo_path;
    if (editPhotoFile) {
      const uploadedPath = await handleUploadPhoto();
      if (uploadedPath) {
        photoPath = uploadedPath;
      } else {
        setSaving(false);
        return;
      }
    }

    // Save profile via API
    try {
      const res = await fetch("/api/auth/update-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: editName.trim(),
          age: ageNum,
          gender: editGender,
          looking_for: editLookingFor,
          bio: editBio.trim(),
          photo_path: photoPath,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error || "Failed to save profile");
        return;
      }

      await refetch();
      setSaveSuccess(true);
      setEditing(false);

      // Clear success toast after 3s
      if (successTimeout.current) clearTimeout(successTimeout.current);
      successTimeout.current = setTimeout(() => setSaveSuccess(false), 3000);
    } catch {
      setSaveError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading || checking) {
    return (
      <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4">
        <div className="flex flex-col items-center gap-4">
          <div className="loader-pulse" />
          <p className="text-sm text-gray-400">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (!user || !isSubscribed) return null;

  // Current photo to display
  const displayPhoto = editPhotoPreview || user.photo_path;

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      {/* Success Toast */}
      {saveSuccess && (
        <div className="fixed top-6 left-1/2 z-50 -translate-x-1/2 animate-[fadeInUp_0.3s_ease-out]">
          <div className="flex items-center gap-2.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-5 py-2.5 shadow-lg backdrop-blur-sm">
            <svg className="h-4 w-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-sm font-medium text-emerald-400">Profile updated successfully!</span>
          </div>
        </div>
      )}

      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold">Your Profile</h1>
        <p className="mt-2 text-gray-400">
          This is how other GradeDate members see you.
        </p>
      </div>

      <div className="card p-8">
        {/* Photo */}
        <div className="mb-8 flex justify-center">
          {displayPhoto ? (
            <img
              src={displayPhoto}
              alt={user.display_name || "Profile"}
              className="h-40 w-40 rounded-full object-cover ring-3 ring-rose-500/15 ring-offset-4 ring-offset-gray-950"
            />
          ) : (
            <div className="flex h-40 w-40 items-center justify-center rounded-full bg-gray-800 ring-3 ring-rose-500/15 ring-offset-4 ring-offset-gray-950 text-gray-500">
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

          {/* Photo upload in edit mode */}
          {editing && (
            <div className="ml-6 flex flex-col justify-center">
              <label className="cursor-pointer rounded-lg border border-gray-600 px-4 py-2.5 text-sm text-gray-300 transition hover:border-rose-500/50 hover:text-white">
                Change Photo
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoChange}
                  className="hidden"
                />
              </label>
              <p className="mt-1 text-xs text-gray-500">A clear face photo works best.</p>
            </div>
          )}
        </div>

        {/* Grade Display — hero element (only in view mode) */}
        {!editing && user.grade !== null && (
          <div className="mb-8 text-center">
            <div className="inline-flex flex-col items-center rounded-2xl border border-rose-500/20 bg-gradient-to-b from-rose-500/5 to-transparent px-10 py-6">
              <span className="text-xs font-semibold uppercase tracking-wider text-rose-400">
                Your Grade
              </span>
              <span className="mt-1 animate-[scaleIn_0.5s_ease-out] text-6xl font-black text-rose-400">
                {user.grade}
              </span>
              <span className="text-xs text-gray-500">/ 10</span>
              {/* Grade bar */}
              <div className="mt-3 flex w-full max-w-[160px] gap-0.5">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-1.5 flex-1 rounded-full ${
                      i < user.grade!
                        ? "bg-gradient-to-r from-rose-500 to-purple-500"
                        : "bg-gray-800"
                    }`}
                  />
                ))}
              </div>
            </div>
            <div className="mt-3">
              <Link to="/matches" className="btn-primary">
                Browse Matches →
              </Link>
            </div>
          </div>
        )}

        {/* Get Graded CTA (only in view mode) */}
        {!editing && user.grade === null && user.photo_path && (
          <div className="mb-8 text-center">
            {grading ? (
              <div className="flex flex-col items-center gap-4 py-4">
                <div className="loader-pulse" />
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
                  className="mt-4 inline-flex items-center gap-2 rounded-full bg-amber-500 px-6 py-2.5 text-sm font-semibold text-gray-950 transition hover:bg-amber-400 hover:scale-105 active:scale-95"
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

        {/* No photo yet (only in view mode) */}
        {!editing && user.grade === null && !user.photo_path && (
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
              <button onClick={handleEnterEdit} className="btn-secondary mt-4">
                Upload Photo
              </button>
            </div>
          </div>
        )}

        {/* ── Edit Mode ── */}
        {editing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSave();
            }}
            className="space-y-5"
          >
            {saveError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
                {saveError}
              </div>
            )}

            {/* Display Name */}
            <div>
              <label htmlFor="editName" className="mb-1.5 block text-sm font-medium text-gray-300">
                Display Name
              </label>
              <input
                id="editName"
                type="text"
                required
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-gray-100 placeholder-gray-500 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                placeholder="How you'll appear on GradeDate"
              />
            </div>

            {/* Age */}
            <div>
              <label htmlFor="editAge" className="mb-1.5 block text-sm font-medium text-gray-300">
                Age
              </label>
              <input
                id="editAge"
                type="number"
                required
                min={18}
                max={120}
                value={editAge}
                onChange={(e) => setEditAge(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-gray-100 placeholder-gray-500 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                placeholder="18"
              />
            </div>

            {/* Gender */}
            <div>
              <label htmlFor="editGender" className="mb-1.5 block text-sm font-medium text-gray-300">
                Gender
              </label>
              <select
                id="editGender"
                required
                value={editGender}
                onChange={(e) => setEditGender(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-gray-100 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
              >
                <option value="" disabled>
                  Select...
                </option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="non-binary">Non-binary</option>
                <option value="other">Other</option>
                <option value="prefer-not-to-say">Prefer not to say</option>
              </select>
            </div>

            {/* Looking For */}
            <div>
              <label htmlFor="editLookingFor" className="mb-1.5 block text-sm font-medium text-gray-300">
                Looking For
              </label>
              <select
                id="editLookingFor"
                required
                value={editLookingFor}
                onChange={(e) => setEditLookingFor(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-gray-100 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
              >
                <option value="" disabled>
                  Select...
                </option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="everyone">Everyone</option>
              </select>
            </div>

            {/* Bio */}
            <div>
              <label htmlFor="editBio" className="mb-1.5 block text-sm font-medium text-gray-300">
                Bio
              </label>
              <textarea
                id="editBio"
                rows={3}
                value={editBio}
                onChange={(e) => setEditBio(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-gray-100 placeholder-gray-500 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                placeholder="A few words about yourself..."
              />
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={handleCancelEdit}
                disabled={saving || uploading}
                className="flex-1 rounded-full border border-gray-600 px-6 py-2.5 text-sm font-semibold text-gray-300 transition hover:border-gray-500 hover:text-white disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || uploading}
                className="flex-1 rounded-full bg-rose-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:opacity-50"
              >
                {uploading ? "Uploading photo..." : saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        ) : (
          <>
            {/* ── View Mode Details ── */}
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
                  Looking For
                </span>
                <p className="mt-1 text-lg font-semibold capitalize text-gray-100">
                  {user.looking_for || "everyone"}
                </p>
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

            {/* Edit Profile Button */}
            <div className="mt-8 text-center">
              <button onClick={handleEnterEdit} className="btn-secondary">
                Edit Profile
              </button>
            </div>

            {/* ── Delete Account ── */}
            <div className="mt-12 border-t border-red-500/20 pt-8">
              <h3 className="text-lg font-semibold text-red-400">Danger Zone</h3>
              <p className="mt-1 text-sm text-gray-500">
                Permanently delete your account and all associated data. This action cannot be undone.
              </p>
              {!showDeleteConfirm ? (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="mt-4 rounded-full border border-red-500/40 px-6 py-2.5 text-sm font-semibold text-red-400 transition hover:bg-red-500/10 hover:border-red-400"
                >
                  Delete Account
                </button>
              ) : (
                <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/5 p-5">
                  <p className="text-sm font-semibold text-red-400">
                    Are you sure? This permanently deletes your account and all data.
                  </p>
                  <div className="mt-4 flex gap-3">
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      disabled={deleting}
                      className="flex-1 rounded-full border border-gray-600 px-4 py-2 text-sm text-gray-300 transition hover:border-gray-500 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDeleteAccount}
                      disabled={deleting}
                      className="flex-1 rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-50"
                    >
                      {deleting ? "Deleting..." : "Yes, Delete My Account"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Inline keyframe for toast */}
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translate(-50%, 20px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>
    </div>
  );
}
