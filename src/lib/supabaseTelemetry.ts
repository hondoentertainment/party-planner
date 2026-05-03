import { Sentry } from "./sentry";

const readDedup = new Map<string, number>();
const READ_DEDUP_MS = 60_000;

/** Breadcrumb-style read failures (realtime may retry often). */
export function reportSupabaseReadFailure(
  operation: string,
  err: { message: string; code?: string; details?: string; hint?: string },
  extra?: Record<string, unknown>
) {
  if (!import.meta.env.VITE_SENTRY_DSN) return;
  const key = `${operation}:${err.code ?? "no_code"}:${err.message}`;
  const now = Date.now();
  if (now - (readDedup.get(key) ?? 0) < READ_DEDUP_MS) return;
  readDedup.set(key, now);
  Sentry.captureMessage(`Supabase read failed: ${operation}`, {
    level: "warning",
    fingerprint: [operation, err.code ?? "no_code"],
    extra: { ...extra, ...err },
  });
}

/** User-initiated or rare multi-step writes — no dedup by default. */
export function reportSupabaseUserActionFailure(
  operation: string,
  err: { message: string; code?: string },
  extra?: Record<string, unknown>
) {
  if (!import.meta.env.VITE_SENTRY_DSN) return;
  Sentry.captureMessage(`Supabase action failed: ${operation}`, {
    level: "error",
    extra: { ...extra, ...err },
  });
}
