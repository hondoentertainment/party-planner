import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Sparkles } from "lucide-react";
import { Modal } from "./Modal";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { TEMPLATES, type EventTemplate } from "../lib/templates";

const EMOJIS = ["🎉", "🎂", "🍻", "🥂", "🎃", "🎄", "💍", "👶", "🎓", "🌮", "🍕", "🪩", "🌊", "🏕️", "🔥"];
const COLORS = ["#cc38f5", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#ef4444", "#8b5cf6", "#0ea5e9"];

export function NewEventDialog({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const [step, setStep] = useState<"template" | "details">("template");
  const [template, setTemplate] = useState<EventTemplate | null>(null);
  const [name, setName] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [location, setLocation] = useState("");
  const [theme, setTheme] = useState("");
  const [partifulUrl, setPartifulUrl] = useState("");
  const [emoji, setEmoji] = useState("🎉");
  const [color, setColor] = useState("#cc38f5");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickTemplate = (t: EventTemplate | null) => {
    setTemplate(t);
    if (t) {
      setEmoji(t.emoji);
      setColor(t.color);
      setTheme(t.theme ?? "");
      if (!name) setName(t.name);
    }
    setStep("details");
  };

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

    if (error || !data) {
      setSaving(false);
      setError(error?.message ?? "Could not create event");
      return;
    }

    if (template) {
      const rows = template.items.map((it, i) => ({
        event_id: (data as { id: string }).id,
        kind: it.kind,
        phase: it.phase ?? null,
        title: it.title,
        description: it.description ?? null,
        meta: it.meta ?? {},
        position: i,
        created_by: user.id,
      }));
      await supabase.from("event_items").insert(rows);
    }

    setSaving(false);
    onClose();
    nav(`/events/${(data as { id: string }).id}`);
  };

  if (step === "template") {
    return (
      <Modal title="New event" onClose={onClose} maxWidth="max-w-3xl">
        <p className="text-sm text-slate-600 mb-4">
          Start from a template — we'll pre-fill the menu, shopping list,
          timeline, and more — or start with a blank canvas.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => pickTemplate(t)}
              className="card p-4 text-left hover:shadow-pop transition-shadow"
            >
              <div
                className="h-16 -mx-4 -mt-4 mb-3 flex items-center justify-center text-4xl rounded-t-xl"
                style={{ background: `linear-gradient(135deg, ${t.color}22, ${t.color}55)` }}
              >
                {t.emoji}
              </div>
              <div className="font-display font-bold">{t.name}</div>
              <div className="text-xs text-slate-500 mt-1">{t.blurb}</div>
              <div className="text-xs text-brand-600 mt-2">
                {t.items.length} starter items →
              </div>
            </button>
          ))}
          <button
            type="button"
            onClick={() => pickTemplate(null)}
            className="card p-4 text-left hover:shadow-pop transition-shadow border-2 border-dashed"
          >
            <div className="h-16 -mx-4 -mt-4 mb-3 flex items-center justify-center text-3xl rounded-t-xl bg-slate-50">
              <Sparkles className="text-slate-400" />
            </div>
            <div className="font-display font-bold">Blank event</div>
            <div className="text-xs text-slate-500 mt-1">
              Start from scratch and build everything yourself.
            </div>
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={template ? `New event — ${template.name}` : "New event"} onClose={onClose}>
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
                aria-label={`Cover emoji ${em}`}
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
                aria-label={`Cover color ${c}`}
              />
            ))}
          </div>
        </div>

        {template && (
          <p className="text-xs text-slate-500">
            We'll pre-fill {template.items.length} starter items from the{" "}
            <strong>{template.name}</strong> template. You can edit or delete anything.
          </p>
        )}

        {error && <div className="text-sm text-rose-600">{error}</div>}

        <div className="flex justify-between pt-2">
          <button
            type="button"
            onClick={() => setStep("template")}
            className="btn-ghost"
          >
            ← Back
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button className="btn-primary" disabled={saving}>
              {saving && <Loader2 size={16} className="animate-spin" />}
              Create event
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
