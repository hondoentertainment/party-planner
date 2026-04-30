// Supabase Edge Function: notify-share
// Email (Resend) the caller a copy of an event's public share link so they can forward it.
//
// Secrets: RESEND_API_KEY, FROM_EMAIL, APP_URL
// Auth: invoked by the Party Planner client with `supabase.functions.invoke`, which forwards
// the user's session JWT in the Authorization header. RLS on `events` enforces that only the
// owner (or a collaborator with read access) can request a share copy for an event they touch.

// @ts-expect-error Deno
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
// @ts-expect-error Deno
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

interface SharePayload {
  event_id: string;
  share_token: string;
}

declare const Deno: { env: { get(name: string): string | undefined } };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "Party Planner <onboarding@resend.dev>";
const APP_URL = Deno.env.get("APP_URL") ?? "https://party-planner.vercel.app";

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE);

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY) {
    console.warn("[notify-share] RESEND_API_KEY not set; skipping email.");
    return { skipped: true } as const;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend API error ${res.status}: ${text}`);
  }
  return await res.json();
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return jsonResponse({ error: "Missing bearer token." }, 401);
  }

  let payload: SharePayload;
  try {
    payload = await req.json();
  } catch (err) {
    return jsonResponse({ error: `Invalid JSON: ${(err as Error).message}` }, 400);
  }

  const eventId = payload?.event_id;
  const shareToken = payload?.share_token;
  if (!eventId || !shareToken) {
    return jsonResponse({ error: "event_id and share_token are required." }, 400);
  }

  try {
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const {
      data: { user },
      error: userErr,
    } = await userClient.auth.getUser();
    if (userErr || !user) {
      return jsonResponse({ error: "Could not identify caller from JWT." }, 401);
    }

    const { data: eventRow, error: eventErr } = await userClient
      .from("events")
      .select("id, name, starts_at, cover_emoji")
      .eq("id", eventId)
      .maybeSingle();

    if (eventErr) {
      console.error("[notify-share] events fetch error:", eventErr);
      return jsonResponse({ error: "Failed to look up event." }, 500);
    }
    if (!eventRow) {
      return jsonResponse({ error: "Event not found or you do not have access." }, 403);
    }

    const { data: linkRow, error: linkErr } = await userClient
      .from("event_share_links")
      .select("id, token, enabled, revoked_at")
      .eq("event_id", eventId)
      .eq("token", shareToken)
      .maybeSingle();

    if (linkErr) {
      console.error("[notify-share] share link fetch error:", linkErr);
      return jsonResponse({ error: "Failed to verify share link." }, 500);
    }
    if (!linkRow || !linkRow.enabled || linkRow.revoked_at) {
      return jsonResponse({ error: "Public share link is not active." }, 404);
    }

    const { data: adminUser, error: adminErr } = await adminClient.auth.admin.getUserById(user.id);
    if (adminErr || !adminUser?.user?.email) {
      console.error("[notify-share] auth.users lookup failed:", adminErr);
      return jsonResponse({ error: "Could not find an email for your account." }, 500);
    }
    const recipient = adminUser.user.email;

    const event = eventRow as {
      id: string;
      name: string;
      starts_at: string | null;
      cover_emoji: string;
    };
    const eventName = event.name || "your event";
    const dateLabel = event.starts_at
      ? new Date(event.starts_at).toLocaleDateString(undefined, {
          weekday: "long",
          month: "long",
          day: "numeric",
        })
      : null;
    const link = `${APP_URL}/s/${shareToken}`;
    const dateClause = dateLabel ? ` on ${dateLabel}` : "";
    const blurb = `You're invited to ${eventName}${dateClause}! Details: ${link}`;
    const subject = `Share link for ${eventName}`;

    const html = `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;padding:24px;">
  <div style="max-width:520px;margin:0 auto;background:white;border-radius:12px;padding:28px;box-shadow:0 4px 20px rgba(0,0,0,0.05);">
    <div style="font-size:32px;line-height:1;margin-bottom:8px;">${event.cover_emoji ?? "🎉"}</div>
    <h1 style="font-size:20px;margin:0 0 4px;color:#0f172a;">Your public share link</h1>
    <p style="color:#64748b;margin:0 0 20px;">Forward this to guests so they can view the public page for <strong>${escapeHtml(eventName)}</strong> without signing in.</p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:20px;">
      <div style="font-size:11px;text-transform:uppercase;color:#64748b;letter-spacing:0.05em;margin-bottom:8px;">Copy &amp; paste blurb</div>
      <div style="font-size:14px;color:#0f172a;line-height:1.5;">${escapeHtml(blurb)}</div>
    </div>
    <a href="${link}" style="display:inline-block;background:#cc38f5;color:white;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;">Open share page</a>
    <p style="color:#94a3b8;font-size:12px;margin-top:24px;word-break:break-all;">Direct link: <a href="${link}" style="color:#94a3b8;">${link}</a></p>
  </div>
</body></html>`;

    const emailResult = await sendEmail(recipient, subject, html);

    return jsonResponse({ ok: true, email: emailResult });
  } catch (err) {
    console.error("[notify-share]", err);
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
