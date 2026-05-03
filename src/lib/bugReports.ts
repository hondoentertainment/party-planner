import { supabase } from "./supabase";
import { Sentry } from "./sentry";
import type { BugReportSeverity } from "./database.types";

const EVENT_PATH_RE =
  /\/events\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(?:\/|$)/i;

export interface BugReportInput {
  title: string;
  description: string;
  severity: BugReportSeverity;
  sentryEventId?: string | null;
  source?: string;
}

export function getCurrentEventId(pathname = window.location.pathname) {
  return EVENT_PATH_RE.exec(pathname)?.[1] ?? null;
}

export function buildBugReportContext(extra: {
  source?: string;
  sentryEventId?: string | null;
}): Record<string, unknown> {
  return {
    source: extra.source ?? "manual",
    route: `${window.location.pathname}${window.location.search}${window.location.hash}`,
    user_agent: window.navigator.userAgent,
    language: window.navigator.language,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      device_pixel_ratio: window.devicePixelRatio,
    },
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    online: window.navigator.onLine,
    sentry_event_id: extra.sentryEventId ?? null,
    app_mode: import.meta.env.MODE,
    captured_at: new Date().toISOString(),
  };
}

export async function submitBugReport(input: BugReportInput) {
  const title = input.title.trim();
  const description = input.description.trim();

  if (title.length < 3) {
    throw new Error("Add a short title so we can identify the issue.");
  }
  if (description.length < 10) {
    throw new Error("Add a little more detail about what happened.");
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  const user = authData.user;
  if (!user) throw new Error("Sign in to submit a bug report.");

  const contextBase = buildBugReportContext(input);
  let sentryEventId: string | null = input.sentryEventId ?? null;
  if (!sentryEventId && import.meta.env.VITE_SENTRY_DSN) {
    sentryEventId =
      Sentry.captureMessage(`Bug report: ${title}`, {
        level: input.severity === "critical" ? "error" : "warning",
        extra: contextBase,
      }) ?? null;
  }

  const { data, error } = await supabase
    .from("bug_reports")
    .insert({
      reporter_id: user.id,
      event_id: getCurrentEventId(),
      title,
      description,
      severity: input.severity,
      context: { ...contextBase, sentry_event_id: sentryEventId },
    })
    .select("id")
    .single();

  if (error) throw error;
  return { id: data?.id as string | undefined, sentryEventId };
}

export async function submitPublicBugReport(shareToken: string, input: BugReportInput) {
  const title = input.title.trim();
  const description = input.description.trim();

  if (title.length < 3) {
    throw new Error("Add a short title so we can identify the issue.");
  }
  if (description.length < 10) {
    throw new Error("Add a little more detail about what happened.");
  }

  const contextBase = buildBugReportContext({ ...input, source: input.source ?? "public_share" });
  let sentryEventId: string | null = input.sentryEventId ?? null;
  if (!sentryEventId && import.meta.env.VITE_SENTRY_DSN) {
    sentryEventId =
      Sentry.captureMessage(`Public bug report: ${title}`, {
        level: input.severity === "critical" ? "error" : "warning",
        extra: { ...contextBase, share_token_prefix: shareToken.slice(0, 8) },
      }) ?? null;
  }

  const { data, error } = await supabase.rpc("submit_public_bug_report", {
    _token: shareToken,
    _payload: {
      title,
      description,
      severity: input.severity,
      context: { ...contextBase, sentry_event_id: sentryEventId },
    },
  });

  if (error) throw error;
  const parsed = data as { ok?: boolean; id?: string } | null;
  return { id: parsed?.id, sentryEventId };
}
