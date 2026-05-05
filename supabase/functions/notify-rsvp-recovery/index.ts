// Supabase Edge Function: notify-rsvp-recovery
// Anon-callable. Sends a Resend email containing a magic-link the guest can
// click on any device to update their RSVP for a Party Planner event.
//
// Trust model:
//   * Caller provides a `share_token` (which they already obtained from the
//     public share URL) plus the `recovery_token` returned by
//     `request_rsvp_recovery`. We verify the share is still active and that
//     the recovery token row exists for that share before sending.
//   * The recipient is read off the `public_rsvp_tokens.email` column, NOT
//     supplied by the caller — so a malicious caller cannot use this endpoint
//     to spam arbitrary addresses with someone else's recovery link.
//
// Secrets: RESEND_API_KEY, FROM_EMAIL, APP_URL

// @ts-expect-error Deno
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
// @ts-expect-error Deno
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { hashRecipient, log } from "../_shared/log.ts";

const FN = "notify-rsvp-recovery";

interface RecoveryPayload {
  share_token?: string;
  recovery_token?: string;
}

declare const Deno: { env: { get(name: string): string | undefined } };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "Party Planner <onboarding@resend.dev>";
const APP_URL = Deno.env.get("APP_URL") ?? "https://party-planner.vercel.app";

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE);

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

async function sendEmail(to: string, subject: string, html: string, context: Record<string, unknown>) {
  const recipientHash = await hashRecipient(to);
  if (!RESEND_API_KEY) {
    console.warn("[notify-rsvp-recovery] RESEND_API_KEY not set; skipping email.");
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
    headers: {
      "Content-Type": "application/json",
      // Anon-callable from any origin (the public share page may be embedded
      // or proxied); CORS preflight kept permissive.
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    },
  });
}

serve(async (req: Request) => {
  try {
    if (req.method === "OPTIONS") {
      return jsonResponse({ ok: true });
    }
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const missingEnv = checkRequiredEnv();
    if (missingEnv) {
      return jsonResponse({ error: `Server misconfigured (${missingEnv}).` }, 500);
    }

    let payload: RecoveryPayload;
    try {
      payload = await req.json();
    } catch (err) {
      return jsonResponse({ error: `Invalid JSON: ${(err as Error).message}` }, 400);
    }

    const shareToken = payload?.share_token?.trim();
    const recoveryToken = payload?.recovery_token?.trim();
    if (!shareToken || !recoveryToken) {
      return jsonResponse({ error: "share_token and recovery_token are required." }, 400);
    }

    try {
      const { data: linkRow, error: linkErr } = await adminClient
        .from("event_share_links")
        .select("id, token, event_id, enabled, revoked_at, expires_at")
        .eq("token", shareToken)
        .maybeSingle();

      if (linkErr) {
        console.error("[notify-rsvp-recovery] share link fetch error:", linkErr);
        log({
          level: "error",
          fn: FN,
          event: "rpc.event_share_links_select_failed",
          error: linkErr.message,
        });
        return jsonResponse({ error: "Failed to verify share link." }, 500);
      }
      const linkActive =
        linkRow &&
        linkRow.enabled &&
        !linkRow.revoked_at &&
        (!linkRow.expires_at || new Date(linkRow.expires_at) > new Date());
      if (!linkRow || !linkActive) {
        return jsonResponse({ error: "Public share link is not active." }, 404);
      }

      const { data: tokenRow, error: tokenErr } = await adminClient
        .from("public_rsvp_tokens")
        .select("token, share_token, item_id, email, expires_at")
        .eq("token", recoveryToken)
        .maybeSingle();

      if (tokenErr) {
        console.error("[notify-rsvp-recovery] token fetch error:", tokenErr);
        log({
          level: "error",
          fn: FN,
          event: "rpc.public_rsvp_tokens_select_failed",
          error: tokenErr.message,
          context: { event_id: linkRow.event_id },
        });
        return jsonResponse({ error: "Failed to verify recovery token." }, 500);
      }
      if (!tokenRow || tokenRow.share_token !== shareToken) {
        return jsonResponse({ error: "Recovery token not found for this share." }, 404);
      }
      if (tokenRow.expires_at && new Date(tokenRow.expires_at) < new Date()) {
        return jsonResponse({ error: "Recovery token has expired." }, 410);
      }

      const { data: eventRow, error: eventErr } = await adminClient
        .from("events")
        .select("id, name, cover_emoji")
        .eq("id", linkRow.event_id)
        .maybeSingle();

      if (eventErr) {
        log({
          level: "error",
          fn: FN,
          event: "rpc.events_select_failed",
          error: eventErr.message,
          context: { event_id: linkRow.event_id },
        });
      }

      const event = (eventRow ?? { name: "your event", cover_emoji: "🎉" }) as {
        name: string;
        cover_emoji: string | null;
      };
      const eventName = event.name || "your event";
      const recoveryUrl = `${APP_URL}/s/${encodeURIComponent(shareToken)}?rsvp_token=${encodeURIComponent(
        recoveryToken
      )}`;
      const subject = `Update your RSVP for ${eventName}`;

      const html = `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;padding:24px;">
  <div style="max-width:520px;margin:0 auto;background:white;border-radius:12px;padding:28px;box-shadow:0 4px 20px rgba(0,0,0,0.05);">
    <div style="font-size:32px;line-height:1;margin-bottom:8px;">${escapeHtml(event.cover_emoji ?? "🎉")}</div>
    <h1 style="font-size:20px;margin:0 0 4px;color:#0f172a;">Update your RSVP</h1>
    <p style="color:#64748b;margin:0 0 20px;">Click below to update your RSVP for <strong>${escapeHtml(eventName)}</strong> from any device. This link is private to you — don't forward it.</p>
    <a href="${recoveryUrl}" style="display:inline-block;background:#6366f1;color:white;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;">Click to update your RSVP for ${escapeHtml(eventName)}</a>
    <p style="color:#94a3b8;font-size:12px;margin-top:24px;word-break:break-all;">Direct link: <a href="${recoveryUrl}" style="color:#94a3b8;">${recoveryUrl}</a></p>
    <p style="color:#cbd5e1;font-size:11px;margin-top:16px;">Link expires 90 days after issue. If you didn't request this, you can safely ignore the email.</p>
  </div>
</body></html>`;

      const emailResult = await sendEmail(tokenRow.email, subject, html, {
        event_id: linkRow.event_id,
        item_id: tokenRow.item_id,
      });

      const { error: updateErr } = await adminClient
        .from("public_rsvp_tokens")
        .update({ last_sent_at: new Date().toISOString() })
        .eq("token", recoveryToken);
      if (updateErr) {
        log({
          level: "warn",
          fn: FN,
          event: "rpc.public_rsvp_tokens_update_failed",
          error: updateErr.message,
          context: { event_id: linkRow.event_id },
        });
      }

      const skipped = "skipped" in emailResult && emailResult.skipped ? 1 : 0;
      log({
        level: "info",
        fn: FN,
        event: "run.complete",
        recipientHash: emailResult.recipientHash,
        context: {
          event_id: linkRow.event_id,
          item_id: tokenRow.item_id,
          sent: skipped ? 0 : 1,
          failed: 0,
          skipped,
        },
      });

      return jsonResponse({ ok: true, email: emailResult });
    } catch (err) {
      console.error("[notify-rsvp-recovery]", err);
      return jsonResponse({ error: (err as Error).message }, 500);
    }
  } catch (err) {
    log({ level: "error", fn: FN, event: "uncaught", error: String(err) });
    throw err;
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
