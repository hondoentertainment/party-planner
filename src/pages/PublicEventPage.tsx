import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  CalendarPlus,
  Check,
  Clock,
  Download,
  ExternalLink,
  GlassWater,
  MapPin,
  Music,
  PartyPopper,
  PencilLine,
  Utensils,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import type { EventItem, PublicEventShare, PublicRsvpPayload } from "../lib/database.types";
import { formatEventDate } from "../lib/format";
import { downloadPublicEventIcs } from "../lib/exportIcs";

type RsvpChoice = "yes" | "maybe" | "no";

interface StoredRsvp {
  name: string;
  email: string;
  rsvp: RsvpChoice;
  plus_ones: number;
  dietary: string;
  notes: string;
  submitted_at: string;
}

const RSVP_LABEL: Record<RsvpChoice, string> = {
  yes: "I'm in",
  maybe: "Maybe",
  no: "Can't make it",
};

export function PublicEventPage() {
  const { token } = useParams<{ token: string }>();
  const [share, setShare] = useState<PublicEventShare | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshShare = useCallback(async () => {
    if (!token) return;
    const { data, error: loadError } = await supabase.rpc("get_public_event_share", { _token: token });
    if (loadError) return;
    setShare((data ?? null) as PublicEventShare | null);
  }, [token]);

  useEffect(() => {
    if (!token) {
      setError("Missing share token.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    async function run() {
      setError(null);
      const { data, error: loadError } = await supabase.rpc("get_public_event_share", { _token: token });
      if (cancelled) return;
      if (loadError) {
        setError("We couldn't load this share link. Please try again.");
        setShare(null);
      } else {
        setShare((data ?? null) as PublicEventShare | null);
      }
      setLoading(false);
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const tasks = useMemo(
    () => (share?.items ?? []).filter((item: EventItem) => item.kind === "task"),
    [share]
  );
  const menu = useMemo(
    () => (share?.items ?? []).filter((item: EventItem) => item.kind === "food"),
    [share]
  );
  const drinks = useMemo(
    () => (share?.items ?? []).filter((item: EventItem) => item.kind === "beverage"),
    [share]
  );
  const music = useMemo(
    () => (share?.items ?? []).filter((item: EventItem) => item.kind === "music"),
    [share]
  );

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50 p-6" role="status" aria-live="polite">
        <div className="card p-5 flex items-center gap-3 text-slate-600 shadow-soft">
          <span className="h-3 w-3 rounded-full bg-brand-500 animate-pulse" aria-hidden />
          <span className="text-sm font-medium">Loading event details…</span>
        </div>
      </div>
    );
  }
  if (error || !share) {
    return (
      <main className="min-h-screen grid place-items-center bg-slate-50 p-6">
        <div className="card p-8 text-center max-w-md">
          <PartyPopper className="mx-auto text-slate-300 mb-3" size={36} />
          <h1 className="font-display text-xl font-bold">
            {error ? "Could not load share link" : "Share link unavailable"}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {error ?? "This event link was disabled, expired, or mistyped."}
          </p>
          <Link to="/" className="btn-primary mt-4">Go to Party Planner</Link>
        </div>
      </main>
    );
  }

  const { event } = share;
  const googleUrl = buildGoogleCalendarUrl(event);
  const mapsUrl = event.location
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`
    : null;

  return (
    <main className="min-h-screen bg-slate-50">
      <section
        className="p-6 sm:p-10"
        style={{ background: `linear-gradient(135deg, ${event.cover_color}33, ${event.cover_color}88)` }}
      >
        <div className="max-w-3xl mx-auto">
          <div className="text-6xl mb-3">{event.cover_emoji}</div>
          <h1 className="font-display text-4xl font-bold">{event.name}</h1>
          {event.theme && <p className="text-slate-700 mt-1">{event.theme}</p>}
        </div>
      </section>
      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-4">
        <div className="card p-5 space-y-3">
          <div>
            <p className="font-medium">{formatEventDate(event.starts_at)}</p>
            {event.ends_at && (
              <p className="text-xs text-slate-500 mt-0.5">Ends {formatEventDate(event.ends_at)}</p>
            )}
          </div>
          {event.location && (
            <p className="text-sm text-slate-600 flex flex-wrap items-center gap-2">
              <MapPin size={16} /> {event.location}
              {mapsUrl && (
                <a className="text-brand-700 font-medium inline-flex items-center gap-1" href={mapsUrl} target="_blank" rel="noreferrer">
                  Directions <ExternalLink size={12} />
                </a>
              )}
            </p>
          )}
          {event.description && <p className="text-sm text-slate-600 whitespace-pre-wrap">{event.description}</p>}
          <div className="flex flex-wrap gap-2">
            {event.partiful_url && (
              <a className="btn-primary" href={event.partiful_url} target="_blank" rel="noreferrer">
                RSVP on Partiful <ExternalLink size={14} />
              </a>
            )}
            <a className="btn-secondary" href={googleUrl} target="_blank" rel="noreferrer">
              <CalendarPlus size={14} /> Add to Google Calendar
            </a>
            <button
              type="button"
              onClick={() => downloadPublicEventIcs(event)}
              className="btn-secondary"
            >
              <Download size={14} /> Add to my calendar (.ics)
            </button>
          </div>
        </div>

        <RsvpCard token={token ?? ""} onSubmitted={() => void refreshShare()} />

        <section className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <RsvpStat label="Going" value={share.rsvp_summary?.yes ?? 0} />
          <RsvpStat label="Maybe" value={share.rsvp_summary?.maybe ?? 0} />
          <RsvpStat label="Pending" value={share.rsvp_summary?.pending ?? 0} />
          <RsvpStat label="Not going" value={share.rsvp_summary?.no ?? 0} />
        </section>

        <section className="card p-5">
          <h2 className="font-display font-bold mb-3 flex items-center gap-2">
            <Clock size={18} className="text-brand-600" /> Schedule
          </h2>
          {tasks.length === 0 ? (
            <p className="text-sm text-slate-500">No public schedule items yet.</p>
          ) : (
            <ul className="space-y-2">
              {tasks.slice(0, 12).map((item) => (
                <li key={item.id} className="text-sm border-l-2 border-brand-200 pl-3">
                  <div className="font-medium">{item.title}</div>
                  <div className="text-xs text-slate-500">
                    {item.due_at ? formatEventDate(item.due_at) : phaseLabel(item.phase)}
                  </div>
                  {item.description && <div className="text-slate-500">{item.description}</div>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-5">
          <h2 className="font-display font-bold mb-3 flex items-center gap-2">
            <Utensils size={18} className="text-brand-600" /> Food
          </h2>
          {menu.length === 0 ? (
            <p className="text-sm text-slate-500">Menu coming soon.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {menu.slice(0, 24).map((item) => (
                <MenuCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </section>

        <section className="card p-5">
          <h2 className="font-display font-bold mb-3 flex items-center gap-2">
            <GlassWater size={18} className="text-brand-600" /> Drinks
          </h2>
          {drinks.length === 0 ? (
            <p className="text-sm text-slate-500">Drink list coming soon.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {drinks.slice(0, 24).map((item) => (
                <DrinkCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </section>

        {music.length > 0 && (
          <section className="card p-5">
            <h2 className="font-display font-bold mb-3 flex items-center gap-2">
              <Music size={18} className="text-brand-600" /> Music
            </h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {music.slice(0, 12).map((item) => (
                <MusicCard key={item.id} item={item} />
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function RsvpCard({ token, onSubmitted }: { token: string; onSubmitted: () => void }) {
  const storageKey = token ? `public-rsvp:${token}` : "";
  const [stored, setStored] = useState<StoredRsvp | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<StoredRsvp>;
      if (parsed && typeof parsed.name === "string" && typeof parsed.rsvp === "string") {
        setStored({
          name: parsed.name ?? "",
          email: parsed.email ?? "",
          rsvp: (parsed.rsvp as RsvpChoice) ?? "yes",
          plus_ones: typeof parsed.plus_ones === "number" ? parsed.plus_ones : 0,
          dietary: parsed.dietary ?? "",
          notes: parsed.notes ?? "",
          submitted_at: parsed.submitted_at ?? new Date().toISOString(),
        });
      }
    } catch {
      // ignore localStorage parse errors
    }
  }, [storageKey]);

  const handleSubmitted = (saved: StoredRsvp) => {
    setStored(saved);
    setEditing(false);
    if (storageKey) {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(saved));
      } catch {
        // ignore storage quota errors
      }
    }
    onSubmitted();
  };

  if (!token) return null;

  if (stored && !editing) {
    return (
      <section className="card p-5" aria-label="Your RSVP">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display font-bold flex items-center gap-2">
              <Check size={18} className="text-emerald-600" />
              Thanks, {stored.name}! Your RSVP is in.
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              We marked you as <strong>{RSVP_LABEL[stored.rsvp]}</strong>
              {stored.plus_ones > 0 && (
                <> with <strong>{stored.plus_ones}</strong> plus-one{stored.plus_ones === 1 ? "" : "s"}</>
              )}
              .
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="btn-ghost text-xs"
          >
            <PencilLine size={14} /> Update RSVP
          </button>
        </div>
      </section>
    );
  }

  return (
    <RsvpForm
      token={token}
      initial={stored}
      onCancel={stored ? () => setEditing(false) : undefined}
      onSubmitted={handleSubmitted}
    />
  );
}

function RsvpForm({
  token,
  initial,
  onCancel,
  onSubmitted,
}: {
  token: string;
  initial: StoredRsvp | null;
  onCancel?: () => void;
  onSubmitted: (saved: StoredRsvp) => void;
}) {
  const baseId = useId();
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [rsvp, setRsvp] = useState<RsvpChoice>(initial?.rsvp ?? "yes");
  const [plusOnes, setPlusOnes] = useState<number>(initial?.plus_ones ?? 0);
  const [dietary, setDietary] = useState(initial?.dietary ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Please tell us your name so the host knows who's coming.");
      return;
    }
    setSubmitting(true);
    const payload: PublicRsvpPayload = {
      name: trimmedName,
      email: email.trim() || undefined,
      rsvp,
      plus_ones: Math.max(0, Math.floor(plusOnes || 0)),
      dietary: dietary.trim() || undefined,
      notes: notes.trim() || undefined,
    };
    const { data, error: rpcError } = await supabase.rpc("submit_public_rsvp", {
      _token: token,
      _payload: payload,
    });
    setSubmitting(false);
    if (rpcError) {
      setError(friendlyRsvpError(rpcError.message));
      return;
    }
    const result = (data ?? null) as { ok?: boolean } | null;
    if (!result?.ok) {
      setError("We couldn't save your RSVP. Please try again.");
      return;
    }
    onSubmitted({
      name: trimmedName,
      email: payload.email ?? "",
      rsvp,
      plus_ones: payload.plus_ones,
      dietary: payload.dietary ?? "",
      notes: payload.notes ?? "",
      submitted_at: new Date().toISOString(),
    });
  };

  return (
    <section className="card p-5" aria-label="RSVP to this event">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="font-display font-bold flex items-center gap-2">
            <PartyPopper size={18} className="text-brand-600" /> RSVP
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Let the host know whether you'll be there.
          </p>
        </div>
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn-ghost text-xs">
            Cancel
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-3" noValidate>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor={`${baseId}-name`}>
              Your name <span className="text-rose-600" aria-hidden>*</span>
            </label>
            <input
              id={`${baseId}-name`}
              className="input"
              autoComplete="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Alex Rivera"
              aria-required="true"
            />
          </div>
          <div>
            <label className="label" htmlFor={`${baseId}-email`}>Email (optional)</label>
            <input
              id={`${baseId}-email`}
              type="email"
              autoComplete="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="alex@example.com"
            />
          </div>
        </div>

        <fieldset>
          <legend className="label">Are you coming?</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="RSVP response">
            {(["yes", "maybe", "no"] as const).map((choice) => {
              const id = `${baseId}-rsvp-${choice}`;
              const active = rsvp === choice;
              return (
                <label
                  key={choice}
                  htmlFor={id}
                  className={`cursor-pointer px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    active
                      ? choice === "yes"
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : choice === "maybe"
                        ? "bg-amber-500 text-white border-amber-500"
                        : "bg-rose-600 text-white border-rose-600"
                      : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <input
                    id={id}
                    type="radio"
                    name={`${baseId}-rsvp`}
                    value={choice}
                    checked={active}
                    onChange={() => setRsvp(choice)}
                    className="sr-only"
                  />
                  {RSVP_LABEL[choice]}
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor={`${baseId}-plus-ones`}>Plus-ones</label>
            <input
              id={`${baseId}-plus-ones`}
              type="number"
              inputMode="numeric"
              min={0}
              max={50}
              className="input"
              value={plusOnes}
              onChange={(e) => setPlusOnes(Math.max(0, Math.min(50, Number(e.target.value) || 0)))}
            />
          </div>
          <div>
            <label className="label" htmlFor={`${baseId}-dietary`}>Dietary needs</label>
            <input
              id={`${baseId}-dietary`}
              className="input"
              value={dietary}
              onChange={(e) => setDietary(e.target.value)}
              placeholder="e.g. vegetarian, nut allergy"
            />
          </div>
        </div>

        <div>
          <label className="label" htmlFor={`${baseId}-notes`}>Anything else for the host?</label>
          <textarea
            id={`${baseId}-notes`}
            className="input min-h-[80px]"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Bringing a dish? Need a ride?"
          />
        </div>

        {error && (
          <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2" role="alert">
            {error}
          </div>
        )}

        <div className="flex justify-end">
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? "Sending…" : initial ? "Update RSVP" : "Send RSVP"}
          </button>
        </div>
      </form>
    </section>
  );
}

