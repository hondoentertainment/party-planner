import { useEffect, useState, useCallback } from "react";
import { supabase } from "./supabase";
import { useAuth } from "./auth";
import type {
  EventBudgetItem,
  EventCollaborator,
  EventItem,
  EventRow,
  EventShareLink,
  EventVendor,
  EventWrapUp,
  ItemKind,
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
    const ch = supabase
      .channel("my-events")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events" },
        () => refresh()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
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
      setError(error.message);
    } else {
      setEvent(data ?? null);
    }
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    refresh();
    if (!eventId) return;
    const ch = supabase
      .channel(`event-${eventId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events", filter: `id=eq.${eventId}` },
        () => refresh()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
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
      setError(error.message);
    } else {
      setItems((data ?? []) as EventItem[]);
    }
    setLoading(false);
  }, [eventId, kind]);

  useEffect(() => {
    refresh();
    if (!eventId) return;
    const ch = supabase
      .channel(`items-${eventId}-${kind}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "event_items",
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          const row = (payload.new ?? payload.old) as EventItem | undefined;
          if (row?.kind === kind) refresh();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
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
    const { data } = await supabase
      .from("event_items")
      .select("*")
      .eq("event_id", eventId);
    setItems((data ?? []) as EventItem[]);
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    refresh();
    if (!eventId) return;
    const ch = supabase
      .channel(`all-items-${eventId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "event_items", filter: `event_id=eq.${eventId}` },
        () => refresh()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
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
    const ch = supabase
      .channel(`collabs-${eventId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "event_collaborators",
          filter: `event_id=eq.${eventId}`,
        },
        () => refresh()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
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
    const ch = supabase
      .channel(`notifications-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_notifications", filter: `user_id=eq.${userId}` },
        () => refresh()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
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
    const { data } = await supabase
      .from(table)
      .select("*")
      .eq("event_id", eventId)
      .order(orderColumn, { ascending: false });
    setRows((data ?? []) as T[]);
    setLoading(false);
  }, [eventId, orderColumn, table]);

  useEffect(() => {
    refresh();
    if (!eventId) return;
    const ch = supabase
      .channel(`${table}-${eventId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `event_id=eq.${eventId}` },
        () => refresh()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
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
    const ch = supabase
      .channel(`wrap-up-${eventId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "event_wrap_ups", filter: `event_id=eq.${eventId}` },
        () => refresh()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [eventId, refresh]);

  return { wrapUp, loading, refresh };
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
