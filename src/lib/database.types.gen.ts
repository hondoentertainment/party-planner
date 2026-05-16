/**
 * Checked-in snapshot of the Supabase `public` schema (tables + RPCs).
 * Regenerate with `npm run db:types` when the remote schema changes; diff the
 * result against this file before committing. Aligns with
 * `supabase/migrations/*.sql` and @supabase/postgrest-js GenericSchema.
 * Rows extend `Record<string, unknown>` so the schema works with `createClient<Database>()`.
 *
 * Application code should import from `database.types.ts` (re-exports all
 * symbols) so import paths stay stable when this file is refreshed.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type ItemKind =
  | "task"
  | "food"
  | "beverage"
  | "shopping"
  | "logistics"
  | "sign"
  | "game"
  | "music"
  | "restroom"
  | "decoration"
  | "setup"
  | "guest";

export type ItemStatus = "todo" | "in_progress" | "done";
export type Phase = "pre" | "day_of" | "post";
export type CollabRole = "owner" | "editor" | "viewer";
export type BugReportSeverity = "low" | "medium" | "high" | "critical";
export type BugReportStatus = "open" | "triaging" | "resolved" | "wontfix";

export interface Profile extends Record<string, unknown> {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
}

export interface EventRow extends Record<string, unknown> {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  theme: string | null;
  starts_at: string | null;
  ends_at: string | null;
  location: string | null;
  partiful_url: string | null;
  rsvp_count: number;
  budget_cents: number;
  cover_emoji: string;
  cover_color: string;
  /** Migration 0023 — public Storage URL (`event-covers` bucket); null uses emoji gradient only. */
  cover_image_url: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface EventCollaborator extends Record<string, unknown> {
  event_id: string;
  user_id: string;
  role: CollabRole;
  invited_email: string | null;
  created_at: string;
}

