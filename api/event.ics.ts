/**
 * Subscribable per-event calendar feed.
 *
 *   GET /api/event.ics?token=<share_token>
 *
 * Returns a text/calendar response keyed off an existing public share token,
 * so users can paste `webcal://<host>/api/event.ics?token=<token>` into
 * Apple Calendar / Google Calendar / Outlook and have the event update
 * automatically when the host renames it, moves the date, or attaches a
 * Partiful link. No new DB tables — we reuse the same `get_public_event_share`
 * RPC the public RSVP page calls, so the feed inherits the existing
 * "share link enabled / not revoked" semantics for free.
 *
 * Runtime: Edge.
 */

export const config = {
  runtime: "edge",
};

interface ShareEvent {
  id?: string;
  name: string;
  starts_at: string | null;
  ends_at: string | null;
  description: string | null;
  location: string | null;
  partiful_url?: string | null;
}

interface SharePayload {
  event: ShareEvent;
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

function icsEscape(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function foldIcsLine(line: string): string {
  if (line.length <= 75) return line;
  const out: string[] = [];
  let rest = line;
  while (rest.length > 75) {
    out.push(rest.slice(0, 75));
    rest = " " + rest.slice(75);
  }
  if (rest) out.push(rest);
  return out.join("\r\n");
}

function formatUtcIcsDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  const s = String(d.getUTCSeconds()).padStart(2, "0");
  return `${y}${m}${day}T${h}${min}${s}Z`;
}

function formatAllDayIcsDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function buildIcs(event: ShareEvent, token: string): string {
  const now = new Date();
  const stamp = formatUtcIcsDate(now);
  const uid = `${event.id ?? token}@party-planner.local`;

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Party Planner//Subscribable Feed//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsEscape(event.name)}`,
    "X-PUBLISHED-TTL:PT15M",
    "REFRESH-INTERVAL;VALUE=DURATION:PT15M",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
  ];

  if (event.starts_at) {
    const start = new Date(event.starts_at);
    const end = event.ends_at
      ? new Date(event.ends_at)
      : new Date(start.getTime() + 3 * 60 * 60 * 1000);
    lines.push(`DTSTART:${formatUtcIcsDate(start)}`, `DTEND:${formatUtcIcsDate(end)}`);
  } else {
    const day = formatAllDayIcsDate(now);
    const next = new Date(now);
    next.setUTCDate(next.getUTCDate() + 1);
    lines.push(`DTSTART;VALUE=DATE:${day}`, `DTEND;VALUE=DATE:${formatAllDayIcsDate(next)}`);
  }

  lines.push(`SUMMARY:${icsEscape(event.name)}`);
  if (event.location) lines.push(`LOCATION:${icsEscape(event.location)}`);

  const descParts = [
    event.description?.trim() || null,
    event.partiful_url ? `Partiful: ${event.partiful_url}` : null,
  ].filter((p): p is string => Boolean(p));
  if (descParts.length > 0) {
    lines.push(`DESCRIPTION:${icsEscape(descParts.join("\n"))}`);
  }

  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";

  if (!token) {
    return new Response("missing token", {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const payload = await fetchPublicShare(token);
  if (!payload) {
    return new Response("share link not found or revoked", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const ics = buildIcs(payload.event, token);

  return new Response(ics, {
    status: 200,
    headers: {
      // RFC 5545 type. Some clients (Apple Calendar) accept either
      // text/calendar or text/x-vcalendar; the former is the standard.
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${
        payload.event.name.replace(/[/\\?%*:|"<>]/g, "-").slice(0, 80) || "event"
      }.ics"`,
      // Subscribers refresh on the client schedule. 15 minutes lets a host's
      // rename / time change land within "soon" while still letting the
      // edge cache absorb the bulk of the polling load.
      "Cache-Control": "public, max-age=60, s-maxage=900, stale-while-revalidate=3600",
    },
  });
}
