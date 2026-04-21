import { useEffect, useState, useCallback } from "react";
import { supabase } from "./supabase";
import type { EventCollaborator, EventItem, EventRow, ItemKind, Profile } from "./database.types";

/* ---------- Events list ---------- */
export function useMyEvents() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from("events")
      .select("*")
      .order("starts_at", { ascending: true, nullsFirst: false });
    setEvents(data ?? []);
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

  return { events, loading, refresh };
}

/* ---------- Single event ---------- */
export function useEvent(eventId: string | undefined) {
  const [event, setEvent] = useState<EventRow | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!eventId) return;
    const { data } = await supabase.from("events").select("*").eq("id", eventId).maybeSingle();
    setEvent(data ?? null);
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

  return { event, loading, refresh };
}

/* ---------- Items by kind ---------- */
export function useEventItems(eventId: string | undefined, kind: ItemKind) {
  const [items, setItems] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!eventId) return;
    const { data } = await supabase
      .from("event_items")
      .select("*")
      .eq("event_id", eventId)
      .eq("kind", kind)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    setItems((data ?? []) as EventItem[]);
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

  return { items, loading, refresh };
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
