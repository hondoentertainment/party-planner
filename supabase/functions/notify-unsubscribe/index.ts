// Supabase Edge Function: notify-unsubscribe
//
// One-click email unsubscribe endpoint. Accepts `GET /?token=...` so that
// every email client (including text-only / no-JS) can hit it from the link
// in our reminder footer. Deploy with `--no-verify-jwt` because the recipient
// is anonymous when they click — the HMAC token IS the auth.
//
// Flow:
//   1. Verify the HMAC-SHA-256 signed token (see _shared/unsubscribe-token.ts).
//      The token encodes (user_id, kind, expires_at). Tokens older than 30d
//      are rejected with a friendly error.
//   2. Call `public.upsert_notification_opt_out(user_id, kind)` via the
//      service-role client. The RPC is SECURITY DEFINER + ON CONFLICT DO
//      NOTHING, so repeated clicks (Gmail link prefetcher, scanners, etc.)
//      are idempotent.
//   3. Return a small inline-styled HTML page so the link works as a real
//      browser destination — no JSON-only response, no client-side JS.
//
// Required secrets:
//   UNSUBSCRIBE_TOKEN_SECRET (>= 32 bytes; `openssl rand -hex 32`)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-provided by Supabase)
//   APP_URL (used for the "back to settings" link in the success / error pages)

// @ts-expect-error Deno
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
// @ts-expect-error Deno
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { verifyToken, type UnsubscribeKind } from "../_shared/unsubscribe-token.ts";
import { log } from "../_shared/log.ts";

const FN = "notify-unsubscribe";

declare const Deno: { env: { get(name: string): string | undefined } };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_URL = Deno.env.get("APP_URL") ?? "https://party-planner.vercel.app";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function checkRequiredEnv(): string | null {
  const required: Array<[string, string | undefined]> = [
    ["SUPABASE_URL", SUPABASE_URL],
    ["SUPABASE_SERVICE_ROLE_KEY", SERVICE_ROLE],
  ];
  for (const [name, value] of required) {
    if (!value) {
      log({ level: "error", fn: FN, event: "config.missing_env", context: { var: name } });
      return name;
    }
  }
  return null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const KIND_LABEL: Record<UnsubscribeKind, string> = {
  pre_7d: "the 7-days-out reminder",
  pre_3d: "the 3-days-out reminder",
  pre_1d: "the day-before reminder",
  wrap_up_1d: "the post-party wrap-up nudge",
  all: "every Party Planner reminder",
};

function htmlPage(opts: {
  status: number;
  emoji: string;
  heading: string;
  body: string;
  ctaLabel?: string;
  ctaHref?: string;
}): Response {
  const cta =
    opts.ctaLabel && opts.ctaHref
      ? `<p style="margin:24px 0 0;">
          <a href="${opts.ctaHref}" style="display:inline-block;background:#cc38f5;color:white;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;">${escapeHtml(opts.ctaLabel)}</a>
        </p>`
      : "";

  const html = `<!doctype html>
<html><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(opts.heading)}</title>
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;padding:24px;margin:0;">
  <div style="max-width:520px;margin:48px auto;background:white;border-radius:12px;padding:32px;box-shadow:0 4px 20px rgba(0,0,0,0.05);">
    <div style="font-size:40px;line-height:1;margin-bottom:12px;">${escapeHtml(opts.emoji)}</div>
    <h1 style="font-size:22px;margin:0 0 8px;color:#0f172a;">${escapeHtml(opts.heading)}</h1>
    <p style="color:#475569;margin:0;line-height:1.5;">${opts.body}</p>
    ${cta}
  </div>
</body></html>`;

  return new Response(html, {
    status: opts.status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

serve(async (req: Request) => {
  try {
    if (req.method !== "GET" && req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const missingEnv = checkRequiredEnv();
    if (missingEnv) {
      return htmlPage({
        status: 500,
        emoji: "🛠️",
        heading: "Server misconfigured",
        body: "We couldn't process your request right now. Please try again in a moment.",
      });
    }

    const url = new URL(req.url);
    const token = url.searchParams.get("token") ?? "";

    let parsed;
    try {
      parsed = await verifyToken(token);
    } catch (err) {
      const message = (err as Error).message ?? "Invalid token.";
      log({
        level: "warn",
        fn: FN,
        event: "token.verify_failed",
        error: message,
      });
      return htmlPage({
        status: 400,
        emoji: "⚠️",
        heading: "We couldn't unsubscribe you",
        body: `${escapeHtml(message)} You can still manage your email preferences from your account settings.`,
        ctaLabel: "Open settings",
        ctaHref: `${APP_URL}/settings#notifications`,
      });
    }

    try {
      const { error } = await supabase.rpc("upsert_notification_opt_out", {
        _user_id: parsed.userId,
        _kind: parsed.kind,
      });
      if (error) throw error;
    } catch (err) {
      console.error("[notify-unsubscribe] upsert failed:", (err as Error).message);
      log({
        level: "error",
        fn: FN,
        event: "rpc.upsert_notification_opt_out_failed",
        error: (err as Error).message,
        context: { user_id: parsed.userId, kind: parsed.kind },
      });
      return htmlPage({
        status: 500,
        emoji: "🛠️",
        heading: "Something went wrong",
        body:
          "We couldn't save your unsubscribe preference. Please try again in a moment, or update your preferences directly from your account settings.",
        ctaLabel: "Open settings",
        ctaHref: `${APP_URL}/settings#notifications`,
      });
    }

    log({
      level: "info",
      fn: FN,
      event: "run.complete",
      context: { user_id: parsed.userId, kind: parsed.kind, sent: 0, failed: 0, skipped: 0, opt_out: 1 },
    });

    const label = KIND_LABEL[parsed.kind] ?? "these reminders";
    return htmlPage({
      status: 200,
      emoji: "✅",
      heading: "You're unsubscribed",
      body: `You won't get ${escapeHtml(label)} from Party Planner anymore. You can re-enable them anytime from your account settings.`,
      ctaLabel: "Manage email preferences",
      ctaHref: `${APP_URL}/settings#notifications`,
    });
  } catch (err) {
    log({ level: "error", fn: FN, event: "uncaught", error: String(err) });
    throw err;
  }
});
