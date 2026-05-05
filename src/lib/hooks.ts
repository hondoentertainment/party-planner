import { useEffect, useState, useCallback } from "react";
import { supabase } from "./supabase";
import { useAuth } from "./auth";
import {
  reportSupabaseReadFailure,
  reportSupabaseRealtimeStatus,
  reportSupabaseUserActionFailure,
} from "./supabaseTelemetry";

/* ------------------------------------------------------------------
 * Shared realtime subscriptions
 *
 * `supabase.channel(topic)` REUSES an existing channel for the same
 * topic (see realtime-js RealtimeClient#channel). Calling `.on()` on
 * a channel that has already been `.subscribe()`d throws:
 *
 *   "cannot add `postgres_changes` callbacks for realtime:<topic>
 *    after `subscribe()`"
 *
 * Multiple components on the same page (e.g. `useCollaborators`
 * called both directly and via `useEventPermissions`) hit this
 * because they each try to attach a listener to the same topic.
 *
 * Solution: ref-count subscribers per topic. The first caller
 * creates the channel and attaches one shared listener that fans out
 * to every registered callback; later callers just append themselves.
 * The channel is removed when the last caller unsubscribes.
 * ------------------------------------------------------------------ */

interface PostgresChangesFilter {
  event: "*" | "INSERT" | "UPDATE" | "DELETE";
  schema: string;
  table: string;
  filter?: string;
}

type RealtimePostgresPayload = {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: Record<string, unknown>;
  old: Record<string, unknown>;
};

type PayloadCallback = (payload: RealtimePostgresPayload) => void;

interface SharedChannelEntry {
  channel: ReturnType<typeof supabase.channel>;
  subscribers: Set<PayloadCallback>;
}

const sharedChannels = new Map<string, SharedChannelEntry>();

/**
 * Subscribe to a `postgres_changes` event on a named realtime topic.
 * Safe to call from multiple hook instances simultaneously — every
 * subscriber after the first reuses the existing channel.
 *
 * The first caller's `config` defines the channel filter; in this
 * codebase every caller for a given topic uses the same shape.
 */
export function subscribePostgresChanges(
  topic: string,
  config: PostgresChangesFilter,
  callback: PayloadCallback,
): () => void {
  let entry = sharedChannels.get(topic);
  if (!entry) {
    const channel = supabase.channel(topic);
    const subscribers = new Set<PayloadCallback>();
    entry = { channel, subscribers };
    sharedChannels.set(topic, entry);

    channel
      .on(
        // realtime-js types are loose for postgres_changes; cast to keep
        // call-sites identical to the previous inline `.on(...)` shape.
        "postgres_changes" as never,
        config as never,
        (payload: RealtimePostgresPayload) => {
          // Snapshot to avoid mutation during iteration.
          for (const cb of [...subscribers]) {
            try {
              cb(payload);
            } catch (err) {
              console.error("[hooks] subscriber threw", err);
            }
          }
        },
      )
      .subscribe((status, err) => {
        if (status === "SUBSCRIBED") return;
        reportSupabaseRealtimeStatus(topic, status, err);
      });
  }

  entry.subscribers.add(callback);

  return () => {
    const current = sharedChannels.get(topic);
    if (!current) return;
    current.subscribers.delete(callback);
    if (current.subscribers.size === 0) {
      sharedChannels.delete(topic);
      void supabase.removeChannel(current.channel);
    }
  };
}
import type {
  EventBudgetItem,
  EventCollaborator,
  EventItem,
  EventNotificationMute,
  EventRow,
  EventShareLink,
  EventVendor,
  EventWrapUp,
  ItemKind,
  NotificationOptOutKind,
  Profile,
  UserEventTemplate,
  UserNotification,
} from "./database.types";

/* ---------- Events list ---------- */
export function useMyEvents() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .order("starts_at", { ascending: true, nullsFirst: false });
    if (error) {
      setError(error.message);
    } else {
      setEvents(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    return subscribePostgresChanges(
      "my-events",
      { event: "*", schema: "public", table: "events" },
      () => void refresh(),
    );
  }, [refresh]);

  return { events, loading, error, refresh };
}

