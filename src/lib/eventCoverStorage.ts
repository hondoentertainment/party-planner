/** Storage bucket + client validation for migration `0023_event_cover_photos.sql`. */
export const EVENT_COVERS_BUCKET = "event-covers" as const;

/** ~2 MiB — keeps hero uploads reasonable for mobile/cellular guests. */
export const EVENT_COVER_MAX_BYTES = 2 * 1024 * 1024;

export const EVENT_COVER_ACCEPT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export type EventCoverMime = (typeof EVENT_COVER_ACCEPT_TYPES)[number];

export function eventCoverExtForMime(mime: string): string | null {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return null;
  }
}

/** Parses `…/object/public/event-covers/<eventId>/<file>` into a storage path. */
export function eventCoverObjectPathFromPublicUrl(publicUrl: string): string | null {
  try {
    const u = new URL(publicUrl.trim());
    const marker = "/object/public/event-covers/";
    const i = u.pathname.indexOf(marker);
    if (i === -1) return null;
    return decodeURIComponent(u.pathname.slice(i + marker.length));
  } catch {
    return null;
  }
}

export function validateEventCoverFile(file: File): string | null {
  if (!EVENT_COVER_ACCEPT_TYPES.includes(file.type as EventCoverMime)) {
    return "Please choose a JPEG, PNG, WebP, or GIF image.";
  }
  if (file.size > EVENT_COVER_MAX_BYTES) {
    return `Cover images must be ${EVENT_COVER_MAX_BYTES / (1024 * 1024)} MB or smaller.`;
  }
  return null;
}
