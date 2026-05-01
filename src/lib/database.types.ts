/**
 * Hand-maintained Supabase types matching `supabase/migrations/*.sql`.
 * After changing the schema, run `npm run db:types` (needs SUPABASE_PROJECT_ID
 * and `npx supabase login`) to refresh `database.types.gen.ts` and merge
 * into this file. Shaped to satisfy @supabase/postgrest-js GenericSchema.
 */

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

export interface Profile {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
}

export interface EventRow {
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
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface EventCollaborator {
  event_id: string;
  user_id: string;
  role: CollabRole;
  invited_email: string | null;
  created_at: string;
}

export interface EventItem {
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

export interface EventActivity {
  id: string;
  event_id: string;
  actor_id: string | null;
  message: string;
  created_at: string;
}

export interface UserNotification {
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

export interface EventBudgetItem {
  id: string;
  event_id: string;
  label: string;
  category: string | null;
  estimated_cents: number;
  actual_cents: number;
  paid_by: string | null;
  due_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventVendor {
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

export interface UserEventTemplate {
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

export interface TemplateSnapshotItem {
  kind: ItemKind;
  phase?: Phase | null;
  title: string;
  description?: string | null;
  meta?: Record<string, unknown>;
  position?: number;
}

export interface EventShareLink {
  id: string;
  event_id: string;
  token: string;
  label: string | null;
  enabled: boolean;
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
  revoked_at: string | null;
}

export interface EventWrapUp {
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

export interface NotificationOptOut {
  user_id: string;
  kind: NotificationOptOutKind;
  created_at: string;
}

export interface PendingEventInvitation {
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

export interface ClaimPendingInvitationsResult {
  claimed: number;
  event_ids: string[];
}

export interface RevokePendingInvitationResult {
  ok: boolean;
  deleted: number;
  event_id?: string;
}

export interface PublicRsvpPayload {
  name: string;
  email?: string;
  rsvp: "yes" | "maybe" | "no";
  plus_ones: number;
  dietary?: string;
  notes?: string;
}

export interface PublicRsvpResult {
  ok: boolean;
  item_id: string;
}

export interface PublicEventShareHost {
  display_name: string | null;
  initial: string;
}

export interface PublicEventShare {
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
    };
    Views: Record<string, never>;
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
