// Supabase Edge Function: notify-wrap-up
//
// Standalone wrap-up nudge (T+1 day after the event). Mirrors the auth +
// RPC contract of `notify-event-reminder` so it can be wired to its own
// schedule (e.g. a different time of day) or invoked manually for QA.
//
// Reads `public.list_event_reminders_due()` and processes only rows whose
// `reminder_kind` is `wrap_up_1d`. Emails the owner via Resend, then calls
// `public.mark_event_reminder_sent(...)` so subsequent runs skip them.
//
// Auth: same as `notify-event-reminder` — accepts either
//   * `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`, or
//   * `X-Reminder-Secret: <REMINDER_CRON_SECRET>`.
//
// Required secrets:
//   RESEND_API_KEY, FROM_EMAIL, APP_URL,
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//   REMINDER_CRON_SECRET

// @ts-expect-error Deno
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
// @ts-expect-error Deno
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { signToken } from "../_shared/unsubscribe-token.ts";
import { hashRecipient, log } from "../_shared/log.ts";

const FN = "notify-wrap-up";

declare const Deno: { env: { get(name: string): string | undefined } };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "Party Planner <onboarding@resend.dev>";
const APP_URL = Deno.env.get("APP_URL") ?? "https://party-planner.vercel.app";
const REMINDER_CRON_SECRET = Deno.env.get("REMINDER_CRON_SECRET");
// One-click unsubscribe links go straight at the Edge Function URL — see
// notify-event-reminder for the full rationale (no SPA, no Vercel hop).
const UNSUBSCRIBE_BASE = `${SUPABASE_URL}/functions/v1/notify-unsubscribe`;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

interface ReminderRow {
  event_id: string;
  user_id: string;
  email: string | null;
  display_name: string | null;
  event_name: string | null;
  starts_at: string | null;
  reminder_kind: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function authorize(req: Request): boolean {
  const auth = req.headers.get("Authorization") ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    if (token && SERVICE_ROLE && token === SERVICE_ROLE) return true;
  }
  if (REMINDER_CRON_SECRET) {
    const provided = req.headers.get("X-Reminder-Secret");
    if (provided && provided === REMINDER_CRON_SECRET) return true;
  }
  return false;
}

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
  if (!REMINDER_CRON_SECRET) {
    log({
      level: "warn",
      fn: FN,
      event: "config.missing_env",
      context: { var: "REMINDER_CRON_SECRET" },
    });
  }
  return null;
}

async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text: string,
  context: Record<string, unknown>,
) {
  const recipientHash = await hashRecipient(to);
  if (!RESEND_API_KEY) {
    console.warn("[notify-wrap-up] RESEND_API_KEY not set; skipping email.");
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
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html, text }),
  });
  if (!res.ok) {
    const body = await res.text();
    log({
      level: "error",
      fn: FN,
      event: "resend.send_failed",
      status: res.status,
      error: body,
      recipientHash,
      context,
    });
    throw new Error(`Resend API error ${res.status}: ${body}`);
  }
  return { ...(await res.json()), recipientHash };
}

async function buildUnsubscribeUrl(userId: string): Promise<string | null> {
  // Soft-fail: if UNSUBSCRIBE_TOKEN_SECRET isn't configured yet, send the
  // wrap-up nudge without a footer link rather than failing the cron run.
  try {
    const token = await signToken({
      userId,
      kind: "wrap_up_1d",
      ttlDays: 30,
    });
    return `${UNSUBSCRIBE_BASE}?token=${encodeURIComponent(token)}`;
  } catch (err) {
    console.warn(
      "[notify-wrap-up] could not mint unsubscribe token:",
      (err as Error).message,
    );
    log({
      level: "warn",
      fn: FN,
      event: "config.missing_env",
      error: (err as Error).message,
      context: { var: "UNSUBSCRIBE_TOKEN_SECRET", user_id: userId, kind: "wrap_up_1d" },
    });
    return null;
  }
}