/* ---------- Single event ---------- */
export function useEvent(eventId: string | undefined) {
  const [event, setEvent] = useState<EventRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!eventId) {
      setEvent(null);
      setLoading(false);
      return;
    }
    setError(null);
    const { data, error } = await supabase.from("events").select("*").eq("id", eventId).maybeSingle();
    if (error) {
      reportSupabaseReadFailure("useEvent.events.select", error, { eventId });
      setError(error.message);
    } else {
      setEvent(data ?? null);
    }
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    refresh();
    if (!eventId) return;
    return subscribePostgresChanges(
      `event-${eventId}`,
      { event: "*", schema: "public", table: "events", filter: `id=eq.${eventId}` },
      () => void refresh(),
    );
  }, [eventId, refresh]);

  return { event, loading, error, refresh };
}

/* ---------- Items by kind ---------- */
export function useEventItems(eventId: string | undefined, kind: ItemKind) {
  const [items, setItems] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!eventId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setError(null);
    const { data, error } = await supabase
      .from("event_items")
      .select("*")
      .eq("event_id", eventId)
      .eq("kind", kind)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) {
      reportSupabaseReadFailure("useEventItems.event_items.select", error, { eventId, kind });
      setError(error.message);
    } else {
      setItems((data ?? []) as EventItem[]);
    }
    setLoading(false);
  }, [eventId, kind]);

  useEffect(() => {
    refresh();
    if (!eventId) return;
    // Topic is per-event (not per-kind) so all `useEventItems` callers on the
    // same event share one channel; each subscriber filters by kind.
    return subscribePostgresChanges(
      `items-${eventId}`,
      {
        event: "*",
        schema: "public",
        table: "event_items",
        filter: `event_id=eq.${eventId}`,
      },
      (payload) => {
        const row = (payload.new ?? payload.old) as unknown as EventItem | undefined;
        if (row?.kind === kind) void refresh();
      },
    );
  }, [eventId, kind, refresh]);

  /** Optimistic local mutators. Each mutates the local items array immediately,
   * so UI updates are instant. The realtime channel will re-fetch and reconcile. */
  const optimisticUpdate = useCallback((id: string, patch: Partial<EventItem>) => {
    setItems((arr) => arr.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);
  const optimisticDelete = useCallback((id: string) => {
    setItems((arr) => arr.filter((it) => it.id !== id));
  }, []);
  const optimisticReorder = useCallback((nextOrder: EventItem[]) => {
    setItems(nextOrder);
  }, []);

  return { items, loading, error, refresh, optimisticUpdate, optimisticDelete, optimisticReorder };
}

/* ---------- All items (for overview) ---------- */
export function useAllItems(eventId: string | undefined) {
  const [items, setItems] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!eventId) return;
    const { data, error } = await supabase
      .from("event_items")
      .select("*")
      .eq("event_id", eventId);
    if (error) {
      reportSupabaseReadFailure("useAllItems.event_items.select", error, { eventId });
      setItems([]);
    } else {
      setItems((data ?? []) as EventItem[]);
    }
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    refresh();
    if (!eventId) return;
    return subscribePostgresChanges(
      `all-items-${eventId}`,
      { event: "*", schema: "public", table: "event_items", filter: `event_id=eq.${eventId}` },
      () => void refresh(),
    );
  }, [eventId, refresh]);

  return { items, loading, refresh };
}

/* ---------- Collaborators ---------- */
export function useCollaborators(eventId: string | undefined) {
  const [collabs, setCollabs] = useState<(EventCollaborator & { profile?: Profile })[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!eventId) return;
    const { data: rows } = await supabase
      .from("event_collaborators")
      .select("*")
      .eq("event_id", eventId);
    const collabRows = (rows ?? []) as EventCollaborator[];
    if (collabRows.length === 0) {
      setCollabs([]);
      setLoading(false);
      return;
    }
    const userIds = collabRows.map((c) => c.user_id);
    const { data: profiles } = await supabase.from("profiles").select("*").in("id", userIds);
    const map = new Map((profiles ?? []).map((p) => [p.id, p as Profile]));
    setCollabs(collabRows.map((c) => ({ ...c, profile: map.get(c.user_id) })));
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    refresh();
    if (!eventId) return;
    return subscribePostgresChanges(
      `collabs-${eventId}`,
      {
        event: "*",
        schema: "public",
        table: "event_collaborators",
        filter: `event_id=eq.${eventId}`,
      },
      () => void refresh(),
    );
  }, [eventId, refresh]);

  return { collabs, loading, refresh };
}

