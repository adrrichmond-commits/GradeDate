import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useAuth } from "~/auth-context";
import { useRequireSubscription } from "~/subscription-guard";

export const Route = createFileRoute("/profile/setup")({
  component: ProfileSetup,
});

function ProfileSetup() {
  const navigate = useNavigate();
  const { user, loading, refetch } = useAuth();
  const { isSubscribed, checking } = useRequireSubscription();
  const [displayName, setDisplayName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [bio, setBio] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/login" });
    }
  }, [loading, user]);

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

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const handleUploadPhoto = async (): Promise<string | null> => {
    if (!photoFile) return null;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("photo", photoFile);
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Upload failed");
        return null;
      }
      return data.photo_path;
    } catch {
      setError("Photo upload failed. Please try again.");
      return null;
    } finally {
      setUploading(false);
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

    setSubmitting(true);

    // Upload photo first if one was selected
    let photoPath = user.photo_path;
    if (photoFile) {
      const uploadedPath = await handleUploadPhoto();
      if (uploadedPath) {
        photoPath = uploadedPath;
      } else {
        setSubmitting(false);
        return;
      }
    }

    // Save profile via API
    try {
      const res = await fetch("/api/auth/update-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: displayName.trim(),
          age: ageNum,
          gender,
          bio: bio.trim(),
          photo_path: photoPath,
        }),
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

  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4 py-8">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <span className="mb-4 inline-block rounded-full bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-400">
            STEP 2
          </span>
          <h1 className="text-3xl font-bold">Set Up Your Profile</h1>
          <p className="mt-2 text-gray-400">
            Tell us about yourself and upload a selfie for grading.
          </p>
        </div>

        <div className="rounded-2xl border border-white/5 bg-gray-900/60 p-8 backdrop-blur-sm">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
                {error}
              </div>
            )}

            {/* Photo Upload */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-300">
                Profile Photo (Selfie for Grading)
              </label>
              <div className="flex items-center gap-4">
                {photoPreview ? (
                  <img
                    src={photoPreview}
                    alt="Preview"
                    className="h-24 w-24 rounded-full object-cover ring-3 ring-rose-500/15 ring-offset-2 ring-offset-gray-950"
                  />
                ) : user.photo_path ? (
                  <img
                    src={user.photo_path}
                    alt="Current"
                    className="h-24 w-24 rounded-full object-cover ring-3 ring-rose-500/15 ring-offset-2 ring-offset-gray-950"
                  />
                ) : (
                  <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gray-800 text-gray-500">
                    <svg
                      className="h-10 w-10"
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
                <label className="cursor-pointer rounded-lg border border-gray-600 px-4 py-2.5 text-sm text-gray-300 transition hover:border-rose-500/50 hover:text-white">
                  {photoPreview || user.photo_path ? "Change Photo" : "Upload Selfie"}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoChange}
                    className="hidden"
                  />
                </label>
              </div>
              <p className="mt-1.5 text-xs text-gray-500">
                A clear face photo works best for accurate grading.
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

            <button
              type="submit"
              disabled={submitting || uploading}
              className="w-full rounded-full bg-rose-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:opacity-50"
            >
              {uploading
                ? "Uploading photo..."
                : submitting
                  ? "Saving..."
                  : "Save Profile"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
