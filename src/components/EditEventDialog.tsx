import { useEffect, useId, useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2, XCircle } from "lucide-react";
import { Modal } from "./Modal";
import { supabase } from "../lib/supabase";
import type { EventRow } from "../lib/database.types";
import {
  EVENT_COVER_MAX_BYTES,
  EVENT_COVERS_BUCKET,
  EVENT_COVER_ACCEPT_TYPES,
  eventCoverExtForMime,
  eventCoverObjectPathFromPublicUrl,
  validateEventCoverFile,
} from "../lib/eventCoverStorage";
import { useNavigate } from "react-router-dom";
import { formatMoney, parseMoneyToCents } from "../lib/format";
import { useAuth } from "../lib/auth";
import { useConfirm } from "../lib/useConfirm";

const EMOJIS = ["🎉", "🎂", "🍻", "🥂", "🎃", "🎄", "💍", "👶", "🎓", "🌮", "🍕", "🪩", "🌊", "🏕️", "🔥"];
const COLORS = ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#ef4444", "#14b8a6", "#0ea5e9"];

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
  const confirm = useConfirm();
  const formId = useId();
  const coverFileRef = useRef<HTMLInputElement>(null);
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
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(
    event.cover_image_url ?? null,
  );
  const [coverBusy, setCoverBusy] = useState(false);
  const [archived, setArchived] = useState(event.archived);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCoverImageUrl(event.cover_image_url ?? null);
  }, [event.cover_image_url]);

  const canDelete = user?.id === event.owner_id;

  const removeStoredCoverIfAny = async (url: string | null) => {
    const path = url ? eventCoverObjectPathFromPublicUrl(url) : null;
    if (!path) return;
    await supabase.storage.from(EVENT_COVERS_BUCKET).remove([path]);
  };

  const onPickCoverPhoto = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    const msg = validateEventCoverFile(file);
    if (msg) {
      setError(msg);
      return;
    }
    const ext = eventCoverExtForMime(file.type);
    if (!ext) {
      setError("Unsupported image type.");
      return;
    }

    setCoverBusy(true);
    setError(null);
    const prevUrl = coverImageUrl;
    const storagePath = `${event.id}/${crypto.randomUUID()}.${ext}`;

    try {
      const { error: upErr } = await supabase.storage
        .from(EVENT_COVERS_BUCKET)
        .upload(storagePath, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type,
        });
      if (upErr) {
        setError(upErr.message ?? "Upload failed.");
        return;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from(EVENT_COVERS_BUCKET).getPublicUrl(storagePath);

      const now = new Date().toISOString();
      const { error: dbErr } = await supabase
        .from("events")
        .update({
          cover_image_url: publicUrl,
          updated_at: now,
        })
        .eq("id", event.id);

      if (dbErr) {
        await supabase.storage.from(EVENT_COVERS_BUCKET).remove([storagePath]);
        setError(dbErr.message ?? "Could not save cover URL.");
        return;
      }

      if (prevUrl && prevUrl !== publicUrl) {
        await removeStoredCoverIfAny(prevUrl);
      }
      setCoverImageUrl(publicUrl);
    } finally {
      setCoverBusy(false);
      if (coverFileRef.current) coverFileRef.current.value = "";
    }
  };

  const onRemoveCoverPhoto = async () => {
    if (!coverImageUrl) return;
    setCoverBusy(true);
    setError(null);
    const urlToRemove = coverImageUrl;
    try {
      const now = new Date().toISOString();
      const { error: dbErr } = await supabase
        .from("events")
        .update({ cover_image_url: null, updated_at: now })
        .eq("id", event.id);
      if (dbErr) {
        setError(dbErr.message ?? "Could not remove cover.");
        return;
      }
      await removeStoredCoverIfAny(urlToRemove);
      setCoverImageUrl(null);
    } finally {
      setCoverBusy(false);
    }
  };

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
    const ok = await confirm({
      title: "Delete this event?",
      description:
        "All tasks, food, drinks, shopping, and other planning data for this event will be permanently deleted. This can't be undone.",
      destructive: true,
      confirmLabel: "Delete event",
    });
    if (!ok) return;
    await supabase.from("events").delete().eq("id", event.id);
    onClose();
    nav("/");
  };

  return (
    <Modal title="Edit event" onClose={onClose} maxWidth="max-w-2xl">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor={`${formId}-name`}>Event name</label>
          <input id={`${formId}-name`} className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor={`${formId}-starts-at`}>Date & time</label>
            <input
              id={`${formId}-starts-at`}
              type="datetime-local"
              className="input"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor={`${formId}-location`}>Location</label>
            <input
              id={`${formId}-location`}
              className="input"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor={`${formId}-theme`}>Theme</label>
            <input id={`${formId}-theme`} className="input" value={theme} onChange={(e) => setTheme(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor={`${formId}-partiful-url`}>Partiful URL</label>
            <input
              id={`${formId}-partiful-url`}
              type="url"
              className="input"
              value={partifulUrl}
              onChange={(e) => setPartifulUrl(e.target.value)}
              placeholder="https://partiful.com/e/…"
            />
          </div>
        </div>
        <div>
          <label className="label" htmlFor={`${formId}-description`}>Description / notes</label>
          <textarea
            id={`${formId}-description`}
            className="input min-h-[80px]"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Anything important about the party"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor={`${formId}-rsvp-count`}>RSVP count (from Partiful)</label>
            <input
              id={`${formId}-rsvp-count`}
              type="number"
              min={0}
              className="input"
              value={rsvpCount}
              onChange={(e) => setRsvpCount(Number(e.target.value) || 0)}
            />
          </div>
          <div>
            <label className="label" htmlFor={`${formId}-budget`}>Budget</label>
            <input
              id={`${formId}-budget`}
              className="input"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="$500"
            />
          </div>
        </div>

        <div>
          <div className="label">Cover photo (optional)</div>
          <p className="text-xs text-slate-500 mb-2">
            Shown behind the emoji on your event header and guest page. JPEG / PNG / WebP / GIF, max{" "}
            {EVENT_COVER_MAX_BYTES / (1024 * 1024)} MB.
          </p>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <input
              ref={coverFileRef}
              type="file"
              accept={EVENT_COVER_ACCEPT_TYPES.join(",")}
              id={`${formId}-cover`}
              className="sr-only"
              aria-label="Upload cover photo"
              disabled={coverBusy}
              onChange={(e) => void onPickCoverPhoto(e.target.files)}
            />
            <label htmlFor={`${formId}-cover`}>
              <span className="btn-secondary inline-flex items-center gap-1.5 cursor-pointer">
                {coverBusy ? (
                  <Loader2 size={16} className="animate-spin" aria-hidden />
                ) : (
                  <ImagePlus size={16} aria-hidden />
                )}
                {coverImageUrl ? "Replace photo" : "Add photo"}
              </span>
            </label>
            {coverImageUrl ? (
              <button
                type="button"
                className="btn-ghost inline-flex items-center gap-1 text-rose-600 border border-rose-200"
                disabled={coverBusy}
                onClick={() => void onRemoveCoverPhoto()}
              >
                <XCircle size={16} aria-hidden /> Remove photo
              </button>
            ) : null}
          </div>
          {coverImageUrl ? (
            <div className="mb-3 rounded-lg overflow-hidden border border-slate-200 max-w-xs">
              <img
                src={coverImageUrl}
                alt=""
                loading="lazy"
                decoding="async"
                className="w-full h-28 object-cover"
              />
            </div>
          ) : null}
          <div className="label">Emoji & tint</div>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {EMOJIS.map((em) => (
              <button
                type="button"
                key={em}
                onClick={() => setEmoji(em)}
                aria-label={`Use ${em} as cover emoji`}
                aria-pressed={emoji === em}
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
                aria-label={`Use ${c} as cover color`}
                aria-pressed={color === c}
                className={`w-7 h-7 rounded-full border-2 ${
                  color === c ? "border-slate-900" : "border-transparent"
                }`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm" htmlFor={`${formId}-archived`}>
          <input
            id={`${formId}-archived`}
            type="checkbox"
            checked={archived}
            onChange={(e) => setArchived(e.target.checked)}
          />
          Archive this event
        </label>

        {error && <div className="text-sm text-rose-600" role="alert">{error}</div>}

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