/* ---------- Members (owner + collaborators, for assignment dropdowns) ---------- */
export function useEventMembers(eventId: string | undefined, ownerId: string | undefined) {
  const { collabs } = useCollaborators(eventId);
  const [owner, setOwner] = useState<Profile | null>(null);

  useEffect(() => {
    if (!ownerId) return;
    supabase
      .from("profiles")
      .select("*")
      .eq("id", ownerId)
      .maybeSingle()
      .then(({ data }) => setOwner((data ?? null) as Profile | null));
  }, [ownerId]);

  const members: Profile[] = [];
  if (owner) members.push(owner);
  collabs.forEach((c) => {
    if (c.profile && !members.find((m) => m.id === c.profile!.id)) members.push(c.profile);
  });
  return members;
}

export function useEventPermissions(event: EventRow | null | undefined) {
  const { user } = useAuth();
  const { collabs } = useCollaborators(event?.id);
  const currentRole = event?.owner_id === user?.id
    ? "owner"
    : collabs.find((c) => c.user_id === user?.id)?.role ?? null;
  return {
    role: currentRole,
    isOwner: currentRole === "owner",
    canEdit: currentRole === "owner" || currentRole === "editor",
    canView: !!currentRole,
  };
}

/** Per-event scheduled-reminder mutes (migration 0016); complements account-wide `notification_opt_outs`. */
export function useEventReminderMutes(eventId: string | undefined) {
  const { user } = useAuth();
  const [mutes, setMutes] = useState<Set<NotificationOptOutKind>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingKind, setPendingKind] = useState<NotificationOptOutKind | null>(null);

  const refresh = useCallback(async () => {
    if (!eventId || !user) {
      setMutes(new Set());
      setLoading(false);
      setError(null);
      return;
    }
    setError(null);
    const { data, error: reqErr } = await supabase
      .from("event_notification_mutes")
      .select("kind")
      .eq("event_id", eventId);
    if (reqErr) {
      reportSupabaseReadFailure("useEventReminderMutes.event_notification_mutes.select", reqErr, {
        eventId,
      });
      setError(reqErr.message);
      setMutes(new Set());
    } else {
      const next = new Set<NotificationOptOutKind>();
      for (const row of (data ?? []) as Pick<EventNotificationMute, "kind">[]) {
        next.add(row.kind);
      }
      setMutes(next);
    }
    setLoading(false);
  }, [eventId, user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!eventId || !user) return;
    return subscribePostgresChanges(
      `event-mutes-${eventId}`,
      {
        event: "*",
        schema: "public",
        table: "event_notification_mutes",
        filter: `event_id=eq.${eventId}`,
      },
      () => void refresh(),
    );
  }, [eventId, user, refresh]);

  const toggleMute = useCallback(
    async (kind: NotificationOptOutKind) => {
      if (!eventId || !user) return;
      if (kind !== "all" && mutes.has("all")) return;

      const wasMuted = kind === "all" ? mutes.has("all") : mutes.has(kind);
      const previous = mutes;
      const next = new Set(previous);
      if (wasMuted) next.delete(kind);
      else next.add(kind);
      setMutes(next);
      setPendingKind(kind);
      setError(null);

      const { error: writeErr } = wasMuted
        ? await supabase
            .from("event_notification_mutes")
            .delete()
            .eq("user_id", user.id)
            .eq("event_id", eventId)
            .eq("kind", kind)
        : await supabase.from("event_notification_mutes").insert({
            user_id: user.id,
            event_id: eventId,
            kind,
          });

      setPendingKind(null);
      if (writeErr) {
        setMutes(previous);
        setError(writeErr.message);
        reportSupabaseUserActionFailure("useEventReminderMutes.toggle", writeErr, { eventId, kind });
      }
    },
    [eventId, user, mutes]
  );

  return {
    mutes,
    loading,
    error,
    pendingKind,
    toggleMute,
    refresh,
  };
}

