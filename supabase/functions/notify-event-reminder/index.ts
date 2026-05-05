// Supabase Edge Function: notify-event-reminder
//
// Service-role-driven cron worker that emails the owner + every collaborator
// scheduled reminder digests at T-7d / T-3d / T-1d, plus a wrap-up nudge ~1
// day after the event ends.
//
// Invoked by Supabase scheduled cron (no end-user JWT). Authentication is
// either:
//   * `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` — used by pg_cron
//      via `current_setting('app.service_role_key', true)`, OR
//   * `X-Reminder-Secret: <REMINDER_CRON_SECRET>` — shared secret used by
//      Supabase's hosted scheduled functions or external schedulers.
//
// The work itself comes from the SECURITY DEFINER RPC
// `public.list_event_reminders_due(now())` (see migration 0011) which already
// excludes anything that's already been logged. After a successful send we
// call `public.mark_event_reminder_sent(...)` so subsequent cron runs skip it.
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

const FN = "notify-event-reminder";

declare const Deno: { env: { get(name: string): string | undefined } };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "Party Planner <onboarding@resend.dev>";
const APP_URL = Deno.env.get("APP_URL") ?? "https://party-planner.vercel.app";
const REMINDER_CRON_SECRET = Deno.env.get("REMINDER_CRON_SECRET");
// One-click unsubscribe links point directly at the Edge Function URL rather
// than going through `${APP_URL}/api/...`. Reasoning: this keeps the
// unsubscribe path off the Vite SPA (no JS, no cold start, no Vercel
// rewrite). Email clients hit the Edge Function over HTTPS straight away,
// and the function returns plain HTML.
const UNSUBSCRIBE_BASE = `${SUPABASE_URL}/functions/v1/notify-unsubscribe`;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export type ReminderKind = "pre_7d" | "pre_3d" | "pre_1d" | "wrap_up_1d";

export interface ReminderRow {
  event_id: string;
  user_id: string;
  email: string | null;
  display_name: string | null;
  event_name: string | null;
  starts_at: string | null;
  reminder_kind: ReminderKind;
}

