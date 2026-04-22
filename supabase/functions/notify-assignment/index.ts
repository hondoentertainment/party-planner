// Supabase Edge Function: notify-assignment
// Email (Resend) + Web Push when an event_items row gets a new assignee.
//
// Secrets: RESEND_API_KEY, FROM_EMAIL, APP_URL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY
// (VAPID keys from: npx web-push generate-vapid-keys — use the same pair in VITE_VAPID_PUBLIC_KEY on the client)

// @ts-expect-error Deno
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
// @ts-expect-error Deno
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
// @ts-expect-error Deno npm specifier
import webpush from "npm:web-push@3.6.7";

interface AssignmentPayload {
  item_id: string;
  event_id: string;
  assignee_id: string;
  assigner_id: string | null;
  title: string;
  kind: string;
  due_at: string | null;
}

declare const Deno: { env: { get(name: string): string | undefined } };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "Party Planner <onboarding@resend.dev>";
const APP_URL = Deno.env.get("APP_URL") ?? "https://party-planner.vercel.app";
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY");
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY) {
    console.warn("[notify-assignment] RESEND_API_KEY not set; skipping email.");
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

async function sendWebPushes(assigneeId: string, payload: { title: string; body: string; url: string }) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    console.warn("[notify-assignment] VAPID keys not set; skipping web push.");
    return 0;
  }
  webpush.setVapidDetails("mailto:hi@partyplanner.local", VAPID_PUBLIC, VAPID_PRIVATE);

  const { data: rows } = await supabase
    .from("web_push_subscriptions")
    .select("subscription")
    .eq("user_id", assigneeId);

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url,
  });

  let sent = 0;
  for (const row of rows ?? []) {
    const sub = (row as { subscription: Record<string, unknown> }).subscription;
    if (!sub) continue;
    try {
      await webpush.sendNotification(sub, body);
      sent++;
    } catch (e) {
      console.error("[notify-assignment] web push failed:", e);
    }
  }
  return sent;
}

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let payload: AssignmentPayload;
  try {
    payload = await req.json();
  } catch (err) {
    return new Response(`Invalid JSON: ${(err as Error).message}`, { status: 400 });
  }

  try {
    const [assigneeRes, eventRes, assignerRes] = await Promise.all([
      supabase.from("profiles").select("id, email, display_name").eq("id", payload.assignee_id).maybeSingle(),
      supabase.from("events").select("id, name, starts_at, cover_emoji").eq("id", payload.event_id).maybeSingle(),
      payload.assigner_id
        ? supabase.from("profiles").select("display_name, email").eq("id", payload.assigner_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const assignee = assigneeRes.data as { id: string; email: string | null; display_name: string | null } | null;
    const event = eventRes.data as { id: string; name: string; starts_at: string | null; cover_emoji: string } | null;
    const assigner = assignerRes.data as { display_name: string | null; email: string | null } | null;

    if (!assignee) {
      return new Response(JSON.stringify({ skipped: "no assignee profile" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const eventName = event?.name ?? "your event";
    const assignerName = assigner?.display_name ?? assigner?.email ?? "Someone";
    const link = `${APP_URL}/events/${payload.event_id}`;
    const dueLine = payload.due_at
      ? `<p style="color:#475569;margin:0 0 16px;">Due ${new Date(payload.due_at).toLocaleDateString()}</p>`
      : "";

    const html = `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;padding:24px;">
  <div style="max-width:520px;margin:0 auto;background:white;border-radius:12px;padding:28px;box-shadow:0 4px 20px rgba(0,0,0,0.05);">
    <div style="font-size:32px;line-height:1;margin-bottom:8px;">${event?.cover_emoji ?? "🎉"}</div>
    <h1 style="font-size:20px;margin:0 0 4px;color:#0f172a;">You've got a new task</h1>
    <p style="color:#64748b;margin:0 0 20px;">${assignerName} assigned this to you on <strong>${eventName}</strong>.</p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:20px;">
      <div style="font-size:11px;text-transform:uppercase;color:#64748b;letter-spacing:0.05em;margin-bottom:4px;">${payload.kind}</div>
      <div style="font-size:16px;font-weight:600;color:#0f172a;margin-bottom:8px;">${escapeHtml(payload.title)}</div>
      ${dueLine}
    </div>
    <a href="${link}" style="display:inline-block;background:#cc38f5;color:white;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;">Open in Party Planner</a>
    <p style="color:#94a3b8;font-size:12px;margin-top:24px;">You're getting this because you collaborate on ${eventName}.</p>
  </div>
</body></html>`;

    let emailResult: unknown = { skipped: true };
    if (assignee.email) {
      emailResult = await sendEmail(assignee.email, `New task: ${payload.title}`, html);
    }

    const pushCount = await sendWebPushes(payload.assignee_id, {
      title: "New task assigned",
      body: `${assignerName}: ${payload.title}`,
      url: `/events/${payload.event_id}`,
    });

    return new Response(JSON.stringify({ ok: true, email: emailResult, webPushSent: pushCount }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[notify-assignment]", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
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
