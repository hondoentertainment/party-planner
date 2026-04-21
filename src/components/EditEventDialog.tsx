import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Modal } from "./Modal";
import { supabase } from "../lib/supabase";
import type { EventRow } from "../lib/database.types";
import { useNavigate } from "react-router-dom";
import { formatMoney, parseMoneyToCents } from "../lib/format";
import { useAuth } from "../lib/auth";

const EMOJIS = ["🎉", "🎂", "🍻", "🥂", "🎃", "🎄", "💍", "👶", "🎓", "🌮", "🍕", "🪩", "🌊", "🏕️", "🔥"];
const COLORS = ["#cc38f5", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#ef4444", "#8b5cf6", "#0ea5e9"];

function toLocalDateTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

export function EditEventDialog({ event, onClose }: { event: EventRow; onClose: () => void }) {
  const nav = useNavigate();
  const { user } = useAuth();
  const [name, setName] = useState(event.name);
  const [startsAt, setStartsAt] = useState(toLocalDateTime(event.starts_at));
  const [location, setLocation] = useState(event.location ?? "");
  const [theme, setTheme] = useState(event.theme ?? "");
  const [description, setDescription] = useState(event.description ?? "");
  const [partifulUrl, setPartifulUrl] = useState(event.partiful_url ?? "");
  const [rsvpCount, setRsvpCount] = useState<number>(event.rsvp_count ?? 0);
  const [budget, setBudget] = useState(formatMoney(event.budget_cents ?? 0));
  const [emoji, setEmoji] = useState(event.cover_emoji);
  const [color, setColor] = useState(event.cover_color);
  const [archived, setArchived] = useState(event.archived);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDelete = user?.id === event.owner_id;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const { error } = await supabase
      .from("events")
      .update({
        name,
        starts_at: startsAt ? new Date(startsAt).toISOString() : null,
        location: location || null,
        theme: theme || null,
        description: description || null,
        partiful_url: partifulUrl || null,
        rsvp_count: rsvpCount,
        budget_cents: parseMoneyToCents(budget),
        cover_emoji: emoji,
        cover_color: color,
        archived,
        updated_at: new Date().toISOString(),
      })
      .eq("id", event.id);
    setSaving(false);
    if (error) setError(error.message);
    else onClose();
  };

  const deleteEvent = async () => {
    if (!confirm("Delete this event and all its data? This can't be undone.")) return;
    await supabase.from("events").delete().eq("id", event.id);
    onClose();
    nav("/");
  };

  return (
    <Modal title="Edit event" onClose={onClose} maxWidth="max-w-2xl">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label">Event name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Date & time</label>
            <input
              type="datetime-local"
              className="input"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Location</label>
            <input
              className="input"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Theme</label>
            <input className="input" value={theme} onChange={(e) => setTheme(e.target.value)} />
          </div>
          <div>
            <label className="label">Partiful URL</label>
            <input
              type="url"
              className="input"
              value={partifulUrl}
              onChange={(e) => setPartifulUrl(e.target.value)}
              placeholder="https://partiful.com/e/…"
            />
          </div>
        </div>
        <div>
          <label className="label">Description / notes</label>
          <textarea
            className="input min-h-[80px]"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Anything important about the party"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">RSVP count (from Partiful)</label>
            <input
              type="number"
              min={0}
              className="input"
              value={rsvpCount}
              onChange={(e) => setRsvpCount(Number(e.target.value) || 0)}
            />
          </div>
          <div>
            <label className="label">Budget</label>
            <input
              className="input"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="$500"
            />
          </div>
        </div>

        <div>
          <label className="label">Cover</label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {EMOJIS.map((em) => (
              <button
                type="button"
                key={em}
                onClick={() => setEmoji(em)}
                className={`w-9 h-9 rounded-lg text-xl grid place-items-center border ${
                  emoji === em ? "border-brand-500 bg-brand-50" : "border-slate-200"
                }`}
              >
                {em}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {COLORS.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setColor(c)}
                className={`w-7 h-7 rounded-full border-2 ${
                  color === c ? "border-slate-900" : "border-transparent"
                }`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => setArchived(e.target.checked)}
          />
          Archive this event
        </label>

        {error && <div className="text-sm text-rose-600">{error}</div>}

        <div className="flex justify-between items-center pt-2">
          {canDelete ? (
            <button type="button" onClick={deleteEvent} className="btn-ghost text-rose-600">
              <Trash2 size={14} /> Delete
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button className="btn-primary" disabled={saving}>
              {saving && <Loader2 size={16} className="animate-spin" />}
              Save changes
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
