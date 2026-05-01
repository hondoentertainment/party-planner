// Supabase Edge Function: notify-invite
// Email (Resend) the invitee a friendly note explaining how to accept a
// collaborator invitation. Handles two flavors:
//   - pending = true  → invitee has no account yet; tell them to sign up
//   - pending = false → invitee already has an account; deep-link the event
//
// Secrets: RESEND_API_KEY, FROM_EMAIL, APP_URL
// Auth: invoked by the Party Planner client with `supabase.functions.invoke`,
// which forwards the user's session JWT in the Authorization header. We verify
// that caller is the event owner before sending anything.

// @ts-expect-error Deno
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
// @ts-expect-error Deno
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { hashRecipient, log } from "../_shared/log.ts";

const FN = "notify-invite";

interface InvitePayload {
  event_id: string;
  email: string;
  role: string;
  invite_token?: string;
  pending: boolean;
}

declare const Deno: { env: { get(name: string): string | undefined } };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "Party Planner <onboarding@resend.dev>";
const APP_URL = Deno.env.get("APP_URL") ?? "https://party-planner.vercel.app";

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE);

function checkRequiredEnv(): string | null {
  const required: Array<[string, string | undefined]> = [
    ["SUPABASE_URL", SUPABASE_URL],
    ["SUPABASE_SERVICE_ROLE_KEY", SERVICE_ROLE],
    ["SUPABASE_ANON_KEY", ANON_KEY],
  ];
  for (const [name, value] of required) {
    if (!value) {
      log({ level: "error", fn: FN, event: "config.missing_env", context: { var: name } });
      return name;
    }
  }
  return null;
}