interface EventStats {
  unassignedTasks: number;
  guestsMissingRsvp: number;
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
  // REMINDER_CRON_SECRET is "as applicable": auth still works via the bearer
  // service-role token, but external schedulers (Supabase scheduled
  // functions, GitHub Actions, etc.) need the secret. Surface it as a
  // structured warn so deployers notice it's missing.
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
    console.warn("[notify-event-reminder] RESEND_API_KEY not set; skipping email.");
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

async function fetchPreEventStats(eventId: string): Promise<EventStats> {
  const [unassignedRes, guestsRes] = await Promise.all([
    supabase
      .from("event_items")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .eq("kind", "task")
      .is("assignee_id", null)
      .neq("status", "done"),
    supabase
      .from("event_items")
      .select("meta")
      .eq("event_id", eventId)
      .eq("kind", "guest"),
  ]);

  if (unassignedRes.error) {
    log({
      level: "error",
      fn: FN,
      event: "rpc.event_items_unassigned_count_failed",
      error: unassignedRes.error.message,
      context: { event_id: eventId },
    });
  }
  if (guestsRes.error) {
    log({
      level: "error",
      fn: FN,
      event: "rpc.event_items_guests_select_failed",
      error: guestsRes.error.message,
      context: { event_id: eventId },
    });
  }

  let guestsMissingRsvp = 0;
  for (const row of (guestsRes.data ?? []) as Array<{ meta: Record<string, unknown> | null }>) {
    const meta = (row.meta ?? {}) as { rsvp?: string };
    const rsvp = typeof meta.rsvp === "string" ? meta.rsvp : "";
    if (rsvp !== "yes" && rsvp !== "no" && rsvp !== "maybe") {
      guestsMissingRsvp++;
    }
  }

  return {
    unassignedTasks: unassignedRes.count ?? 0,
    guestsMissingRsvp,
  };
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function statLines(stats: EventStats): string[] {
  const out: string[] = [];
  if (stats.unassignedTasks > 0) {
    out.push(
      `${stats.unassignedTasks} unassigned task${stats.unassignedTasks === 1 ? "" : "s"} still need an owner.`,
    );
  }
  if (stats.guestsMissingRsvp > 0) {
    out.push(
      `${stats.guestsMissingRsvp} guest${stats.guestsMissingRsvp === 1 ? " hasn't" : "s haven't"} RSVP'd yet.`,
    );
  }
  if (out.length === 0) {
    out.push("Looks like everything is on track. Have fun!");
  }
  return out;
}

interface UnsubscribeFooter {
  eventName: string;
  unsubscribeUrl: string;
  preferencesUrl: string;
}

function renderUnsubscribeFooter(footer: UnsubscribeFooter): string {
  return `<hr style="border:none;border-top:1px solid #e2e8f0;margin:28px 0 16px;" />
    <p style="color:#94a3b8;font-size:12px;line-height:1.6;margin:0;">
      You're getting these because you're a collaborator on <strong>${escapeHtml(footer.eventName)}</strong>.<br />
      <a href="${footer.unsubscribeUrl}" style="color:#64748b;text-decoration:underline;">Unsubscribe from these reminders</a>
      &middot;
      <a href="${footer.preferencesUrl}" style="color:#64748b;text-decoration:underline;">Manage all your email preferences</a>
    </p>`;
}

function emailLayout(opts: {
  emoji: string;
  heading: string;
  intro: string;
  bullets?: string[];
  cta: { label: string; href: string };
  footer?: string;
  unsubscribeFooter?: UnsubscribeFooter;
}): string {
  const bullets = opts.bullets && opts.bullets.length
    ? `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:20px;">
        <ul style="margin:0;padding-left:18px;color:#0f172a;font-size:14px;line-height:1.6;">
          ${opts.bullets.map((b) => `<li style="margin:0 0 6px;">${escapeHtml(b)}</li>`).join("")}
        </ul>
      </div>`
    : "";
  const footer = opts.footer
    ? `<p style="color:#94a3b8;font-size:12px;margin-top:24px;">${escapeHtml(opts.footer)}</p>`
    : "";
  const unsubscribe = opts.unsubscribeFooter ? renderUnsubscribeFooter(opts.unsubscribeFooter) : "";
  return `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;padding:24px;">
  <div style="max-width:520px;margin:0 auto;background:white;border-radius:12px;padding:28px;box-shadow:0 4px 20px rgba(0,0,0,0.05);">
    <div style="font-size:32px;line-height:1;margin-bottom:8px;">${escapeHtml(opts.emoji)}</div>
    <h1 style="font-size:20px;margin:0 0 4px;color:#0f172a;">${escapeHtml(opts.heading)}</h1>
    <p style="color:#64748b;margin:0 0 20px;">${escapeHtml(opts.intro)}</p>
    ${bullets}
    <a href="${opts.cta.href}" style="display:inline-block;background:#6366f1;color:white;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;">${escapeHtml(opts.cta.label)}</a>
    <p style="color:#94a3b8;font-size:12px;margin-top:24px;word-break:break-all;">Direct link: <a href="${opts.cta.href}" style="color:#94a3b8;">${opts.cta.href}</a></p>
    ${footer}
    ${unsubscribe}
  </div>
</body></html>`;
}

function buildEmailContent(
  row: ReminderRow,
  stats: EventStats | null,
  unsubscribeUrl: string | null,
): { subject: string; html: string; text: string } {
  const eventName = row.event_name ?? "your event";
  const dateLabel = formatDate(row.starts_at);
  const eventLink = `${APP_URL}/events/${row.event_id}`;
  const wrapUpLink = `${APP_URL}/events/${row.event_id}/wrap-up`;
  const greeting = row.display_name ? `Hi ${row.display_name},` : "Hi,";
  const preferencesUrl = `${APP_URL}/settings#notifications`;
  const unsubscribeFooter: UnsubscribeFooter | undefined = unsubscribeUrl
    ? { eventName, unsubscribeUrl, preferencesUrl }
    : undefined;

  // Plain-text equivalent of the HTML unsubscribe footer; appended below the
  // main body so text-only clients (and some inbox previews) still surface
  // the opt-out path.
  const unsubscribeText = unsubscribeUrl
    ? [
        "",
        "—",
        `Unsubscribe from these reminders: ${unsubscribeUrl}`,
        `Manage email preferences: ${preferencesUrl}`,
      ]
    : [];

  switch (row.reminder_kind) {
    case "pre_7d": {
      const subject = `Your party is in 7 days — ${eventName}`;
      const bullets = [
        ...(dateLabel ? [`Happening ${dateLabel}.`] : []),
        ...statLines(stats ?? { unassignedTasks: 0, guestsMissingRsvp: 0 }),
      ];
      const html = emailLayout({
        emoji: "📅",
        heading: `${eventName} is in 7 days`,
        intro: `${greeting} here's what's still to do before the big day.`,
        bullets,
        cta: { label: "Open the event", href: eventLink },
        unsubscribeFooter,
      });
      const text = [
        subject,
        "",
        ...bullets,
        "",
        eventLink,
        ...unsubscribeText,
      ].join("\n");
      return { subject, html, text };
    }
    case "pre_3d": {
      const subject = `3 days to go — ${eventName}`;
      const bullets = [
        ...(dateLabel ? [`Happening ${dateLabel}.`] : []),
        ...statLines(stats ?? { unassignedTasks: 0, guestsMissingRsvp: 0 }),
      ];
      const html = emailLayout({
        emoji: "⏳",
        heading: `${eventName} — 3 days to go`,
        intro: `${greeting} time to lock things in. Quick pulse-check on what still needs attention:`,
        bullets,
        cta: { label: "Finish up the prep", href: eventLink },
        unsubscribeFooter,
      });
      const text = [subject, "", ...bullets, "", eventLink, ...unsubscribeText].join("\n");
      return { subject, html, text };
    }
    case "pre_1d": {
      const subject = `Your party is tomorrow! — ${eventName}`;
      const html = emailLayout({
        emoji: "🎉",
        heading: `${eventName} is tomorrow!`,
        intro: `${greeting} the day is almost here. Open the run-of-show, double-check your day-of tasks, and have a blast.`,
        cta: { label: "Open the day-of view", href: eventLink },
        footer: "Good luck — you've got this!",
        unsubscribeFooter,
      });
      const text = [
        subject,
        "",
        `Open the day-of view: ${eventLink}`,
        ...unsubscribeText,
      ].join("\n");
      return { subject, html, text };
    }
    case "wrap_up_1d": {
      const subject = `How did it go? — ${eventName}`;
      const html = emailLayout({
        emoji: "✨",
        heading: `How did ${eventName} go?`,
        intro: `${greeting} take a minute to capture lessons learned, final headcount, and total spend while it's fresh.`,
        bullets: [
          "Summary & lessons learned",
          "Final guest count and total cost",
          "Vendor rating (if you used any)",
        ],
        cta: { label: "File the wrap-up", href: wrapUpLink },
        footer: "Your future self (and any co-hosts) will thank you next time.",
        unsubscribeFooter,
      });
      const text = [
        subject,
        "",
        `File the wrap-up: ${wrapUpLink}`,
        ...unsubscribeText,
      ].join("\n");
      return { subject, html, text };
    }
  }
}

async function buildUnsubscribeUrl(
  userId: string,
  kind: ReminderKind,
): Promise<string | null> {
  // Soft-fail: if UNSUBSCRIBE_TOKEN_SECRET isn't configured yet, skip the
  // footer link rather than blocking reminder delivery. Logged loudly so
  // operators notice and run `supabase secrets set UNSUBSCRIBE_TOKEN_SECRET`.
  try {
    const token = await signToken({ userId, kind, ttlDays: 30 });
    return `${UNSUBSCRIBE_BASE}?token=${encodeURIComponent(token)}`;
  } catch (err) {
    console.warn(
      "[notify-event-reminder] could not mint unsubscribe token:",
      (err as Error).message,
    );
    log({
      level: "warn",
      fn: FN,
      event: "config.missing_env",
      error: (err as Error).message,
      context: { var: "UNSUBSCRIBE_TOKEN_SECRET", user_id: userId, kind },
    });
    return null;
  }
}

export async function processReminders(filterKinds?: ReminderKind[]): Promise<{
  sent: number;
  failed: number;
  skipped: number;
}> {
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

  let rows = (data ?? []) as ReminderRow[];
  if (filterKinds && filterKinds.length > 0) {
    const allowed = new Set<string>(filterKinds);
    rows = rows.filter((r) => allowed.has(r.reminder_kind));
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of rows) {
    try {
      if (!row.email) {
        console.warn(
          `[notify-event-reminder] no email for user ${row.user_id} on event ${row.event_id} (${row.reminder_kind}); skipping.`,
        );
        log({
          level: "warn",
          fn: FN,
          event: "row.skipped_no_email",
          context: {
            event_id: row.event_id,
            user_id: row.user_id,
            kind: row.reminder_kind,
          },
        });
        skipped++;
        continue;
      }

      const stats =
        row.reminder_kind === "pre_7d" || row.reminder_kind === "pre_3d"
          ? await fetchPreEventStats(row.event_id)
          : null;

      const unsubscribeUrl = await buildUnsubscribeUrl(row.user_id, row.reminder_kind);
      const { subject, html, text } = buildEmailContent(row, stats, unsubscribeUrl);
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
          `[notify-event-reminder] mark_event_reminder_sent failed for ${row.event_id}/${row.user_id}/${row.reminder_kind}:`,
          markErr.message,
        );
        log({
          level: "error",
          fn: FN,
          event: "rpc.mark_event_reminder_sent_failed",
          error: markErr.message,
          context: {
            event_id: row.event_id,
            user_id: row.user_id,
            kind: row.reminder_kind,
          },
        });
      }
      sent++;
    } catch (err) {
      console.error(
        `[notify-event-reminder] failed for event=${row.event_id} user=${row.user_id} kind=${row.reminder_kind}:`,
        (err as Error).message,
      );
      log({
        level: "error",
        fn: FN,
        event: "row.failed",
        error: (err as Error).message,
        context: {
          event_id: row.event_id,
          user_id: row.user_id,
          kind: row.reminder_kind,
        },
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
      const result = await processReminders();
      log({
        level: "info",
        fn: FN,
        event: "run.complete",
        context: { sent: result.sent, failed: result.failed, skipped: result.skipped },
      });
      return jsonResponse({ ok: true, ...result });
    } catch (err) {
      console.error("[notify-event-reminder]", err);
      return jsonResponse({ ok: false, error: (err as Error).message }, 500);
    }
  } catch (err) {
    log({ level: "error", fn: FN, event: "uncaught", error: String(err) });
    throw err;
  }
});
