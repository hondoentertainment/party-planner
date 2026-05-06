import { supabase } from "./supabase";
import { logActivity } from "./activity";
import { TEMPLATES, type EventTemplate } from "./templates";

const DEFAULT_TEMPLATE_ID = "bbq";

/**
 * Returns YYYY-MM-DD for today + N days in the local timezone.
 */
function localDateInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Creates a fully-populated demo event for first-time users — pre-filled name,
 * date 7 days out, and all starter items from the chosen template. Lowers the
 * "blank dashboard" cliff: hosts can immediately explore every module before
 * deciding to commit to their own real event.
 *
 * Returns the new event id, or null on failure.
 */
export async function createSampleEvent(
  ownerId: string,
  options?: { templateId?: string }
): Promise<string | null> {
  const templateId = options?.templateId ?? DEFAULT_TEMPLATE_ID;
  const template: EventTemplate =
    TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATES[0];

  // 7 days out at 6pm local time gives the timeline / countdown chip
  // reasonable values to render against.
  const startsLocal = new Date(`${localDateInDays(7)}T18:00`);
  const startsIso = Number.isNaN(startsLocal.getTime())
    ? null
    : startsLocal.toISOString();

  const { data, error } = await supabase
    .from("events")
    .insert({
      owner_id: ownerId,
      name: `Demo ${template.name}`,
      starts_at: startsIso,
      ends_at: null,
      location: "Sample location — edit me",
      theme: template.theme ?? null,
      partiful_url: null,
      cover_emoji: template.emoji,
      cover_color: template.color,
    })
    .select("*")
    .single();

  if (error || !data) {
    console.error("[sampleEvent] insert failed", error);
    return null;
  }

  const newId = (data as { id: string }).id;
  const rows = template.items.map((it, i) => ({
    event_id: newId,
    kind: it.kind,
    phase: it.phase ?? null,
    title: it.title,
    description: it.description ?? null,
    meta: it.meta ?? {},
    position: i,
    created_by: ownerId,
  }));
  if (rows.length > 0) {
    const { error: itemErr } = await supabase.from("event_items").insert(rows);
    if (itemErr) {
      console.error("[sampleEvent] items insert failed", itemErr);
    }
  }

  logActivity(newId, ownerId, `created demo "${template.name}" sample event`);

  try {
    window.localStorage.setItem(
      "first-event-created-at",
      new Date().toISOString()
    );
  } catch {
    /* ignore quota / private mode */
  }

  return newId;
}
