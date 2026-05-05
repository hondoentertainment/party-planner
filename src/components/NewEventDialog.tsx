import { useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronRight, Loader2, Sparkles } from "lucide-react";
import { Modal } from "./Modal";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { TEMPLATES, type EventTemplate } from "../lib/templates";
import { logActivity } from "../lib/activity";
import { useUserTemplates } from "../lib/hooks";

const EMOJIS = ["🎉", "🎂", "🍻", "🥂", "🎃", "🎄", "💍", "👶", "🎓", "🌮", "🍕", "🪩", "🌊", "🏕️", "🔥"];
const COLORS = ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#ef4444", "#14b8a6", "#0ea5e9"];

const DEFAULT_EMOJI = "🎉";
const DEFAULT_COLOR = "#6366f1";

interface NewEventDialogProps {
  onClose: () => void;
  /**
   * If provided, the dialog skips the template-picker step on mount and
   * pre-selects the matching starter template so the user lands on details
   * directly. Ignored if no template with this id exists in TEMPLATES.
   */
  initialTemplateId?: string;
}

// Best-effort timezone abbreviation (e.g. "PST", "EDT", "GMT+5:30"). Falls back
// to the IANA name if the locale-formatted string can't be parsed.
function detectTimezoneAbbr(): string {
  try {
    const formatted = new Date().toLocaleTimeString(undefined, { timeZoneName: "short" });
    const tail = formatted.split(" ").pop();
    if (tail && /[A-Za-z]/.test(tail)) return tail;
  } catch {
    // ignore
  }
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function NewEventDialog({ onClose, initialTemplateId }: NewEventDialogProps) {
  const { user } = useAuth();
  const { templates: savedTemplates } = useUserTemplates(user?.id);
  const nav = useNavigate();
  const [step, setStep] = useState<"template" | "details">("template");
  const [template, setTemplate] = useState<EventTemplate | null>(null);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [showEndTime, setShowEndTime] = useState(false);
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [theme, setTheme] = useState("");
  const [partifulUrl, setPartifulUrl] = useState("");
  const [emoji, setEmoji] = useState(DEFAULT_EMOJI);
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [coverOpen, setCoverOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameId = useId();
  const startDateId = useId();
  const startTimeId = useId();
  const endDateId = useId();
  const endTimeId = useId();
  const locationId = useId();
  const themeId = useId();
  const partifulId = useId();
  const coverPanelId = useId();
  const morePanelId = useId();

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const tzAbbr = detectTimezoneAbbr();

  // Treat dates earlier than today (calendar-day comparison, ignoring time) as
  // "in the past" so we can show a soft warning without blocking submission.
  const isPastStartDate = (() => {
    if (!startDate) return false;
    const parts = startDate.split("-").map(Number);
    if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return false;
    const [y, m, d] = parts;
    const picked = new Date(y, m - 1, d);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return picked.getTime() < today.getTime();
  })();

  // ISO date+time strings sort lexically, so we can compare them directly.
  const endBeforeStart = (() => {
    if (!showEndTime) return false;
    if (!startDate || !endDate) return false;
    if (endDate < startDate) return true;
    if (endDate > startDate) return false;
    if (!startTime || !endTime) return false;
    return endTime < startTime;
  })();

  const enableEndTime = () => {
    setShowEndTime(true);
    if (!endDate) setEndDate(startDate);
  };

  const disableEndTime = () => {
    setShowEndTime(false);
    setEndDate("");
    setEndTime("");
  };

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

  // Pre-select a template when the dialog is opened from an inline tile (e.g.
  // the dashboard empty state). Runs once on mount; we intentionally ignore
  // changes to initialTemplateId after open so the user can navigate back to
  // the template picker without being yanked forward again.
  const didApplyInitialTemplate = useRef(false);
  useEffect(() => {
    if (didApplyInitialTemplate.current) return;
    if (!initialTemplateId) return;
    const match = TEMPLATES.find((t) => t.id === initialTemplateId);
    if (!match) return;
    didApplyInitialTemplate.current = true;
    pickTemplate(match);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickSavedTemplate = (saved: (typeof savedTemplates)[number]) => {
    pickTemplate({
      id: saved.id,
      name: saved.name,
      emoji: saved.emoji ?? DEFAULT_EMOJI,
      color: saved.color ?? DEFAULT_COLOR,
      blurb: saved.description ?? "Saved from one of your events.",
      items: (saved.items ?? []).map((item) => ({
        kind: item.kind,
        title: item.title,
        phase: item.phase ?? undefined,
        description: item.description ?? undefined,
        meta: item.meta ?? {},
      })),
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setError(null);

    // Build starts_at / ends_at from the split date+time inputs. We rely on the
    // browser's local timezone (Date parses `YYYY-MM-DDTHH:mm` as local time)
    // so the value the user picked in the UI matches what's stored.
    let startsAtIso: string | null = null;
    let endsAtIso: string | null = null;
    if (startDate) {
      const effectiveStartTime = startTime || "18:00";
      startsAtIso = new Date(`${startDate}T${effectiveStartTime}`).toISOString();
      if (showEndTime && endTime) {
        const effectiveEndDate = endDate || startDate;
        endsAtIso = new Date(`${effectiveEndDate}T${endTime}`).toISOString();
      }
    }

    const { data, error } = await supabase
      .from("events")
      .insert({
        owner_id: user.id,
        name,
        starts_at: startsAtIso,
        ends_at: endsAtIso,
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

    const newId = (data as { id: string }).id;
    if (template) {
      const rows = template.items.map((it, i) => ({
        event_id: newId,
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

    logActivity(
      newId,
      user.id,
      template
        ? `created "${name}" from the ${template.name} template`
        : `created event "${name}"`
    );

    // Drop a breadcrumb for the first-run onboarding checklist on Overview.
    // Wave 2 reads this to decide whether to show the welcome flow.
    try {
      window.localStorage.setItem("first-event-created-at", new Date().toISOString());
    } catch {
      // localStorage may be unavailable (private mode, quota, etc.) — non-fatal.
    }

    setSaving(false);
    onClose();
    nav(`/events/${newId}`);
  };

  if (step === "template") {
    return (
      <Modal title="New event" onClose={onClose} maxWidth="max-w-3xl">
        <p className="text-sm text-slate-600 mb-4">
          Start from a template — we'll pre-fill the menu, shopping list,
          timeline, and more — or start with a blank canvas.
        </p>
        {savedTemplates.length > 0 && (
          <>
            <h3 className="font-display font-bold text-sm mb-2">Your saved templates</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
              {savedTemplates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => pickSavedTemplate(t)}
                  className="card p-4 text-left hover:shadow-pop transition-shadow"
                >
                  <div
                    className="h-14 -mx-4 -mt-4 mb-3 flex items-center justify-center text-3xl rounded-t-xl"
                    style={{ background: `linear-gradient(135deg, ${(t.color ?? DEFAULT_COLOR)}22, ${(t.color ?? DEFAULT_COLOR)}55)` }}
                  >
                    {t.emoji ?? DEFAULT_EMOJI}
                  </div>
                  <div className="font-display font-bold">{t.name}</div>
                  <div className="text-xs text-slate-500 mt-1">{t.description ?? "Saved template"}</div>
                  <div className="text-xs text-brand-600 mt-2">{(t.items ?? []).length} saved items →</div>
                </button>
              ))}
            </div>
          </>
        )}
        <h3 className="font-display font-bold text-sm mb-2">Starter templates</h3>
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
          <label className="label" htmlFor={nameId}>
            Event name
          </label>
          <input
            id={nameId}
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Summer Rooftop Party"
            required
            autoFocus
            autoComplete="off"
          />
        </div>

        <div className="space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor={startDateId}>
                Date
              </label>
              <input
                id={startDateId}
                type="date"
                className="input"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div>
              <label className="label" htmlFor={startTimeId}>
                Start time
              </label>
              <input
                id={startTimeId}
                type="time"
                className="input"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                autoComplete="off"
              />
            </div>
          </div>

          <p className="text-xs text-slate-500" title={tz}>
            Times shown in {tzAbbr} (your timezone)
          </p>

          {isPastStartDate && (
            <div className="text-xs bg-amber-50 text-amber-700 rounded-lg px-3 py-2">
              Heads up: this date is in the past.
            </div>
          )}

          {!showEndTime ? (
            <button
              type="button"
              onClick={enableEndTime}
              className="btn-ghost text-sm"
            >
              + Add end time
            </button>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor={endDateId}>
                    End date
                  </label>
                  <input
                    id={endDateId}
                    type="date"
                    className="input"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label className="label" htmlFor={endTimeId}>
                    End time
                  </label>
                  <input
                    id={endTimeId}
                    type="time"
                    className="input"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    autoComplete="off"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                {endBeforeStart ? (
                  <p className="text-xs text-amber-700" role="alert">
                    End is before start time
                  </p>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  onClick={disableEndTime}
                  className="btn-ghost text-xs"
                >
                  Remove end time
                </button>
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="label" htmlFor={locationId}>
            Location
          </label>
          <input
            id={locationId}
            className="input"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="123 Main St"
            autoComplete="street-address"
          />
        </div>

        <div>
          <span className="label">Cover</span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setCoverOpen((v) => !v)}
              aria-expanded={coverOpen}
              aria-controls={coverPanelId}
              aria-label="Customize cover"
              className="w-14 h-14 rounded-full grid place-items-center text-2xl shadow-soft border border-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-1"
              style={{ background: `linear-gradient(135deg, ${color}33, ${color}88)` }}
            >
              <span aria-hidden="true">{emoji}</span>
            </button>
            <button
              type="button"
              onClick={() => setCoverOpen((v) => !v)}
              aria-expanded={coverOpen}
              aria-controls={coverPanelId}
              className="text-sm text-brand-600 hover:text-brand-700 font-medium inline-flex items-center gap-1"
            >
              {coverOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              {coverOpen ? "Hide cover options" : "Customize"}
            </button>
          </div>

          {coverOpen && (
            <div id={coverPanelId} className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
              <div>
                <span className="label">Emoji</span>
                <div className="flex flex-wrap gap-1.5">
                  {EMOJIS.map((em) => (
                    <button
                      type="button"
                      key={em}
                      onClick={() => setEmoji(em)}
                      aria-label={`Cover emoji ${em}`}
                      aria-pressed={emoji === em}
                      className={`w-9 h-9 rounded-lg text-xl grid place-items-center border bg-white ${
                        emoji === em ? "border-brand-500 ring-2 ring-brand-200" : "border-slate-200"
                      }`}
                    >
                      {em}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="label">Color</span>
                <div className="flex flex-wrap gap-1.5">
                  {COLORS.map((c) => (
                    <button
                      type="button"
                      key={c}
                      onClick={() => setColor(c)}
                      aria-label={`Cover color ${c}`}
                      aria-pressed={color === c}
                      className={`w-7 h-7 rounded-full border-2 ${
                        color === c ? "border-slate-900" : "border-transparent"
                      }`}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div>
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            aria-expanded={moreOpen}
            aria-controls={morePanelId}
            className="text-sm text-slate-600 hover:text-slate-900 font-medium inline-flex items-center gap-1"
          >
            {moreOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            More options
          </button>

          {moreOpen && (
            <div id={morePanelId} className="space-y-3 mt-3">
              <div>
                <label className="label" htmlFor={themeId}>
                  Theme (optional)
                </label>
                <input
                  id={themeId}
                  className="input"
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  placeholder="Tropical, Halloween, Disco…"
                />
              </div>
              <div>
                <label className="label" htmlFor={partifulId}>
                  Partiful event URL (optional)
                </label>
                <input
                  id={partifulId}
                  type="url"
                  className="input"
                  value={partifulUrl}
                  onChange={(e) => setPartifulUrl(e.target.value)}
                  placeholder="https://partiful.com/e/…"
                />
              </div>
            </div>
          )}
        </div>

        {template && (
          <p className="text-xs text-slate-500">
            We'll pre-fill {template.items.length} starter items from the{" "}
            <strong>{template.name}</strong> template. You can edit or delete anything.
          </p>
        )}

        {error && (
          <div className="text-sm text-rose-600" role="alert">
            {error}
          </div>
        )}

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
            <button className="btn-primary" disabled={saving} type="submit" aria-busy={saving}>
              {saving && <Loader2 size={16} className="animate-spin" />}
              Create event
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
