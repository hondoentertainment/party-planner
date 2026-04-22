import { supabase } from "./supabase";
import type { EventItem, EventRow } from "./database.types";
import { logActivity } from "./activity";

/**
 * Duplicates an event the current user has access to. Copies all event_items
 * (resetting status to 'todo' and clearing assignees), preserves meta and
 * positions. Does NOT copy collaborators or activity log.
 *
 * @returns the new event id
 */
export async function duplicateEvent(
  source: EventRow,
  ownerId: string,
  newName?: string
): Promise<string | null> {
  const { data: created, error } = await supabase
    .from("events")
    .insert({
      owner_id: ownerId,
      name: newName ?? `${source.name} (copy)`,
      description: source.description,
      theme: source.theme,
      location: source.location,
      partiful_url: null,
      starts_at: null,
      ends_at: null,
      rsvp_count: 0,
      budget_cents: source.budget_cents,
      cover_emoji: source.cover_emoji,
      cover_color: source.cover_color,
      archived: false,
    })
    .select("*")
    .single();

  if (error || !created) return null;
  const newId = (created as { id: string }).id;

  const { data: items } = await supabase
    .from("event_items")
    .select("*")
    .eq("event_id", source.id);

  const sourceItems = (items ?? []) as EventItem[];
  if (sourceItems.length > 0) {
    const rows = sourceItems.map((it) => ({
      event_id: newId,
      kind: it.kind,
      phase: it.phase,
      title: it.title,
      description: it.description,
      meta: it.meta,
      position: it.position,
      status: "todo" as const,
      assignee_id: null,
      due_at: null,
      created_by: ownerId,
    }));
    await supabase.from("event_items").insert(rows);
  }

  void logActivity(
    newId,
    ownerId,
    `duplicated "${source.name}" as "${newName ?? `${source.name} (copy)`}"`
  );

  return newId;
}
