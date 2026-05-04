import { next } from "@vercel/functions";

export const config = {
  matcher: "/s/:path*",
};

/** Crawlers and preview services that read OG tags without running the SPA. */
const LINK_PREVIEW_UA =
  /facebookexternalhit|Facebot|Twitterbot|Slackbot|LinkedInBot|WhatsApp|Discordbot|TelegramBot|Pinterest|Googlebot|BingPreview|bingbot|Slack-ImgProxy|Applebot|Embedly|Quora Link Preview|Slackbot-LinkExpanding|SkypeUriPreview|vkShare|redditbot|Amazonbot|GPTBot|meta-externalagent|Bytespider|IAB-Tapit|OpenGraph|WebThumbnail|BrandVerity|PerplexityBot|Claude-Web|anthropic-ai|Summaly/i;

interface ShareEvent {
  name: string;
  theme: string | null;
  description: string | null;
  starts_at: string | null;
}

interface SharePayload {
  event: ShareEvent;
}

function wantsLinkerPreview(request: Request): boolean {
  const url = new URL(request.url);
  if (url.searchParams.get("__og") === "1") return true;
  const ua = request.headers.get("user-agent") ?? "";
  return LINK_PREVIEW_UA.test(ua);
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/\r|\n/g, " ");
}

function formatEventSnippet(iso: string | null | undefined): string {
  if (!iso) return "Date TBD";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Date TBD";
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function supabaseEnv(): { url: string; anonKey: string } | null {
  const url = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "").trim();
  const anonKey = (
    process.env.VITE_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    ""
  ).trim();
  if (!url || !anonKey) return null;
  return { url: url.replace(/\/$/, ""), anonKey };
}

async function fetchPublicShare(token: string): Promise<SharePayload | null> {
  const env = supabaseEnv();
  if (!env) return null;

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
}

function canonicalShareUrl(request: Request, token: string): string {
  const base = (process.env.VITE_PUBLIC_SITE_URL ?? "").replace(/\/$/, "").trim();
  if (base) return `${base}/s/${token}`;
  const u = new URL(request.url);
  return `${u.origin}/s/${token}`;
}

function ogImageUrl(request: Request): string {
  const base = (process.env.VITE_PUBLIC_SITE_URL ?? "").replace(/\/$/, "").trim();
  if (base) return `${base}/party.svg`;
  const u = new URL(request.url);
  return `${u.origin}/party.svg`;
}

function buildLinkerPreviewHtml(
  request: Request,
  token: string,
  payload: SharePayload | null,
): string {
  const canonicalUrl = canonicalShareUrl(request, token);
  const imageUrl = ogImageUrl(request);

  if (!payload) {
    const title = "Party Planner — Share link";
    const description = "Plan parties together. This invite may be unavailable or expired.";
    const safeTitle = escapeHtmlAttr(title);
    const safeDesc = escapeHtmlAttr(description);
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${safeTitle}</title>
<meta name="description" content="${safeDesc}" />
<meta property="og:title" content="${safeTitle}" />
<meta property="og:description" content="${safeDesc}" />
<meta property="og:type" content="website" />
<meta property="og:url" content="${escapeHtmlAttr(canonicalUrl)}" />
<meta property="og:image" content="${escapeHtmlAttr(imageUrl)}" />
<meta name="twitter:card" content="summary" />
<meta name="twitter:title" content="${safeTitle}" />
<meta name="twitter:description" content="${safeDesc}" />
<link rel="canonical" href="${escapeHtmlAttr(canonicalUrl)}" />
</head>
<body></body>
</html>`;
  }

  const { event } = payload;
  const title = `${event.name} · Party Planner`;
  const description =
    [event.theme, formatEventSnippet(event.starts_at)].filter(Boolean).join(" · ") ||
    (event.description?.trim() ? event.description.trim().slice(0, 280) : `RSVP and details for ${event.name}`);

  const safeTitle = escapeHtmlAttr(title);
  const safeDesc = escapeHtmlAttr(description.slice(0, 500));

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${safeTitle}</title>
<meta name="description" content="${safeDesc}" />
<meta property="og:title" content="${safeTitle}" />
<meta property="og:description" content="${safeDesc}" />
<meta property="og:type" content="website" />
<meta property="og:url" content="${escapeHtmlAttr(canonicalUrl)}" />
<meta property="og:image" content="${escapeHtmlAttr(imageUrl)}" />
<meta name="twitter:card" content="summary" />
<meta name="twitter:title" content="${safeTitle}" />
<meta name="twitter:description" content="${safeDesc}" />
<link rel="canonical" href="${escapeHtmlAttr(canonicalUrl)}" />
</head>
<body></body>
</html>`;
}

export default async function middleware(request: Request): Promise<Response> {
  if (!wantsLinkerPreview(request)) {
    return next();
  }

  const url = new URL(request.url);
  const match = url.pathname.match(/^\/s\/([^/]+)/);
  const raw = match?.[1];
  const token = raw ? decodeURIComponent(raw) : undefined;
  if (!token) {
    return next();
  }

  try {
    const payload = await fetchPublicShare(token);
    const html = buildLinkerPreviewHtml(request, token, payload);
    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600",
      },
    });
  } catch {
    return next();
  }
}
