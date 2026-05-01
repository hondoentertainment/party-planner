// Shared structured logger for Supabase Edge Functions.
//
// One JSON line per event: easy to grep in Supabase log explorer and to
// forward to Logflare / Datadog later without re-deriving structure.
//
// Pure utility — no side effects beyond `console.log` / `console.error`,
// no npm imports, Deno-native. Safe to import from any edge function.

export interface LogEvent {
  level: "info" | "warn" | "error";
  /** Edge function name, e.g. "notify-share". */
  fn: string;
  /** Short event name, e.g. "resend.send_failed". */
  event: string;
  /** HTTP status from upstream, when applicable. */
  status?: number;
  /** Sanitized error message — no PII, no raw email addresses. */
  error?: string;
  /** sha256(email).slice(0, 12) — never log raw email addresses. */
  recipientHash?: string;
  /** Additional structured context (event_id, kind, counters, etc.). */
  context?: Record<string, unknown>;
}

interface LogLine extends LogEvent {
  ts: string;
}

export function log(event: LogEvent): void {
  const line: LogLine = { ...event, ts: new Date().toISOString() };
  const serialized = JSON.stringify(line);
  if (event.level === "error") {
    console.error(serialized);
  } else {
    console.log(serialized);
  }
}

export async function hashRecipient(email: string): Promise<string> {
  const normalized = email.trim().toLowerCase();
  const bytes = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.slice(0, 12);
}
