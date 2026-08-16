import { useEffect, useState } from "react";

/**
 * Pure decision helper for which photo src to render.
 *
 * Returns the trimmed src when a photo should be shown, or null when the
 * gray person placeholder should be rendered instead (no path, an
 * empty/whitespace path, or the image already failed to load).
 */
export function resolvePhotoSrc(
  src: string | null | undefined,
  errored: boolean,
): string | null {
  if (errored) return null;
  if (typeof src !== "string") return null;
  const trimmed = src.trim();
  if (trimmed.length === 0) return null;
  return trimmed;
}

const PERSON_SVG_PATH =
  "M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z";

/**
 * User photo with graceful fallback.
 *
 * A user's photo_path can be an empty string (never uploaded), a local
 * `/uploads/...` path that only exists on the dev machine, or a blob URL
 * whose object was later deleted (photo delete, account deletion, cleanup).
 * Rendering any of those directly into an <img> makes the browser show its
 * broken-image icon. This component renders the same gray person placeholder
 * the app already uses for users without photos whenever the image is
 * missing or fails to load.
 */
export function UserPhoto({
  src,
  alt = "",
  className,
  imgClassName = "h-full w-full object-cover",
  placeholderClassName = "flex h-full w-full items-center justify-center text-gray-600",
  placeholderIconClassName = "h-7 w-7",
  draggable,
}: {
  src?: string | null;
  alt?: string;
  className?: string;
  imgClassName?: string;
  placeholderClassName?: string;
  placeholderIconClassName?: string;
  draggable?: boolean;
}) {
  const [errored, setErrored] = useState(false);
  // When the source changes (e.g. a different user's photo in a list), reset
  // the error state so a previously-failed image can load again.
  useEffect(() => {
    setErrored(false);
  }, [src]);
  const displaySrc = resolvePhotoSrc(src, errored);
  return (
    <div className={className}>
      {displaySrc ? (
        <img
          src={displaySrc}
          alt={alt}
          className={imgClassName}
          draggable={draggable}
          onError={() => setErrored(true)}
        />
      ) : (
        <div className={placeholderClassName}>
          <svg
            className={placeholderIconClassName}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d={PERSON_SVG_PATH}
            />
          </svg>
        </div>
      )}
    </div>
  );
}
