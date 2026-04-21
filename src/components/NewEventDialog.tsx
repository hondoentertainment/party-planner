import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Modal } from "./Modal";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";

const EMOJIS = ["🎉", "🎂", "🍻", "🥂", "🎃", "🎄", "💍", "👶", "🎓", "🌮", "🍕", "🪩", "🌊", "🏕️", "🔥"];
const COLORS = ["#cc38f5", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#ef4444", "#8b5cf6", "#0ea5e9"];

export function NewEventDialog({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [location, setLocation] = useState("");
  const [theme, setTheme] = useState("");
  const [partifulUrl, setPartifulUrl] = useState("");
  const [emoji, setEmoji] = useState("🎉");
  const [color, setColor] = useState("#cc38f5");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setError(null);
    const { data, error } = await supabase
      .from("events")
      .insert({
        owner_id: user.id,
        name,
        starts_at: startsAt ? new Date(startsAt).toISOString() : null,
        location: location || null,
        theme: theme || null,
        partiful_url: partifulUrl || null,
        cover_emoji: emoji,
        cover_color: color,
      })
      .select("*")
      .single();
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    onClose();
    if (data) nav(`/events/${data.id}`);
  };

  return (
    <Modal title="New event" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label">Event name</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Summer Rooftop Party"
            required
            autoFocus
          />
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
              placeholder="123 Main St"
            />
          </div>
        </div>
        <div>
          <label className="label">Theme (optional)</label>
          <input
            className="input"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            placeholder="Tropical, Halloween, Disco…"
          />
        </div>
        <div>
          <label className="label">Partiful event URL (optional)</label>
          <input
            type="url"
            className="input"
            value={partifulUrl}
            onChange={(e) => setPartifulUrl(e.target.value)}
            placeholder="https://partiful.com/e/…"
          />
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
                aria-label={c}
              />
            ))}
          </div>
        </div>

        {error && <div className="text-sm text-rose-600">{error}</div>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button className="btn-primary" disabled={saving}>
            {saving && <Loader2 size={16} className="animate-spin" />}
            Create event
          </button>
        </div>
      </form>
    </Modal>
  );
}