function buildWrapUpEmail(
  row: ReminderRow,
  unsubscribeUrl: string | null,
): { subject: string; html: string; text: string } {
  const eventName = row.event_name ?? "your event";
  const safeEvent = escapeHtml(eventName);
  const link = `${APP_URL}/events/${row.event_id}/wrap-up`;
  const greeting = row.display_name ? `Hi ${escapeHtml(row.display_name)},` : "Hi,";
  const subject = `How did it go? — ${eventName}`;
  const preferencesUrl = `${APP_URL}/settings#notifications`;

  const unsubscribeBlock = unsubscribeUrl
    ? `<hr style="border:none;border-top:1px solid #e2e8f0;margin:28px 0 16px;" />
    <p style="color:#94a3b8;font-size:12px;line-height:1.6;margin:0;">
      You're getting these because you're a collaborator on <strong>${safeEvent}</strong>.<br />
      <a href="${unsubscribeUrl}" style="color:#64748b;text-decoration:underline;">Unsubscribe from these reminders</a>
      &middot;
      <a href="${preferencesUrl}" style="color:#64748b;text-decoration:underline;">Manage all your email preferences</a>
    </p>`
    : "";

  const html = `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;padding:24px;">
  <div style="max-width:520px;margin:0 auto;background:white;border-radius:12px;padding:28px;box-shadow:0 4px 20px rgba(0,0,0,0.05);">
    <div style="font-size:32px;line-height:1;margin-bottom:8px;">✨</div>
    <h1 style="font-size:20px;margin:0 0 4px;color:#0f172a;">How did ${safeEvent} go?</h1>
    <p style="color:#64748b;margin:0 0 20px;">${greeting} take a minute to capture lessons learned, final headcount, and total spend while it's still fresh.</p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:20px;">
      <ul style="margin:0;padding-left:18px;color:#0f172a;font-size:14px;line-height:1.6;">
        <li>Summary &amp; lessons learned</li>
        <li>Final guest count and total cost</li>
        <li>Vendor rating (if you used any)</li>
      </ul>
    </div>
    <a href="${link}" style="display:inline-block;background:#6366f1;color:white;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;">File the wrap-up</a>
    <p style="color:#94a3b8;font-size:12px;margin-top:24px;word-break:break-all;">Direct link: <a href="${link}" style="color:#94a3b8;">${link}</a></p>
    ${unsubscribeBlock}
  </div>
</body></html>`;

  const textLines = [subject, "", `File the wrap-up: ${link}`];
  if (unsubscribeUrl) {
    textLines.push(
      "",
      "—",
      `Unsubscribe from these reminders: ${unsubscribeUrl}`,
      `Manage email preferences: ${preferencesUrl}`,
    );
  }
  return { subject, html, text: textLines.join("\n") };
}

async function processWrapUps(): Promise<{ sent: number; failed: number; skipped: number }> {
  const { data, error } = await supabase.rpc("list_event_reminders_due");
  if (error) {
    log({
      level: "error",
      fn: FN,
      event: "rpc.list_event_reminders_due_failed",
      error: error.message,
    });
    throw new Error(`list_event_reminders_due failed: ${error.message}`);
  }

  const rows = ((data ?? []) as ReminderRow[]).filter(
    (r) => r.reminder_kind === "wrap_up_1d",
  );

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of rows) {
    try {
      if (!row.email) {
        console.warn(
          `[notify-wrap-up] no email for user ${row.user_id} on event ${row.event_id}; skipping.`,
        );
        log({
          level: "warn",
          fn: FN,
          event: "row.skipped_no_email",
          context: { event_id: row.event_id, user_id: row.user_id, kind: row.reminder_kind },
        });
        skipped++;
        continue;
      }

      const unsubscribeUrl = await buildUnsubscribeUrl(row.user_id);
      const { subject, html, text } = buildWrapUpEmail(row, unsubscribeUrl);
      await sendEmail(row.email, subject, html, text, {
        event_id: row.event_id,
        user_id: row.user_id,
        kind: row.reminder_kind,
      });

      const { error: markErr } = await supabase.rpc("mark_event_reminder_sent", {
        _event_id: row.event_id,
        _user_id: row.user_id,
        _reminder_kind: row.reminder_kind,
      });
      if (markErr) {
        console.error(
          `[notify-wrap-up] mark_event_reminder_sent failed for ${row.event_id}/${row.user_id}:`,
          markErr.message,
        );
        log({
          level: "error",
          fn: FN,
          event: "rpc.mark_event_reminder_sent_failed",
          error: markErr.message,
          context: { event_id: row.event_id, user_id: row.user_id, kind: row.reminder_kind },
        });
      }
      sent++;
    } catch (err) {
      console.error(
        `[notify-wrap-up] failed for event=${row.event_id} user=${row.user_id}:`,
        (err as Error).message,
      );
      log({
        level: "error",
        fn: FN,
        event: "row.failed",
        error: (err as Error).message,
        context: { event_id: row.event_id, user_id: row.user_id, kind: row.reminder_kind },
      });
      failed++;
    }
  }

  return { sent, failed, skipped };
}

serve(async (req: Request) => {
  try {
    if (req.method !== "POST" && req.method !== "GET") {
      return new Response("Method not allowed", { status: 405 });
    }

    const missingEnv = checkRequiredEnv();
    if (missingEnv) {
      return jsonResponse({ error: `Server misconfigured (${missingEnv}).` }, 500);
    }

    if (!authorize(req)) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    try {
      const result = await processWrapUps();
      log({
        level: "info",
        fn: FN,
        event: "run.complete",
        context: { sent: result.sent, failed: result.failed, skipped: result.skipped },
      });
      return jsonResponse({ ok: true, ...result });
    } catch (err) {
      console.error("[notify-wrap-up]", err);
      return jsonResponse({ ok: false, error: (err as Error).message }, 500);
    }
  } catch (err) {
    log({ level: "error", fn: FN, event: "uncaught", error: String(err) });
    throw err;
  }
});