function friendlyRsvpError(message: string) {
  if (!message) return "We couldn't save your RSVP. Please try again.";
  if (/already received an RSVP/i.test(message)) return message;
  if (/share link is no longer/i.test(message)) return message;
  if (/RSVP must be/i.test(message)) return message;
  if (/your name/i.test(message)) return message;
  return "We couldn't save your RSVP. Please try again.";
}

function RsvpStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card p-3 text-center">
      <div className="text-xs uppercase tracking-wide font-semibold text-slate-500">{label}</div>
      <div className="font-display text-2xl font-bold text-slate-800">{value}</div>
    </div>
  );
}

function MenuCard({ item }: { item: EventItem }) {
  const meta = item.meta as {
    course?: string;
    dietary?: string[];
    servings?: number;
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="font-medium text-sm">{item.title}</div>
      <div className="text-xs text-slate-500 mt-0.5">
        {[courseLabel(meta.course), meta.servings ? `${meta.servings} servings` : null].filter(Boolean).join(" · ")}
      </div>
      {item.description && <p className="text-xs text-slate-500 mt-1">{item.description}</p>}
      {Array.isArray(meta.dietary) && meta.dietary.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {meta.dietary.map((tag) => (
            <span key={tag} className="chip bg-emerald-50 text-emerald-700">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function DrinkCard({ item }: { item: EventItem }) {
  const meta = item.meta as {
    type?: string;
    qty?: number;
    unit?: string;
    alcoholic?: boolean;
  };
  const quantity = [meta.qty, meta.unit].filter((value) => value !== undefined && value !== "").join(" ");
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="font-medium text-sm">{item.title}</div>
      <div className="text-xs text-slate-500 mt-0.5">
        {[drinkTypeLabel(meta.type), quantity || null, meta.alcoholic ? "Alcoholic" : "Non-alcoholic"]
          .filter(Boolean)
          .join(" · ")}
      </div>
      {item.description && <p className="text-xs text-slate-500 mt-1">{item.description}</p>}
    </div>
  );
}

function MusicCard({ item }: { item: EventItem }) {
  const meta = item.meta as {
    artist?: string;
    url?: string;
    set?: string;
    is_playlist?: boolean;
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="font-medium text-sm">{item.title}</div>
      <div className="text-xs text-slate-500 mt-0.5">
        {[meta.is_playlist ? "Playlist" : meta.artist, musicSetLabel(meta.set)].filter(Boolean).join(" · ")}
      </div>
      {meta.url && (
        <a className="text-xs text-brand-700 font-medium inline-flex items-center gap-1 mt-2" href={meta.url} target="_blank" rel="noreferrer">
          Open music <ExternalLink size={12} />
        </a>
      )}
    </div>
  );
}

function phaseLabel(phase: EventItem["phase"]) {
  if (phase === "pre") return "Pre-party";
  if (phase === "day_of") return "Day of";
  if (phase === "post") return "Post-party";
  return "Schedule item";
}

function courseLabel(course?: string) {
  const labels: Record<string, string> = {
    appetizer: "Appetizer",
    main: "Main",
    side: "Side",
    dessert: "Dessert",
    snack: "Snack",
  };
  return course ? labels[course] ?? course : null;
}

function drinkTypeLabel(type?: string) {
  const labels: Record<string, string> = {
    cocktail: "Cocktail",
    beer: "Beer",
    wine: "Wine",
    non_alc: "Non-alcoholic",
    coffee: "Coffee/Tea",
    other: "Drink",
  };
  return type ? labels[type] ?? type : null;
}

function musicSetLabel(set?: string) {
  const labels: Record<string, string> = {
    arrival: "Arrival",
    main: "Main set",
    late: "Late night",
  };
  return set ? labels[set] ?? set : null;
}

function buildGoogleCalendarUrl(event: PublicEventShare["event"]) {
  const start = event.starts_at ? new Date(event.starts_at) : new Date();
  const end = event.ends_at ? new Date(event.ends_at) : new Date(start.getTime() + 3 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.name,
    dates: `${fmt(start)}/${fmt(end)}`,
    details: [event.description, event.partiful_url].filter(Boolean).join("\n\n"),
    location: event.location ?? "",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
