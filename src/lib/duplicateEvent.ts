import { supabase } from "./supabase";
import type { EventItem, EventRow } from "./database.types";
import { logActivity } from "./activity";

export interface DuplicateEventOptions {
  /** Override the new event's name. Defaults to "<source.name> (copy)". */
  newName?: string;
  /**
   * Shift the new event's `starts_at` and `ends_at` by N days
   * (positive = later, negative = earlier). When omitted, the new
   * event has no scheduled date (legacy behavior). When the source
   * event itself has no `starts_at`, the shift is skipped.
   */
  shiftDays?: number;
}

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
  options?: DuplicateEventOptions
): Promise<string | null> {
  const newName = options?.newName ?? `${source.name} (copy)`;
  const shiftDays = options?.shiftDays;

  let startsAt: string | null = null;
  let endsAt: string | null = null;
  if (typeof shiftDays === "number" && source.starts_at) {
    startsAt = shiftIsoByDays(source.starts_at, shiftDays);
    if (source.ends_at) endsAt = shiftIsoByDays(source.ends_at, shiftDays);
  }

  const { data: created, error } = await supabase
    .from("events")
    .insert({
      owner_id: ownerId,
      name: newName,
      description: source.description,
      theme: source.theme,
      location: source.location,
      partiful_url: null,
      starts_at: startsAt,
      ends_at: endsAt,
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
    `duplicated "${source.name}" as "${newName}"`
  );

  return newId;
}

/**
 * Convenience helper: duplicates an event and shifts its date forward by 365
 * days, keeping the same name (no "(copy)" suffix) so it reads as next year's
 * iteration of the same party.
 */
export async function duplicateEventNextYear(
  source: EventRow,
  ownerId: string
): Promise<string | null> {
  return duplicateEvent(source, ownerId, {
    shiftDays: 365,
    newName: source.name,
  });
}

function shiftIsoByDays(iso: string, days: number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}
