/**
 * Per-event dynamic Open Graph image.
 *
 *   GET /api/og?token=<share_token>
 *
 * Renders a 1200x630 PNG keyed off the share-token's event details. Falls
 * back to the brand card (`public/og-image.png`) when the token is missing,
 * the RPC fails, or `@vercel/og` is unavailable. The Edge middleware
 * (`middleware.ts`) points `og:image` at this route for `/s/<token>` link
 * previews so iMessage / Slack / Twitter / Facebook all unfurl with a
 * personalised hero.
 *
 * Runtime: Node.js (Vercel's current recommended runtime for @vercel/og as
 * of 2026 — see https://vercel.com/docs/functions/og-image-generation). The
 * Edge runtime caused the deploy validator to grab @vercel/og into the
 * middleware bundle, which middleware can't carry. Defaulting to Node here
 * cleanly separates the two bundles.
 */
import { ImageResponse } from "@vercel/og";

interface ShareEvent {  name: string;
  theme: string | null;
  description: string | null;
  starts_at: string | null;
  cover_emoji?: string | null;
  cover_color?: string | null;
  cover_image_url?: string | null;
}

interface SharePayload {
  event: ShareEvent;
}

const FALLBACK_GRADIENT_START = "#6366f1";
const FALLBACK_GRADIENT_END = "#a855f7";
const ACCENT = "#facc15";

/** Strip leading `#` and lowercase a 6-char hex string. Returns null on
 *  anything else so the caller can fall back to brand defaults instead of
 *  rendering a malformed gradient. */
function normalizeHex(input: string | null | undefined): string | null {
  if (!input) return null;
  const m = input.trim().match(/^#?([0-9a-fA-F]{6})$/);
  return m ? `#${m[1].toLowerCase()}` : null;
}

/** Lighten a 6-char hex by mixing toward white. Used to produce the
 *  endpoint of the per-event gradient when only `cover_color` is known. */
function lightenHex(hex: string, amount = 0.35): string {
  const m = hex.match(/^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/);
  if (!m) return hex;
  const mix = (channel: string) => {
    const v = parseInt(channel, 16);
    const lifted = Math.round(v + (255 - v) * amount);
    return Math.max(0, Math.min(255, lifted)).toString(16).padStart(2, "0");
  };
  return `#${mix(m[1])}${mix(m[2])}${mix(m[3])}`;
}

function formatEventDate(iso: string | null | undefined): string {
  if (!iso) return "Date TBA";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Date TBA";
  return d.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function supabaseEnv(): { url: string; anonKey: string } | null {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env ?? {};
  const url = (env.VITE_SUPABASE_URL ?? env.SUPABASE_URL ?? "").trim();
  const anonKey = (env.VITE_SUPABASE_ANON_KEY ?? env.SUPABASE_ANON_KEY ?? "").trim();
  if (!url || !anonKey) return null;
  return { url: url.replace(/\/$/, ""), anonKey };
}

async function fetchPublicShare(token: string): Promise<SharePayload | null> {
  const env = supabaseEnv();
  if (!env) return null;
  try {
    const res = await fetch(`${env.url}/rest/v1/rpc/get_public_event_share`, {
      method: "POST",
      headers: {
        apikey: env.anonKey,
        Authorization: `Bearer ${env.anonKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ _token: token }),
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (!data || typeof data !== "object" || data === null || !("event" in data)) {
      return null;
    }
    const ev = (data as { event: unknown }).event;
    if (!ev || typeof ev !== "object" || ev === null || !("name" in ev)) {
      return null;
    }
    return data as SharePayload;
  } catch {
    return null;
  }
}

/** Base64 without `Buffer` so Vercel's API-route typecheck succeeds (≤ ~6MiB blobs). */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

async function fetchOgCoverDataUrl(url: string): Promise<string | null> {
  const trimmed = url.trim();
  if (!trimmed.startsWith("https://")) return null;
  try {
    const res = await fetch(trimmed);
    if (!res.ok) return null;
    const ct = (res.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!ct.startsWith("image/")) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > 6 * 1024 * 1024) return null;
    return `data:${ct};base64,${uint8ArrayToBase64(bytes)}`;
  } catch {
    return null;
  }
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";

  let payload: SharePayload | null = null;
  if (token) {
    payload = await fetchPublicShare(token);
  }

  const event = payload?.event;
  const eventName = event?.name?.trim() || "You're invited";
  const dateLine = formatEventDate(event?.starts_at);
  const themeLine = event?.theme?.trim() ?? "";
  const emoji = event?.cover_emoji?.trim() || "🎉";

  const coverHex = normalizeHex(event?.cover_color);
  const gradStart = coverHex ?? FALLBACK_GRADIENT_START;
  const gradEnd = coverHex ? lightenHex(coverHex, 0.45) : FALLBACK_GRADIENT_END;

  const coverPhotoDataUrl = event?.cover_image_url
    ? await fetchOgCoverDataUrl(event.cover_image_url)
    : null;

  // Truncate to keep Satori from breaking layout on very long names. The
  // OG box is 1200 wide — ~24 chars at 96px feels right with the chosen
  // letter-spacing; longer falls back to ellipsis.
  const displayName = eventName.length > 48 ? `${eventName.slice(0, 47)}…` : eventName;

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          background: `linear-gradient(135deg, ${gradStart} 0%, ${gradEnd} 100%)`,
          color: "white",
          padding: "72px 88px",
          fontFamily: "system-ui, -apple-system, Segoe UI, Inter, sans-serif",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: coverPhotoDataUrl ? 0 : 80,
            right: coverPhotoDataUrl ? 0 : 96,
            bottom: coverPhotoDataUrl ? 0 : undefined,
            width: coverPhotoDataUrl ? 520 : undefined,
            fontSize: coverPhotoDataUrl ? undefined : 220,
            opacity: coverPhotoDataUrl ? 1 : 0.85,
            display: "flex",
          }}
        >
          {coverPhotoDataUrl ? (
            <img
              src={coverPhotoDataUrl}
              alt=""
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          ) : (
            emoji
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16, opacity: 0.92 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: "rgba(255,255,255,0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 32,
            }}
          >
            🎉
          </div>
          <div style={{ fontSize: 32, fontWeight: 600, letterSpacing: -0.5 }}>
            Party Planner
          </div>
        </div>

        <div
          style={{
            marginTop: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 18,
            paddingRight: coverPhotoDataUrl ? 560 : 320,
          }}
        >
          <div
            style={{
              fontSize: 92,
              fontWeight: 800,
              letterSpacing: -2,
              lineHeight: 1.05,
              display: "flex",
            }}
          >
            {displayName}
          </div>
          <div
            style={{
              fontSize: 36,
              fontWeight: 500,
              opacity: 0.92,
              display: "flex",
              alignItems: "center",
              gap: 16,
            }}
          >
            <span>{dateLine}</span>
            {themeLine && (
              <>
                <span style={{ opacity: 0.6 }}>·</span>
                <span>{themeLine}</span>
              </>
            )}
          </div>
          <div
            style={{
              fontSize: 26,
              fontWeight: 500,
              opacity: 0.85,
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginTop: 12,
            }}
          >
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: 6,
                background: ACCENT,
              }}
            />
            RSVP, view the menu, add to your calendar — one link.
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        // Crawlers (Slack, Twitter, Facebook) cache OG images aggressively;
        // we mirror that with a 5min edge cache + 1h SWR so an event
        // rename / cover-color tweak propagates within minutes without
        // hammering the RPC.
        "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=3600",
      },
    }
  );
}