export function useNotifications(userId: string | undefined) {
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("user_notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30);
    setNotifications((data ?? []) as UserNotification[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    refresh();
    if (!userId) return;
    return subscribePostgresChanges(
      `notifications-${userId}`,
      { event: "*", schema: "public", table: "user_notifications", filter: `user_id=eq.${userId}` },
      () => void refresh(),
    );
  }, [refresh, userId]);

  const markRead = useCallback(async (id: string) => {
    const now = new Date().toISOString();
    setNotifications((rows) => rows.map((n) => (n.id === id ? { ...n, read_at: now } : n)));
    await supabase.from("user_notifications").update({ read_at: now }).eq("id", id);
  }, []);

  const markAllRead = useCallback(async () => {
    if (!userId) return;
    const now = new Date().toISOString();
    setNotifications((rows) => rows.map((n) => ({ ...n, read_at: n.read_at ?? now })));
    await supabase
      .from("user_notifications")
      .update({ read_at: now })
      .eq("user_id", userId)
      .is("read_at", null);
  }, [userId]);

  return {
    notifications,
    loading,
    unreadCount: notifications.filter((n) => !n.read_at).length,
    refresh,
    markRead,
    markAllRead,
  };
}

function useEventScopedRows<T extends { event_id: string }>(
  eventId: string | undefined,
  table: string,
  orderColumn = "created_at"
) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!eventId) return;
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .eq("event_id", eventId)
      .order(orderColumn, { ascending: false });
    if (error) {
      reportSupabaseReadFailure(`useEventScopedRows.${table}.select`, error, { eventId });
      setRows([]);
    } else {
      setRows((data ?? []) as T[]);
    }
    setLoading(false);
  }, [eventId, orderColumn, table]);

  useEffect(() => {
    refresh();
    if (!eventId) return;
    return subscribePostgresChanges(
      `${table}-${eventId}`,
      { event: "*", schema: "public", table, filter: `event_id=eq.${eventId}` },
      () => void refresh(),
    );
  }, [eventId, refresh, table]);

  return { rows, loading, refresh };
}

export function useBudgetItems(eventId: string | undefined) {
  const { rows, loading, refresh } = useEventScopedRows<EventBudgetItem>(
    eventId,
    "event_budget_items",
    "created_at"
  );
  return { items: rows, loading, refresh };
}

export function useVendors(eventId: string | undefined) {
  const { rows, loading, refresh } = useEventScopedRows<EventVendor>(
    eventId,
    "event_vendors",
    "created_at"
  );
  return { vendors: rows, loading, refresh };
}

export function useShareLinks(eventId: string | undefined) {
  const { rows, loading, refresh } = useEventScopedRows<EventShareLink>(
    eventId,
    "event_share_links",
    "created_at"
  );
  return { links: rows, loading, refresh };
}

// Alias for callers (Overview, suggestion helpers) that prefer the `Event` prefix.
export const useEventShareLinks = useShareLinks;

export function useWrapUp(eventId: string | undefined) {
  const [wrapUp, setWrapUp] = useState<EventWrapUp | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!eventId) return;
    const { data } = await supabase
      .from("event_wrap_ups")
      .select("*")
      .eq("event_id", eventId)
      .maybeSingle();
    setWrapUp((data ?? null) as EventWrapUp | null);
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    refresh();
    if (!eventId) return;
    return subscribePostgresChanges(
      `wrap-up-${eventId}`,
      { event: "*", schema: "public", table: "event_wrap_ups", filter: `event_id=eq.${eventId}` },
      () => void refresh(),
    );
  }, [eventId, refresh]);

  return { wrapUp, loading, refresh };
}

// Alias matching the Overview module's naming convention.
export const useEventWrapUp = useWrapUp;

/* ---------- Wrap-ups across all accessible events ---------- */
export function useWrapUpsAcrossEvents() {
  const [wrapUps, setWrapUps] = useState<EventWrapUp[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from("event_wrap_ups")
      .select("*")
      .order("updated_at", { ascending: false });
    if (!error) setWrapUps((data ?? []) as EventWrapUp[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    return subscribePostgresChanges(
      "wrap-ups-all",
      { event: "*", schema: "public", table: "event_wrap_ups" },
      () => void refresh(),
    );
  }, [refresh]);

  return { wrapUps, loading, refresh };
}

export function useUserTemplates(userId: string | undefined) {
  const [templates, setTemplates] = useState<UserEventTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("user_event_templates")
      .select("*")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false });
    setTemplates((data ?? []) as UserEventTemplate[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { templates, loading, refresh };
}
