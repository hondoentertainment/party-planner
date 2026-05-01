/**
 * Local TypeScript types for the magic-link RSVP recovery feature added in
 * `supabase/migrations/0010_rsvp_recovery.sql`.
 *
 * These RPCs are intentionally NOT added to `src/lib/database.types.ts` so the
 * hand-maintained Supabase schema file stays in sync with the canonical
 * generator (run via `npm run db:types`). Until that runs again, the
 * `PublicEventPage` component should import from this file and use
 * `as unknown as <Type>` casts at the `supabase.rpc(...)` boundary.
 */
import type { PublicRsvpPayload } from "./database.types";

/** Optional addendum sent to `submit_public_rsvp` when the guest is updating
 *  an existing RSVP via a magic-link recovery token. */
export interface PublicRsvpRecoveryArgs {
  _token: string;
  _payload: PublicRsvpPayload;
  /** uuid string from the `public_rsvp_tokens.token` column. */
  _recovery_token?: string | null;
}

/** Always returns `{ ok: true }` regardless of whether the email actually
 *  matched a saved RSVP. The server side is intentionally anti-enumeration. */
export interface RequestRsvpRecoveryResult {
  ok: true;
  /** Surfaced ONLY when the row was created or refreshed — used by the client
   *  to immediately invoke the `notify-rsvp-recovery` Edge Function with the
   *  freshly-issued token. May be omitted for unknown emails to avoid leaking
   *  membership. */
  token?: string | null;
}

/** Shape returned by `lookup_rsvp_by_token(_token uuid)` for a valid,
 *  unexpired token. Null when not found / expired. */
export interface LookupRsvpByTokenResult {
  item_id: string;
  share_token: string;
  email: string;
  /** The guest item's stored fields. Mirrors the `event_items.meta` JSON we
   *  write in `submit_public_rsvp`, plus the guest's display name (which lives
   *  in `event_items.title`). */
  meta: {
    name: string;
    email: string;
    rsvp: "yes" | "maybe" | "no";
    plus_ones: number;
    dietary: string;
    notes: string;
    submitted_at: string | null;
  };
}

/** Payload for the `notify-rsvp-recovery` Edge Function. Anon-callable; only
 *  the share token is required (the function looks up the active recovery
 *  token row server-side). */
export interface NotifyRsvpRecoveryPayload {
  share_token: string;
  recovery_token: string;
}

export interface NotifyRsvpRecoveryResult {
  ok: boolean;
  error?: string;
}