async function sendEmail(to: string, subject: string, html: string, context: Record<string, unknown>) {
  const recipientHash = await hashRecipient(to);
  if (!RESEND_API_KEY) {
    console.warn("[notify-invite] RESEND_API_KEY not set; skipping email.");
    log({
      level: "error",
      fn: FN,
      event: "config.missing_env",
      recipientHash,
      context: { ...context, var: "RESEND_API_KEY" },
    });
    return { skipped: true, recipientHash } as const;
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
    log({
      level: "error",
      fn: FN,
      event: "resend.send_failed",
      status: res.status,
      error: text,
      recipientHash,
      context,
    });
    throw new Error(`Resend API error ${res.status}: ${text}`);
  }
  return { ...(await res.json()), recipientHash };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function emailIsValid(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

serve(async (req: Request) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const missingEnv = checkRequiredEnv();
    if (missingEnv) {
      return jsonResponse({ error: `Server misconfigured (${missingEnv}).` }, 500);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return jsonResponse({ error: "Missing bearer token." }, 401);
    }

    let payload: InvitePayload;
    try {
      payload = await req.json();
    } catch (err) {
      return jsonResponse({ error: `Invalid JSON: ${(err as Error).message}` }, 400);
    }

    const eventId = payload?.event_id;
    const inviteEmail = (payload?.email ?? "").trim();
    const role = (payload?.role ?? "editor").trim();
    const inviteToken = payload?.invite_token ?? "";
    const pending = !!payload?.pending;

    if (!eventId || !inviteEmail) {
      return jsonResponse({ error: "event_id and email are required." }, 400);
    }
    if (!emailIsValid(inviteEmail)) {
      return jsonResponse({ error: "That email address looks invalid." }, 400);
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
        .select("id, name, starts_at, cover_emoji, owner_id")
        .eq("id", eventId)
        .maybeSingle();

      if (eventErr) {
        console.error("[notify-invite] events fetch error:", eventErr);
        log({
          level: "error",
          fn: FN,
          event: "rpc.events_select_failed",
          error: eventErr.message,
          context: { event_id: eventId, pending },
        });
        return jsonResponse({ error: "Failed to look up event." }, 500);
      }
      if (!eventRow) {
        return jsonResponse({ error: "Event not found or you do not have access." }, 403);
      }
      if (eventRow.owner_id !== user.id) {
        return jsonResponse({ error: "Only the event owner can send invite emails." }, 403);
      }

      let inviterName = user.email ?? "A friend";
      {
        const { data: prof, error: profErr } = await adminClient
          .from("profiles")
          .select("display_name, email")
          .eq("id", user.id)
          .maybeSingle();
        if (profErr) {
          log({
            level: "error",
            fn: FN,
            event: "rpc.profiles_select_failed",
            error: profErr.message,
            context: { event_id: eventId, user_id: user.id, role: "inviter" },
          });
        }
        if (prof?.display_name) {
          inviterName = prof.display_name;
        } else if (prof?.email) {
          inviterName = prof.email;
        }
      }

      const event = eventRow as {
        id: string;
        name: string;
        starts_at: string | null;
        cover_emoji: string | null;
        owner_id: string;
      };
      const eventName = event.name || "an event";
      const dateLabel = event.starts_at
        ? new Date(event.starts_at).toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })
        : null;
      const dateClause = dateLabel ? ` on ${dateLabel}` : "";
      const emoji = event.cover_emoji ?? "🎉";
      const safeEvent = escapeHtml(eventName);
      const safeInviter = escapeHtml(inviterName);
      const safeRole = escapeHtml(role);

      let subject: string;
      let cta: string;
      let body: string;

      if (pending) {
        subject = `You're invited to help plan ${eventName}`;
        cta = inviteToken
          ? `${APP_URL}/?invite=${encodeURIComponent(inviteToken)}`
          : APP_URL;
        body = `
          <p style="margin:0 0 16px;color:#0f172a;">${safeInviter} invited you to co-plan <strong>${safeEvent}</strong>${escapeHtml(dateClause)}.</p>
          <p style="margin:0 0 16px;color:#475569;">You don't have a Party Planner account yet — sign up with this email address (<strong>${escapeHtml(inviteEmail)}</strong>) and we'll automatically add you to the event.</p>
        `;
      } else {
        subject = `${inviterName} added you as ${role} for ${eventName}`;
        cta = `${APP_URL}/events/${event.id}`;
        body = `
          <p style="margin:0 0 16px;color:#0f172a;">${safeInviter} added you as <strong>${safeRole}</strong> on <strong>${safeEvent}</strong>${escapeHtml(dateClause)}.</p>
          <p style="margin:0 0 16px;color:#475569;">Open the event to see the latest plans, menu, shopping list, and timeline.</p>
        `;
      }

      const html = `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;padding:24px;">
  <div style="max-width:520px;margin:0 auto;background:white;border-radius:12px;padding:28px;box-shadow:0 4px 20px rgba(0,0,0,0.05);">
    <div style="font-size:32px;line-height:1;margin-bottom:8px;">${escapeHtml(emoji)}</div>
    <h1 style="font-size:20px;margin:0 0 12px;color:#0f172a;">${escapeHtml(subject)}</h1>
    ${body}
    <p style="margin:24px 0 0;">
      <a href="${cta}" style="display:inline-block;background:#cc38f5;color:white;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;">${pending ? "Sign up &amp; join" : "Open event"}</a>
    </p>
    <p style="color:#94a3b8;font-size:12px;margin-top:24px;word-break:break-all;">Direct link: <a href="${cta}" style="color:#94a3b8;">${cta}</a></p>
  </div>
</body></html>`;

      const emailResult = await sendEmail(inviteEmail, subject, html, {
        event_id: eventId,
        pending,
        role,
      });
      const skipped = "skipped" in emailResult && emailResult.skipped ? 1 : 0;

      log({
        level: "info",
        fn: FN,
        event: "run.complete",
        recipientHash: emailResult.recipientHash,
        context: { event_id: eventId, pending, role, sent: skipped ? 0 : 1, failed: 0, skipped },
      });

      return jsonResponse({ ok: true, email: emailResult });
    } catch (err) {
      console.error("[notify-invite]", err);
      return jsonResponse({ error: (err as Error).message }, 500);
    }
  } catch (err) {
    log({ level: "error", fn: FN, event: "uncaught", error: String(err) });
    throw err;
  }
});
