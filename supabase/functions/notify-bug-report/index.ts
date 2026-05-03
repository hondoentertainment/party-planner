// Supabase Edge Function: notify-bug-report
// Called from Postgres (pg_net) after insert into public.bug_reports.
// Emails maintainers so reports are not only visible in the Table Editor.
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, FROM_EMAIL
// Optional: BUG_REPORT_NOTIFY_EMAIL — defaults to FROM_EMAIL mailbox if unset
// (use a dedicated inbox in production).

// @ts-expect-error Deno
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
// @ts-expect-error Deno
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { hashRecipient, log } from "../_shared/log.ts";

const FN = "notify-bug-report";

interface BugReportPayload {
  bug_report_id: string;
  event_id: string | null;
  reporter_id: string | null;
  title: string;
  severity: string;
  status: string;
}

declare const Deno: { env: { get(name: string): string | undefined } };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "Party Planner <onboarding@resend.dev>";
const NOTIFY_TO = Deno.env.get("BUG_REPORT_NOTIFY_EMAIL")?.trim() || extractMailbox(FROM_EMAIL);
const APP_URL = Deno.env.get("APP_URL") ?? "https://party-planner.vercel.app";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

function extractMailbox(from: string): string {
  const m = from.match(/<([^>]+)>/);
  if (m) return m[1]!.trim();
  return from.trim();
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
  return null;
}

async function sendEmail(to: string, subject: string, html: string, context: Record<string, unknown>) {
  const recipientHash = await hashRecipient(to);
  if (!RESEND_API_KEY) {
    log({
      level: "error",
      fn: FN,
      event: "config.missing_env",
      recipientHash,
      context: { ...context, var: "RESEND_API_KEY" },
    });
    return { skipped: true as const, recipientHash };
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
    throw new Error(`Resend ${res.status}: ${text}`);
  }
  return { ...(await res.json()), recipientHash };
}

serve(async (req: Request) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const missing = checkRequiredEnv();
    if (missing) {
      return new Response(JSON.stringify({ error: `Server misconfigured (${missing}).` }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    let payload: BugReportPayload;
    try {
      payload = await req.json();
    } catch (err) {
      return new Response(`Invalid JSON: ${(err as Error).message}`, { status: 400 });
    }

    const bugReportId = payload?.bug_report_id;
    if (!bugReportId) {
      return new Response(JSON.stringify({ error: "bug_report_id is required." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data: row, error: rowErr } = await admin
      .from("bug_reports")
      .select("id, event_id, reporter_id, title, description, severity, status, context, created_at")
      .eq("id", bugReportId)
      .maybeSingle();

    if (rowErr) {
      log({
        level: "error",
        fn: FN,
        event: "rpc.bug_reports_select_failed",
        error: rowErr.message,
        context: { bug_report_id: bugReportId },
      });
      return new Response(JSON.stringify({ error: rowErr.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!row) {
      log({ level: "warn", fn: FN, event: "bug_report.missing_row", context: { bug_report_id: bugReportId } });
      return new Response(JSON.stringify({ ok: true, skipped: "not_found" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const r = row as {
      id: string;
      event_id: string | null;
      reporter_id: string | null;
      title: string;
      description: string;
      severity: string;
      status: string;
      context: Record<string, unknown>;
      created_at: string;
    };

    let eventName: string | null = null;
    if (r.event_id) {
      const { data: ev } = await admin.from("events").select("name").eq("id", r.event_id).maybeSingle();
      eventName = (ev as { name?: string } | null)?.name ?? null;
    }

    const to = NOTIFY_TO;
    if (!to) {
      log({ level: "warn", fn: FN, event: "config.no_recipient", context: { bug_report_id: bugReportId } });
      return new Response(JSON.stringify({ ok: true, skipped: "no_recipient" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const subject = `[Party Planner] Bug (${r.severity}): ${r.title}`;
    const esc = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const ctxJson = esc(JSON.stringify(r.context ?? {}, null, 2));
    const html = `
      <h2>New bug report</h2>
      <p><strong>Id:</strong> ${esc(r.id)}</p>
      <p><strong>Severity:</strong> ${esc(r.severity)} · <strong>Status:</strong> ${esc(r.status)}</p>
      <p><strong>Event:</strong> ${r.event_id ? esc(r.event_id) : "—"}${eventName ? ` (${esc(eventName)})` : ""}</p>
      <p><strong>Reporter id:</strong> ${r.reporter_id ? esc(r.reporter_id) : "guest / anonymous"}</p>
      <p><strong>Title:</strong> ${esc(r.title)}</p>
      <h3>Description</h3>
      <pre style="white-space:pre-wrap;font-family:system-ui,sans-serif">${esc(r.description)}</pre>
      <h3>Context (JSON)</h3>
      <pre style="white-space:pre-wrap;font-size:12px">${ctxJson}</pre>
      <p style="margin-top:24px;font-size:12px;color:#64748b">
        Open <a href="${esc(APP_URL)}">the app</a> and triage in Supabase → Table Editor → bug_reports.
      </p>
    `;

    await sendEmail(to, subject, html, { bug_report_id: r.id, event_id: r.event_id });

    log({
      level: "info",
      fn: FN,
      event: "run.complete",
      context: { bug_report_id: r.id, event_id: r.event_id },
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[notify-bug-report]", e);
    log({
      level: "error",
      fn: FN,
      event: "run.unhandled",
      error: (e as Error).message ?? String(e),
    });
    return new Response(JSON.stringify({ error: (e as Error).message ?? "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
