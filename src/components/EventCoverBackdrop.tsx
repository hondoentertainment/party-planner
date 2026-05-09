import type { ReactNode } from "react";

/**
 * Shared hero/backdrop: optional full-bleed photo with a tint derived from
 * `cover_color`. When there is no photo, matches the previous emoji-only
 * gradient weighting.
 */
export function EventCoverBackdrop({
  coverColor,
  coverImageUrl,
  children,
  className = "",
}: {
  coverColor: string;
  coverImageUrl?: string | null;
  children: ReactNode;
  className?: string;
}) {
  const hasPhoto = Boolean(coverImageUrl?.trim());
  return (
    <div className={`relative overflow-hidden ${className}`}>
      {hasPhoto ? (
        <img
          src={coverImageUrl!.trim()}
          alt=""
          loading="lazy"
          decoding="async"
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          aria-hidden
        />
      ) : null}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: hasPhoto
            ? `linear-gradient(135deg, ${coverColor}aa, ${coverColor}dd)`
            : `linear-gradient(135deg, ${coverColor}33, ${coverColor}88)`,
        }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}
