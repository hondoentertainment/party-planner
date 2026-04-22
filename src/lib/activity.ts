import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import type { EventActivity, Profile } from "./database.types";

export type ActivityRow = EventActivity & { actor?: Profile | null };

/**
 * Fire-and-forget activity log. Failures are non-fatal (we don't want
 * activity logging errors to break the user's actual edit).
 */
export async function logActivity(
  eventId: string,
  actorId: string | null,
  message: string
): Promise<void> {
  try {
    await supabase.from("event_activity").insert({
      event_id: eventId,
      actor_id: actorId,
      message,
    });
  } catch (err) {
    console.warn("[activity] failed to log:", err);
  }
}

export function useActivity(eventId: string | undefined, limit = 30) {
  const [items, setItems] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!eventId) return;
    const { data: rows } = await supabase
      .from("event_activity")
      .select("*")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false })
      .limit(limit);
    const list = (rows ?? []) as EventActivity[];
    if (list.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }
    const actorIds = Array.from(
      new Set(list.map((r) => r.actor_id).filter((id): id is string => !!id))
    );
    const profilesById = new Map<string, Profile>();
    if (actorIds.length) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("*")
        .in("id", actorIds);
      (profiles ?? []).forEach((p: Profile) => profilesById.set(p.id, p));
    }
    setItems(
      list.map((r) => ({
        ...r,
        actor: r.actor_id ? profilesById.get(r.actor_id) ?? null : null,
      }))
    );
    setLoading(false);
  }, [eventId, limit]);

  useEffect(() => {
    refresh();
    if (!eventId) return;
    const ch = supabase
      .channel(`activity-${eventId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "event_activity", filter: `event_id=eq.${eventId}` },
        () => refresh()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [eventId, refresh]);

  return { items, loading, refresh };
}
