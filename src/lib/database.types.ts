/**
 * Hand-maintained Supabase types matching supabase/migrations/0001_init.sql.
 * Keep in sync if you alter columns. Shaped to satisfy @supabase/postgrest-js
 * GenericSchema (Tables/Views/Functions with Relationships arrays).
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
    };
    Views: Record<string, never>;
    Functions: {
      invite_collaborator: {
        Args: { _event_id: string; _email: string; _role?: CollabRole };
        Returns:
          | { status: "added"; user_id: string; display_name: string | null }
          | { status: "pending"; message: string };
      };
    };
  };
}
