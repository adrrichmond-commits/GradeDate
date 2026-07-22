import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "~/auth-context";
import { getCsrfToken } from "~/csrf-client";
import { useRequireSubscription } from "~/subscription-guard";

export const Route = createFileRoute("/profile/setup")({
  component: ProfileSetup,
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

function ProfileSetup() {
  const navigate = useNavigate();
  const { user, loading, refetch } = useAuth();
  const { isSubscribed, checking } = useRequireSubscription();
  const [displayName, setDisplayName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [lookingFor, setLookingFor] = useState("");
  const [bio, setBio] = useState("");
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Location fields
  const [zipCode, setZipCode] = useState("");
  const [maxDistance, setMaxDistance] = useState(50);
  const [lookingUp, setLookingUp] = useState(false);
  const [locationResult, setLocationResult] = useState<{
    lat: number;
    lng: number;
    city: string;
    state: string;
  } | null>(null);
  const [locationError, setLocationError] = useState("");

  // Refs to avoid stale closures in file input handlers
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/login" });
    }
  }, [loading, user]);

  // Load photos from user
  useEffect(() => {
    if (user?.photos) {
      setPhotos([...user.photos].sort((a, b) => {
        if (a.is_primary) return -1;
        if (b.is_primary) return 1;
        return a.sort_order - b.sort_order;
      }));
    }
  }, [user]);

  // Pre-fill location if user already has it set
  useEffect(() => {
    if (user) {
      if (user.location_city && user.location_state) {
        setLocationResult({
          lat: user.latitude || 0,
          lng: user.longitude || 0,
          city: user.location_city,
          state: user.location_state,
        });
        setZipCode(user.location_city ? "" : "");
      }
      if (user.max_distance) {
        setMaxDistance(user.max_distance);
      }
    }
  }, [user]);

  if (loading || checking) {
    return (
      <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4">
        <div className="flex flex-col items-center gap-4">
          <div className="loader-pulse" />
          <p className="text-sm text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user || !isSubscribed) return null;

  // If user already has a profile, redirect to profile page
  if (user.display_name && !submitting) {
    navigate({ to: "/profile" });
    return null;
  }

  const handleUploadToSlot = async (slotIndex: number, file: File) => {
    setUploadingIdx(slotIndex);
    setError("");
    try {
      const formData = new FormData();
      formData.append("photo", file);
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "X-CSRF-Token": getCsrfToken() || "" },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Upload failed");
        return;
      }
      // Append the returned photo to the grid
      const newPhoto: PhotoItem = data.photo;
      setPhotos((prev) => [...prev, newPhoto]);
    } catch {
      setError("Photo upload failed. Please try again.");
    } finally {
      setUploadingIdx(null);
    }
  };

  const handleDeletePhoto = async (photoId: number) => {
    setDeletingId(photoId);
    setError("");
    try {
      const res = await fetch(`/api/photos/${photoId}`, {
        method: "DELETE",
      headers: { "X-CSRF-Token": getCsrfToken() || "" },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || "Failed to delete photo");
        return;
      }
      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
    } catch {
      setError("Failed to delete photo. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleSetPrimary = async (photoId: number) => {
    setError("");
    try {
      const res = await fetch(`/api/photos/${photoId}/primary`, {
        method: "PUT",
      headers: { "X-CSRF-Token": getCsrfToken() || "" },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || "Failed to set primary photo");
        return;
      }
      setPhotos((prev) =>
        prev
          .map((p) => ({ ...p, is_primary: p.id === photoId }))
          .sort((a, b) => {
            if (a.is_primary) return -1;
            if (b.is_primary) return 1;
            return a.sort_order - b.sort_order;
          })
      );
    } catch {
      setError("Network error. Please try again.");
    }
  };

  const handleZipLookup = async () => {
    const trimmed = zipCode.trim();
    if (!trimmed || trimmed.length < 5) {
      setLocationError("Enter a valid 5-digit ZIP code");
      return;
    }

    setLookingUp(true);
    setLocationError("");
    try {
      const res = await fetch("/api/location/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() || "" },
        body: JSON.stringify({ zip: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLocationError(data.error || "Invalid ZIP code");
        setLocationResult(null);
        return;
      }
      setLocationResult({ lat: data.lat, lng: data.lng, city: data.city, state: data.state });
      setLocationError("");
    } catch {
      setLocationError("Network error. Please try again.");
    } finally {
      setLookingUp(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!displayName.trim()) {
      setError("Display name is required");
      return;
    }

    const ageNum = parseInt(age, 10);
    if (!age || isNaN(ageNum) || ageNum < 18 || ageNum > 120) {
      setError("Please enter a valid age (18-120)");
      return;
    }

    if (!gender) {
      setError("Please select your gender");
      return;
    }

    if (!lookingFor) {
      setError("Please select who you're looking for");
      return;
    }

    setSubmitting(true);

    // Save profile via API
    try {
      const primaryPhoto = photos.find((p) => p.is_primary);
      const payload: Record<string, unknown> = {
        display_name: displayName.trim(),
        age: ageNum,
        gender,
        looking_for: lookingFor,
        bio: bio.trim(),
        photo_path: primaryPhoto?.photo_path || user.photo_path || "",
        max_distance: maxDistance,
      };

      if (locationResult) {
        payload.latitude = locationResult.lat;
        payload.longitude = locationResult.lng;
        payload.location_city = locationResult.city;
        payload.location_state = locationResult.state;
      }

      const res = await fetch("/api/auth/update-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() || "" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save profile");
        return;
      }

      await refetch();
      navigate({ to: "/profile" });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const totalSlots = 6;
  const photoCount = photos.length;

  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4 py-8">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <span className="mb-4 inline-block rounded-full bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-400">
            STEP 2
          </span>
          <h1 className="text-3xl font-bold">Set Up Your Profile</h1>
          <p className="mt-2 text-gray-400">
            Tell us about yourself and upload photos for grading.
          </p>
        </div>

        <div className="rounded-2xl border border-white/5 bg-gray-900/60 p-8 backdrop-blur-sm">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
                {error}
              </div>
            )}

            {/* ── Multi-Photo Grid (3×2) ── */}
            <div>
              <label className="mb-3 block text-sm font-medium text-gray-300">
                Photos ({photoCount}/6)
              </label>
              <div className="grid grid-cols-3 gap-3">
                {Array.from({ length: totalSlots }).map((_, i) => {
                  const photo = photos[i] || null;
                  const isPlaceholder = i >= photoCount;

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
                          ref={(el) => {
                            fileInputRefs.current[i] = el;
                          }}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              handleUploadToSlot(i, file);
                            }
                            // Reset so the same file can be re-selected
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

            {/* Display Name */}
            <div>
              <label
                htmlFor="displayName"
                className="mb-1.5 block text-sm font-medium text-gray-300"
              >
                Display Name
              </label>
              <input
                id="displayName"
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-gray-100 placeholder-gray-500 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                placeholder="How you'll appear on GradeDate"
              />
            </div>

            {/* Age */}
            <div>
              <label
                htmlFor="age"
                className="mb-1.5 block text-sm font-medium text-gray-300"
              >
                Age
              </label>
              <input
                id="age"
                type="number"
                required
                min={18}
                max={120}
                value={age}
                onChange={(e) => setAge(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-gray-100 placeholder-gray-500 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                placeholder="18"
              />
            </div>

            {/* Gender */}
            <div>
              <label
                htmlFor="gender"
                className="mb-1.5 block text-sm font-medium text-gray-300"
              >
                Gender
              </label>
              <select
                id="gender"
                required
                value={gender}
                onChange={(e) => setGender(e.target.value)}
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
              <label
                htmlFor="lookingFor"
                className="mb-1.5 block text-sm font-medium text-gray-300"
              >
                Looking For
              </label>
              <select
                id="lookingFor"
                required
                value={lookingFor}
                onChange={(e) => setLookingFor(e.target.value)}
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
              <label
                htmlFor="bio"
                className="mb-1.5 block text-sm font-medium text-gray-300"
              >
                Bio
              </label>
              <textarea
                id="bio"
                rows={3}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-gray-100 placeholder-gray-500 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                placeholder="A few words about yourself..."
              />
            </div>

            {/* Location Section */}
            <div className="rounded-lg border border-white/5 bg-gray-800/30 p-4">
              <h3 className="mb-3 text-sm font-semibold text-gray-300">📍 Location</h3>

              {/* ZIP Code + Lookup */}
              <div className="flex gap-2">
                <div className="flex-1">
                  <label
                    htmlFor="zipCode"
                    className="mb-1 block text-xs text-gray-500"
                  >
                    ZIP Code
                  </label>
                  <input
                    id="zipCode"
                    type="text"
                    maxLength={5}
                    value={zipCode}
                    onChange={(e) => {
                      setZipCode(e.target.value.replace(/[^0-9]/g, ""));
                      setLocationResult(null);
                      setLocationError("");
                    }}
                    onBlur={() => {
                      if (zipCode.length === 5 && !locationResult) {
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
                    disabled={lookingUp || zipCode.length < 5}
                    className="rounded-lg border border-gray-600 px-4 py-2.5 text-sm text-gray-300 transition hover:border-rose-500/50 hover:text-white disabled:opacity-50"
                  >
                    {lookingUp ? "..." : "Lookup"}
                  </button>
                </div>
              </div>

              {locationError && (
                <p className="mt-1.5 text-xs text-red-400">{locationError}</p>
              )}

              {locationResult && (
                <p className="mt-2 text-sm text-emerald-400">
                  📍 {locationResult.city}, {locationResult.state}
                </p>
              )}

              {/* Max Distance */}
              <div className="mt-4">
                <label
                  htmlFor="maxDistance"
                  className="mb-1 block text-xs text-gray-500"
                >
                  Maximum Distance
                </label>
                <select
                  id="maxDistance"
                  value={maxDistance}
                  onChange={(e) => setMaxDistance(Number(e.target.value))}
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

            <button
              type="submit"
              disabled={submitting || uploadingIdx !== null || deletingId !== null}
              className="w-full rounded-full bg-rose-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:opacity-50"
            >
              {submitting
                ? "Saving..."
                : "Save Profile"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
