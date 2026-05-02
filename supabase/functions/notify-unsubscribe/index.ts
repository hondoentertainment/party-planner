// Supabase Edge Function: notify-unsubscribe
//
// One-click email unsubscribe. Accepts `GET /?token=...` (and `POST` for parity).
// Deploy with `--no-verify-jwt` — the HMAC token IS the auth.
//
// We **302 redirect** to `${APP_URL}/email/unsubscribe?...` instead of returning
// inline HTML. Some edge gateways rewrite non-2xx HTML responses to
// `text/plain` with nosniff, which makes error pages unreadable in browsers.
//
// Flow:
//  1. Verify token (_shared/unsubscribe-token.ts).
//  2. Call public.upsert_notification_opt_out via service role.
//  3. Redirect to the SPA landing page with outcome + optional kind.
//
// Required secrets: UNSUBSCRIBE_TOKEN_SECRET, SUPABASE_* (auto), APP_URL

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
const APP_URL_RAW = Deno.env.get("APP_URL") ?? "https://party-planner-five.vercel.app";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function appOrigin(): string {
  return APP_URL_RAW.replace(/\/$/, "");
}

function redirect(pathAndQuery: string): Response {
  const path = pathAndQuery.startsWith("/") ? pathAndQuery : `/${pathAndQuery}`;
  return new Response(null, {
    status: 302,
    headers: { Location: `${appOrigin()}${path}` },
  });
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

serve(async (req: Request) => {
  try {
    if (req.method !== "GET" && req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const missingEnv = checkRequiredEnv();
    if (missingEnv) {
      return redirect("/email/unsubscribe?outcome=error&reason=config");
    }

    const url = new URL(req.url);
    const token = url.searchParams.get("token") ?? "";

    let parsed: { userId: string; kind: UnsubscribeKind };
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
      return redirect("/email/unsubscribe?outcome=invalid");
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
      return redirect("/email/unsubscribe?outcome=error");
    }

    log({
      level: "info",
      fn: FN,
      event: "run.complete",
      context: { user_id: parsed.userId, kind: parsed.kind, sent: 0, failed: 0, skipped: 0, opt_out: 1 },
    });

    const kindQ = encodeURIComponent(parsed.kind);
    return redirect(`/email/unsubscribe?outcome=success&kind=${kindQ}`);
  } catch (err) {
    log({ level: "error", fn: FN, event: "uncaught", error: String(err) });
    throw err;
  }
});
