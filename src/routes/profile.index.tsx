import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { useAuth } from "~/auth-context";
import { useRequireSubscription, SubscriptionBanner } from "~/subscription-guard";

export const Route = createFileRoute("/profile/")({
  component: ProfilePage,
});

const DISTANCE_OPTIONS = [
  { value: 5, label: "5 miles" },
  { value: 10, label: "10 miles" },
  { value: 25, label: "25 miles" },
  { value: 50, label: "50 miles" },
  { value: 100, label: "100 miles" },
  { value: 250, label: "250 miles" },
];

interface PhotoItem {
  id: number;
  photo_path: string;
  sort_order: number;
  is_primary: boolean;
}

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
  const [editPhotos, setEditPhotos] = useState<PhotoItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const successTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Location edit state
  const [editZipCode, setEditZipCode] = useState("");
  const [editMaxDistance, setEditMaxDistance] = useState(50);
  const [lookingUp, setLookingUp] = useState(false);
  const [editLocationResult, setEditLocationResult] = useState<{
    lat: number;
    lng: number;
    city: string;
    state: string;
  } | null>(null);
  const [locationError, setLocationError] = useState("");

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
    setEditPhotos(
      user.photos
        ? [...user.photos].sort((a, b) => {
            if (a.is_primary) return -1;
            if (b.is_primary) return 1;
            return a.sort_order - b.sort_order;
          })
        : []
    );
    setUploadingIdx(null);
    setDeletingId(null);
    setEditZipCode("");
    setEditMaxDistance(user.max_distance || 50);
    setEditLocationResult(
      user.location_city && user.location_state
        ? { lat: user.latitude || 0, lng: user.longitude || 0, city: user.location_city, state: user.location_state }
        : null,
    );
    setLocationError("");
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

  const handleUploadToSlot = async (slotIndex: number, file: File) => {
    setUploadingIdx(slotIndex);
    setSaveError("");
    try {
      const formData = new FormData();
      formData.append("photo", file);
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error || "Upload failed");
        return;
      }
      setEditPhotos((prev) => [...prev, data.photo]);
    } catch {
      setSaveError("Photo upload failed. Please try again.");
    } finally {
      setUploadingIdx(null);
    }
  };

  const handleDeletePhoto = async (photoId: number) => {
    setDeletingId(photoId);
    setSaveError("");
    try {
      const res = await fetch(`/api/photos/${photoId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setSaveError(data?.error || "Failed to delete photo");
        return;
      }
      setEditPhotos((prev) => prev.filter((p) => p.id !== photoId));
    } catch {
      setSaveError("Failed to delete photo. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleSetPrimary = async (photoId: number) => {
    setSaveError("");
    try {
      const res = await fetch(`/api/photos/${photoId}/primary`, {
        method: "PUT",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setSaveError(data?.error || "Failed to set primary photo");
        return;
      }
      setEditPhotos((prev) =>
        prev
          .map((p) => ({ ...p, is_primary: p.id === photoId }))
          .sort((a, b) => {
            if (a.is_primary) return -1;
            if (b.is_primary) return 1;
            return a.sort_order - b.sort_order;
          })
      );
    } catch {
      setSaveError("Network error. Please try again.");
    }
  };

  const handleZipLookup = async () => {
    const trimmed = editZipCode.trim();
    if (!trimmed || trimmed.length < 5) {
      setLocationError("Enter a valid 5-digit ZIP code");
      return;
    }

    setLookingUp(true);
    setLocationError("");
    try {
      const res = await fetch("/api/location/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zip: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLocationError(data.error || "Invalid ZIP code");
        setEditLocationResult(null);
        return;
      }
      setEditLocationResult({ lat: data.lat, lng: data.lng, city: data.city, state: data.state });
      setLocationError("");
    } catch {
      setLocationError("Network error. Please try again.");
    } finally {
      setLookingUp(false);
    }
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
      await refetch();
      navigate({ to: "/" });
    } catch {
      setDeleting(false);
    }
  };

  const handleSave = async () => {
    setSaveError("");
    setSaveSuccess(false);

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

    try {
      const primaryPhoto = editPhotos.find((p) => p.is_primary);
      const payload: Record<string, unknown> = {
        display_name: editName.trim(),
        age: ageNum,
        gender: editGender,
        looking_for: editLookingFor,
        bio: editBio.trim(),
        photo_path: primaryPhoto?.photo_path || user?.photo_path || "",
        max_distance: editMaxDistance,
      };

      if (editLocationResult) {
        payload.latitude = editLocationResult.lat;
        payload.longitude = editLocationResult.lng;
        payload.location_city = editLocationResult.city;
        payload.location_state = editLocationResult.state;
      }

      const res = await fetch("/api/auth/update-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error || "Failed to save profile");
        return;
      }

      await refetch();
      setSaveSuccess(true);
      setEditing(false);

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

  // Current photo to display (view mode)
  const displayPhoto = user.photo_path;
  const photoCount = user.photos?.length || (user.photo_path ? 1 : 0);
  const totalSlots = 6;

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
        {/* ── Photo Section ── */}
        <div className="mb-8 flex flex-col items-center">
          {/* View mode: main photo + count badge */}
          {!editing && (
            <div className="relative">
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
              {photoCount > 0 && (
                <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-rose-500 text-xs font-bold text-white ring-2 ring-gray-950">
                  {photoCount}
                </span>
              )}
            </div>
          )}

          {/* Edit mode: 3×2 photo grid */}
          {editing && (
            <div className="w-full">
              <label className="mb-3 block text-sm font-medium text-gray-300">
                Photos ({editPhotos.length}/6)
              </label>
              <div className="grid grid-cols-3 gap-3">
                {Array.from({ length: totalSlots }).map((_, i) => {
                  const photo = editPhotos[i] || null;
                  const isPlaceholder = i >= editPhotos.length;

                  if (isPlaceholder) {
                    return (
                      <label
                        key={`slot-${i}`}
                        className="relative flex aspect-[3/4] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-600 bg-gray-800/50 transition hover:border-rose-500/50 hover:bg-gray-800"
                      >
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              handleUploadToSlot(i, file);
                            }
                            e.target.value = "";
                          }}
                        />
                        <svg
                          className="mb-1 h-6 w-6 text-gray-500"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 4v16m8-8H4"
                          />
                        </svg>
                        <span className="text-xs text-gray-500">Add Photo</span>
                      </label>
                    );
                  }

                  return (
                    <div
                      key={photo!.id}
                      className="relative aspect-[3/4] overflow-hidden rounded-xl bg-gray-800"
                    >
                      {uploadingIdx === i ? (
                        <div className="flex h-full w-full items-center justify-center">
                          <div className="loader-pulse" />
                        </div>
                      ) : (
                        <img
                          src={photo!.photo_path}
                          alt={`Photo ${i + 1}`}
                          className="h-full w-full object-cover"
                        />
                      )}

                      {/* Star badge (primary toggle) */}
                      <button
                        type="button"
                        disabled={deletingId === photo!.id}
                        onClick={() => handleSetPrimary(photo!.id)}
                        className={`absolute left-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-sm transition hover:bg-black/70 ${
                          photo!.is_primary
                            ? "text-amber-400"
                            : "text-gray-400"
                        }`}
                        title={photo!.is_primary ? "Primary photo" : "Set as primary"}
                      >
                        ★
                      </button>

                      {/* Delete button */}
                      {deletingId === photo!.id ? (
                        <div className="absolute right-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-black/50">
                          <div className="h-3 w-3 animate-spin rounded-full border-2 border-red-400 border-t-transparent" />
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleDeletePhoto(photo!.id)}
                          className="absolute right-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-xs text-white/80 transition hover:bg-red-500/70 hover:text-white"
                          title="Remove photo"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="mt-1.5 text-xs text-gray-500">
                Upload up to 6 photos. Tap the ★ to set your primary photo.
              </p>
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
            {/* Upsell: Boost Profile */}
            <div className="mt-4">
              <Link
                to="/store"
                className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-xs font-medium text-amber-400 transition hover:bg-amber-500/20"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                </svg>
                Boost Profile — $3.99
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

            {/* Location Section (Edit Mode) */}
            <div className="rounded-lg border border-white/5 bg-gray-800/30 p-4">
              <h3 className="mb-3 text-sm font-semibold text-gray-300">📍 Location</h3>

              {/* Current location display */}
              {editLocationResult && (
                <p className="mb-3 text-sm text-emerald-400">
                  📍 {editLocationResult.city}, {editLocationResult.state}
                  {" "}
                  <button
                    type="button"
                    onClick={() => {
                      setEditLocationResult(null);
                      setEditZipCode("");
                    }}
                    className="text-xs text-gray-500 underline hover:text-gray-300"
                  >
                    (change)
                  </button>
                </p>
              )}

              {/* ZIP Code + Lookup */}
              <div className="flex gap-2">
                <div className="flex-1">
                  <label htmlFor="editZipCode" className="mb-1 block text-xs text-gray-500">
                    ZIP Code
                  </label>
                  <input
                    id="editZipCode"
                    type="text"
                    maxLength={5}
                    value={editZipCode}
                    onChange={(e) => {
                      setEditZipCode(e.target.value.replace(/[^0-9]/g, ""));
                      setEditLocationResult(null);
                      setLocationError("");
                    }}
                    onBlur={() => {
                      if (editZipCode.length === 5 && !editLocationResult) {
                        handleZipLookup();
                      }
                    }}
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-gray-100 placeholder-gray-500 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                    placeholder="e.g. 90210"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={handleZipLookup}
                    disabled={lookingUp || editZipCode.length < 5}
                    className="rounded-lg border border-gray-600 px-4 py-2.5 text-sm text-gray-300 transition hover:border-rose-500/50 hover:text-white disabled:opacity-50"
                  >
                    {lookingUp ? "..." : "Lookup"}
                  </button>
                </div>
              </div>

              {locationError && (
                <p className="mt-1.5 text-xs text-red-400">{locationError}</p>
              )}

              {/* Max Distance */}
              <div className="mt-4">
                <label htmlFor="editMaxDistance" className="mb-1 block text-xs text-gray-500">
                  Maximum Distance
                </label>
                <select
                  id="editMaxDistance"
                  value={editMaxDistance}
                  onChange={(e) => setEditMaxDistance(Number(e.target.value))}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-gray-100 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                >
                  {DISTANCE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={handleCancelEdit}
                disabled={saving || uploadingIdx !== null || deletingId !== null}
                className="flex-1 rounded-full border border-gray-600 px-6 py-2.5 text-sm font-semibold text-gray-300 transition hover:border-gray-500 hover:text-white disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || uploadingIdx !== null || deletingId !== null}
                className="flex-1 rounded-full bg-rose-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Changes"}
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
                  Location
                </span>
                {user.location_city && user.location_state ? (
                  <p className="mt-1 text-gray-300">
                    📍 {user.location_city}, {user.location_state}
                    <span className="ml-2 text-xs text-gray-500">
                      (within {user.max_distance || 50} miles)
                    </span>
                  </p>
                ) : (
                  <p className="mt-1 text-gray-500">
                    Not set —{" "}
                    <button
                      onClick={handleEnterEdit}
                      className="underline transition hover:text-rose-400"
                    >
                      add your location
                    </button>{" "}
                    to see nearby matches
                  </p>
                )}
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