export interface EventItem extends Record<string, unknown> {
  id: string;
  event_id: string;
  kind: ItemKind;
  phase: Phase | null;
  title: string;
  description: string | null;
  status: ItemStatus;
  assignee_id: string | null;
  due_at: string | null;
  position: number;
  meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface EventActivity extends Record<string, unknown> {
  id: string;
  event_id: string;
  actor_id: string | null;
  message: string;
  created_at: string;
}

export interface UserNotification extends Record<string, unknown> {
  id: string;
  user_id: string;
  event_id: string | null;
  actor_id: string | null;
  title: string;
  body: string | null;
  url: string | null;
  read_at: string | null;
  created_at: string;
}

export interface BugReport extends Record<string, unknown> {
  id: string;
  reporter_id: string | null;
  event_id: string | null;
  title: string;
  description: string;
  severity: BugReportSeverity;
  status: BugReportStatus;
  context: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface EventBudgetItemMeta extends Record<string, unknown> {
  paid_by_name?: string | null;
  split_with?: string[] | null;
  payment_app?: "venmo" | "cashapp" | "zelle" | null;
  payment_handle?: string | null;
}

export interface EventBudgetItem extends Record<string, unknown> {
  id: string;
  event_id: string;
  label: string;
  category: string | null;
  estimated_cents: number;
  actual_cents: number;
  paid_by: string | null;
  due_at: string | null;
  notes: string | null;
  meta: EventBudgetItemMeta;
  created_at: string;
  updated_at: string;
}

export interface EventVendor extends Record<string, unknown> {
  id: string;
  event_id: string;
  name: string;
  category: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  deposit_cents: number;
  balance_cents: number;
  due_at: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserEventTemplate extends Record<string, unknown> {
  id: string;
  owner_id: string;
  source_event_id: string | null;
  name: string;
  description: string | null;
  emoji: string | null;
  color: string | null;
  items: TemplateSnapshotItem[];
  created_at: string;
  updated_at: string;
}

export interface TemplateSnapshotItem extends Record<string, unknown> {
  kind: ItemKind;
  phase?: Phase | null;
  title: string;
  description?: string | null;
  meta?: Record<string, unknown>;
  position?: number;
}

export interface EventShareLink extends Record<string, unknown> {
  id: string;
  event_id: string;
  token: string;
  label: string | null;
  enabled: boolean;
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
  revoked_at: string | null;
  /** Set by the notify-share Edge Function (migration 0021) — 60s cool-down. */
  last_emailed_at: string | null;
}

export interface EventWrapUp extends Record<string, unknown> {
  event_id: string;
  summary: string | null;
  lessons: string | null;
  final_cost_cents: number;
  guest_count: number;
  vendor_rating: number | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Per-user, per-kind email opt-outs (migration 0013). One row per
 * (user_id, kind) the user has unsubscribed from; `kind = 'all'` means
 * every reminder kind. Inserts/deletes go through RLS — only the owning
 * user (or service_role) can manage their rows.
 */
export type NotificationOptOutKind =
  | "pre_7d"
  | "pre_3d"
  | "pre_1d"
  | "wrap_up_1d"
  | "all";

export interface NotificationOptOut extends Record<string, unknown> {
  user_id: string;
  kind: NotificationOptOutKind;
  created_at: string;
}

/**
 * Per-user, per-event scheduled-reminder mutes (migration 0016). Rows suppress
 * that reminder kind for this event only; `kind = 'all'` mutes every cadence.
 */
export interface EventNotificationMute extends Record<string, unknown> {
  user_id: string;
  event_id: string;
  kind: NotificationOptOutKind;
  created_at: string;
}

export interface PendingEventInvitation extends Record<string, unknown> {
  id: string;
  event_id: string;
  email: string;
  role: "editor" | "viewer";
  invited_by: string;
  token: string;
  expires_at: string;
  created_at: string;
  claimed_at: string | null;
}

/** Migration 0003 — web push subscriptions for assignment notifications. */
export interface WebPushSubscriptionRow extends Record<string, unknown> {
  id: string;
  user_id: string;
  endpoint: string;
  subscription: Json;
  user_agent: string | null;
  created_at: string;
}

export interface ClaimPendingInvitationsResult extends Record<string, unknown> {
  claimed: number;
  event_ids: string[];
}

export interface RevokePendingInvitationResult extends Record<string, unknown> {
  ok: boolean;
  deleted: number;
  event_id?: string;
}

export interface PublicRsvpPayload extends Record<string, unknown> {
  name: string;
  email?: string;
  rsvp: "yes" | "maybe" | "no";
  plus_ones: number;
  dietary?: string;
  notes?: string;
}

export interface PublicRsvpResult extends Record<string, unknown> {
  ok: boolean;
  item_id: string;
}

export interface PublicEventShareHost extends Record<string, unknown> {
  display_name: string | null;
  initial: string;
}

export interface PublicEventShare extends Record<string, unknown> {
  event: Pick<
    EventRow,
    | "id"
    | "name"
    | "description"
    | "theme"
    | "starts_at"
    | "ends_at"
    | "location"
    | "partiful_url"
    | "rsvp_count"
    | "cover_emoji"
    | "cover_color"
    | "cover_image_url"
  >;
  host: PublicEventShareHost;
  items: EventItem[];
  rsvp_summary: {
    yes: number;
    maybe: number;
    no: number;
    pending: number;
  };
}

export interface Database {
  __InternalSupabase: {
    PostgrestVersion: "12";
  };
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & { id: string };
        Update: Partial<Profile>;
        Relationships: [];
      };
      events: {
        Row: EventRow;
        Insert: Partial<EventRow> & { name: string; owner_id: string };
        Update: Partial<EventRow>;
        Relationships: [];
      };
      event_collaborators: {
        Row: EventCollaborator;
        Insert: EventCollaborator;
        Update: Partial<EventCollaborator>;
        Relationships: [];
      };
      event_items: {
        Row: EventItem;
        Insert: Partial<EventItem> & { event_id: string; kind: ItemKind; title: string };
        Update: Partial<EventItem>;
        Relationships: [];
      };
      event_activity: {
        Row: EventActivity;
        Insert: Partial<EventActivity> & { event_id: string; message: string };
        Update: Partial<EventActivity>;
        Relationships: [];
      };
      user_notifications: {
        Row: UserNotification;
        Insert: Partial<UserNotification> & { user_id: string; title: string };
        Update: Partial<UserNotification>;
        Relationships: [];
      };
      bug_reports: {
        Row: BugReport;
        Insert: Partial<BugReport> & {
          title: string;
          description: string;
        };
        Update: Partial<BugReport>;
        Relationships: [];
      };
      event_budget_items: {
        Row: EventBudgetItem;
        Insert: Partial<EventBudgetItem> & { event_id: string; label: string };
        Update: Partial<EventBudgetItem>;
        Relationships: [];
      };
      event_vendors: {
        Row: EventVendor;
        Insert: Partial<EventVendor> & { event_id: string; name: string };
        Update: Partial<EventVendor>;
        Relationships: [];
      };
      user_event_templates: {
        Row: UserEventTemplate;
        Insert: Partial<UserEventTemplate> & {
          owner_id: string;
          name: string;
          items?: TemplateSnapshotItem[];
        };
        Update: Partial<UserEventTemplate>;
        Relationships: [];
      };
      event_share_links: {
        Row: EventShareLink;
        Insert: Partial<EventShareLink> & { event_id: string; token: string };
        Update: Partial<EventShareLink>;
        Relationships: [];
      };
      event_wrap_ups: {
        Row: EventWrapUp;
        Insert: Partial<EventWrapUp> & { event_id: string };
        Update: Partial<EventWrapUp>;
        Relationships: [];
      };
      pending_event_invitations: {
        Row: PendingEventInvitation;
        Insert: Partial<PendingEventInvitation> & {
          event_id: string;
          email: string;
          invited_by: string;
        };
        Update: Partial<PendingEventInvitation>;
        Relationships: [];
      };
      notification_opt_outs: {
        Row: NotificationOptOut;
        Insert: Pick<NotificationOptOut, "user_id" | "kind"> &
          Partial<Pick<NotificationOptOut, "created_at">>;
        Update: Partial<NotificationOptOut>;
        Relationships: [];
      };
      event_notification_mutes: {
        Row: EventNotificationMute;
        Insert: Pick<EventNotificationMute, "user_id" | "event_id" | "kind"> &
          Partial<Pick<EventNotificationMute, "created_at">>;
        Update: Partial<EventNotificationMute>;
        Relationships: [];
      };
      web_push_subscriptions: {
        Row: WebPushSubscriptionRow;
        Insert: Partial<WebPushSubscriptionRow> & {
          user_id: string;
          endpoint: string;
          subscription: Json;
        };
        Update: Partial<WebPushSubscriptionRow>;
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      invite_collaborator: {
        Args: { _event_id: string; _email: string; _role?: CollabRole };
        Returns:
          | {
              status: "added";
              user_id: string;
              display_name: string | null;
              email?: string | null;
            }
          | {
              status: "pending";
              email: string;
              message: string;
              invite_token: string;
            };
      };
      claim_pending_invitations: {
        Args: Record<string, never>;
        Returns: ClaimPendingInvitationsResult;
      };
      revoke_pending_invitation: {
        Args: { _id: string };
        Returns: RevokePendingInvitationResult;
      };
      get_public_event_share: {
        Args: { _token: string };
        Returns: PublicEventShare | null;
      };
      create_event_share_link: {
        Args: { _event_id: string; _label?: string };
        Returns: EventShareLink;
      };
      submit_public_rsvp: {
        Args: {
          _token: string;
          _payload: PublicRsvpPayload;
          _recovery_token?: string | null;
        };
        Returns: PublicRsvpResult;
      };
      submit_public_bug_report: {
        Args: { _token: string; _payload: Record<string, unknown> };
        Returns: { ok: boolean; id?: string };
      };
      request_rsvp_recovery: {
        Args: { _share_token: string; _email: string };
        Returns: { ok: true; token?: string | null };
      };
      lookup_rsvp_by_token: {
        Args: { _token: string };
        Returns: {
          item_id: string;
          share_token: string;
          email: string;
          meta: Record<string, unknown>;
        } | null;
      };
      is_user_opted_out: {
        Args: { _user_id: string; _kind: NotificationOptOutKind };
        Returns: boolean;
      };
      upsert_notification_opt_out: {
        Args: { _user_id: string; _kind: NotificationOptOutKind };
        Returns: null;
      };
      remove_notification_opt_out: {
        Args: { _kind: NotificationOptOutKind };
        Returns: null;
      };
    };
  };
}
