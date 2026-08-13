import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  CalendarDays,
  CalendarPlus,
  Copy,
  MapPin,
  MoreVertical,
  PartyPopper,
  Plus,
  Search,
  Send,
  Share2,
  Sparkles,
  Star,
  Users,
  X,
} from "lucide-react";
import { useMyEvents, useWrapUpsAcrossEvents } from "../lib/hooks";
import { formatEventDate, daysUntil, formatMoney } from "../lib/format";
import { NewEventDialog } from "../components/NewEventDialog";
import { OnboardingTour } from "../components/OnboardingTour";
import { isOnboardingCompleted } from "../lib/onboarding";
import { useAuth } from "../lib/auth";
import { duplicateEvent, duplicateEventNextYear } from "../lib/duplicateEvent";
import { useToast } from "../lib/toast";
import { supabase } from "../lib/supabase";
import { TEMPLATES, type EventTemplate } from "../lib/templates";
import { createSampleEvent } from "../lib/sampleEvent";
import type { EventRow, EventShareLink, EventWrapUp } from "../lib/database.types";

type StatusFilter = "all" | "upcoming" | "past" | "no-date";

const FILTER_STORAGE_KEY = "dashboard-filter";
const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "upcoming", label: "Upcoming" },
  { value: "past", label: "Past" },
  { value: "no-date", label: "No date" },
];

function readStoredFilter(): StatusFilter {
  if (typeof window === "undefined") return "all";
  try {
    const raw = window.localStorage.getItem(FILTER_STORAGE_KEY);
    if (raw && STATUS_OPTIONS.some((o) => o.value === raw)) {
      return raw as StatusFilter;
    }
  } catch {
    // localStorage may throw in private mode / SSR
  }
  return "all";
}

function classifyEvent(ev: EventRow, now: Date): Exclude<StatusFilter, "all"> {
  if (!ev.starts_at) return "no-date";
  const t = Date.parse(ev.starts_at);
  if (Number.isNaN(t)) return "no-date";
  return t >= now.getTime() ? "upcoming" : "past";
}

interface CountdownChipInfo {
  label: string;
  className: string;
}

// Always-visible countdown chip (UX audit item #14): every card surfaces its
// temporal status (today / soon / future / past) instead of hiding the chip
// beyond the 30-day window. Returns null when the event has no date so the
// caller can simply omit the chip.
function getCountdownChip(d: number | null): CountdownChipInfo | null {
  if (d == null) return null;
  const amber = "bg-amber-50 text-amber-700";
  const muted = "bg-slate-100 text-slate-700";
  const past = "bg-slate-100 text-slate-500 italic";

  if (d === 0) return { label: "Today", className: amber };
  if (d >= 1 && d <= 7) return { label: `in ${d}d`, className: amber };
  if (d >= 8 && d <= 60) return { label: `in ${d}d`, className: muted };
  if (d >= 61) {
    // For 61+ days, prefer months (>= 60 → months); the weeks branch is
    // retained for completeness even though current bucket is always months.
    const useMonths = d >= 60;
    const value = useMonths ? Math.round(d / 30) : Math.round(d / 7);
    const unit = useMonths ? (value === 1 ? "month" : "months") : (value === 1 ? "week" : "weeks");
    return { label: `in ${value} ${unit}`, className: muted };
  }
  // d < 0 — past events (archived events are rendered separately and never
  // reach this code path, so we can show a past chip unconditionally here).
  return { label: `${Math.abs(d)} days ago`, className: past };
}

interface ActiveShareLink {
  token: string;
  url: string;
}

// Lazy fetch so EventCard does not subscribe to a realtime channel for every
// card on the dashboard. We only hit Supabase when the user clicks a share
// action. Mirrors the "active link" rule used in EventSettings.tsx.
async function fetchActiveShareLink(eventId: string): Promise<ActiveShareLink | null> {
  const { data, error } = await supabase
    .from("event_share_links")
    .select("token, enabled, revoked_at")
    .eq("event_id", eventId)
    .eq("enabled", true)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error || !data || data.length === 0) return null;
  const row = data[0] as Pick<EventShareLink, "token" | "enabled" | "revoked_at">;
  if (!row.enabled || row.revoked_at) return null;
  return {
    token: row.token,
    url: `${window.location.origin}/s/${row.token}`,
  };
}

export function Dashboard() {
  const { events, loading, error, refresh } = useMyEvents();
  const { wrapUps } = useWrapUpsAcrossEvents();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [creatingTemplateId, setCreatingTemplateId] = useState<string | undefined>(undefined);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StatusFilter>(() => readStoredFilter());
  const [tourOpen, setTourOpen] = useState(false);
  const searchId = useId();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isOnboardingCompleted()) return;
    const t = window.setTimeout(() => setTourOpen(true), 400);
    return () => window.clearTimeout(t);
  }, []);

  const openNewEvent = (templateId?: string) => {
    setCreatingTemplateId(templateId);
    setCreating(true);
  };

  const closeNewEvent = () => {
    setCreating(false);
    setCreatingTemplateId(undefined);
  };

  useEffect(() => {
    try {
      window.localStorage.setItem(FILTER_STORAGE_KEY, filter);
    } catch {
      // ignore quota / private-mode errors
    }
  }, [filter]);

  const active = useMemo(() => events.filter((e) => !e.archived), [events]);
  const archived = useMemo(() => events.filter((e) => e.archived), [events]);

  const filteredActive = useMemo(() => {
    const now = new Date();
    const q = query.trim().toLowerCase();
    return active.filter((ev) => {
      if (filter !== "all" && classifyEvent(ev, now) !== filter) return false;
      if (q) {
        const haystack = `${ev.name ?? ""} ${ev.partiful_url ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [active, filter, query]);

  const hasActive = active.length > 0;
  const isFiltered = filter !== "all" || query.trim().length > 0;
  const filteredCount = filteredActive.length;
  const resultLabel = `${filteredCount} ${filteredCount === 1 ? "event" : "events"}`;

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Your events</h1>
          <p className="text-slate-500 text-sm mt-1">
            Plan together. Track everything from menu to music.
          </p>
        </div>
        <button
          onClick={() => openNewEvent()}
          className="btn-primary"
          data-tour="new-event-btn"
        >
          <Plus size={16} /> New event
        </button>
      </div>

      {hasActive && (
        <DashboardFilters
          searchId={searchId}
          query={query}
          onQueryChange={setQuery}
          filter={filter}
          onFilterChange={setFilter}
          resultLabel={resultLabel}
          isFiltered={isFiltered}
        />
      )}

      {loading ? (
        <EventGridSkeleton />
      ) : error ? (
        <LoadError message={error} onRetry={() => void refresh()} />
      ) : !hasActive ? (
        <EmptyState
          onCreateBlank={() => openNewEvent()}
          onPickTemplate={(templateId) => openNewEvent(templateId)}
          onCreateSample={async () => {
            if (!user) return;
            const id = await createSampleEvent(user.id);
            if (id) {
              toast.success("Sample party loaded — explore every module.");
              navigate(`/events/${id}`);
            } else {
              toast.error("Couldn't load the sample party. Try a template instead.");
            }
          }}
        />
      ) : filteredActive.length === 0 ? (
        <NoResults
          onClear={() => {
            setQuery("");
            setFilter("all");
          }}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredActive.map((ev) => (
            <EventCard key={ev.id} ev={ev} />
          ))}
        </div>
      )}

      {wrapUps.length > 0 && (
        <PastPartiesPanel wrapUps={wrapUps} events={events} />
      )}

      {archived.length > 0 && (
        <div className="pt-4">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
            Archived
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {archived.map((ev) => (
              <Link
                key={ev.id}
                to={`/events/${ev.id}`}
                className="card p-4 opacity-70 hover:opacity-100"
              >
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{ev.cover_emoji}</span>
                  <div>
                    <h3 className="font-semibold text-base m-0">{ev.name}</h3>
                    <div className="text-xs text-slate-500">{formatEventDate(ev.starts_at)}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {creating && (
        <NewEventDialog
          onClose={closeNewEvent}
          initialTemplateId={creatingTemplateId}
        />
      )}

      {tourOpen && <OnboardingTour onClose={() => setTourOpen(false)} />}
    </div>
  );
}

interface DashboardFiltersProps {
  searchId: string;
  query: string;
  onQueryChange: (v: string) => void;
  filter: StatusFilter;
  onFilterChange: (f: StatusFilter) => void;
  resultLabel: string;
  isFiltered: boolean;
}

function DashboardFilters({
  searchId,
  query,
  onQueryChange,
  filter,
  onFilterChange,
  resultLabel,
  isFiltered,
}: DashboardFiltersProps) {
  return (
    <div className="card p-3 sm:p-4 space-y-3" data-tour="dashboard-filters">
      <form
        role="search"
        aria-label="Filter your events"
        onSubmit={(e) => e.preventDefault()}
        className="flex flex-col sm:flex-row sm:items-center gap-3"
      >
        <div className="flex-1 min-w-0">
          <label htmlFor={searchId} className="sr-only">
            Search your events
          </label>
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              aria-hidden
            />
            <input
              id={searchId}
              type="search"
              className="input pl-9 pr-9"
              placeholder="Search by name or Partiful URL"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              autoComplete="off"
            />
            {query && (
              <button
                type="button"
                onClick={() => onQueryChange("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-sm text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
        <div
          role="radiogroup"
          aria-label="Filter by status"
          className="inline-flex items-center bg-slate-100 rounded-lg p-1 self-start sm:self-auto"
        >
          {STATUS_OPTIONS.map((opt) => {
            const selected = filter === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onFilterChange(opt.value)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium min-h-[36px] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-400 ${
                  selected
                    ? "bg-white text-slate-900 shadow-soft"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </form>
      <p
        className="text-xs text-slate-500"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {isFiltered ? `Showing ${resultLabel}` : `${resultLabel} total`}
      </p>
    </div>
  );
}

function NoResults({ onClear }: { onClear: () => void }) {
  return (
    <div className="card p-8 text-center" role="region" aria-label="No matching events">
      <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-500 grid place-items-center mx-auto mb-3">
        <Search size={22} />
      </div>
      <h2 className="font-display text-lg font-bold">No events match your filters</h2>
      <p className="text-slate-500 text-sm mt-1">
        Try a different search term or status filter.
      </p>
      <button type="button" onClick={onClear} className="btn-secondary mt-4">
        Clear filters
      </button>
    </div>
  );
}

interface PastPartiesPanelProps {
  wrapUps: EventWrapUp[];
  events: EventRow[];
}

function PastPartiesPanel({ wrapUps, events }: PastPartiesPanelProps) {
  const eventsById = useMemo(() => {
    const map = new Map<string, EventRow>();
    events.forEach((ev) => map.set(ev.id, ev));
    return map;
  }, [events]);

  const stats = useMemo(() => {
    const perGuestValues: number[] = [];
    const ratings: number[] = [];
    wrapUps.forEach((w) => {
      if (w.final_cost_cents > 0 && w.guest_count > 0) {
        perGuestValues.push(w.final_cost_cents / w.guest_count);
      }
      if (typeof w.vendor_rating === "number" && w.vendor_rating > 0) {
        ratings.push(w.vendor_rating);
      }
    });
    const avgPerGuest =
      perGuestValues.length > 0
        ? perGuestValues.reduce((a, b) => a + b, 0) / perGuestValues.length
        : null;
    const avgRating =
      ratings.length > 0
        ? ratings.reduce((a, b) => a + b, 0) / ratings.length
        : null;
    return {
      count: wrapUps.length,
      avgPerGuestCents: avgPerGuest,
      avgRating,
      ratingSampleSize: ratings.length,
    };
  }, [wrapUps]);

  const recentLessons = useMemo(() => {
    return wrapUps
      .filter((w) => w.lessons && w.lessons.trim().length > 0)
      .slice(0, 3)
      .map((w) => ({
        eventId: w.event_id,
        eventName: eventsById.get(w.event_id)?.name ?? "Untitled event",
        snippet: truncate((w.lessons ?? "").trim(), 100),
      }));
  }, [wrapUps, eventsById]);

  return (
    <section
      className="card p-4 sm:p-5 space-y-4"
      aria-labelledby="past-parties-heading"
    >
      <div className="flex items-center gap-2">
        <span className="w-9 h-9 rounded-xl bg-brand-50 text-brand-600 grid place-items-center">
          <PartyPopper size={18} />
        </span>
        <div>
          <h2
            id="past-parties-heading"
            className="font-display text-lg font-bold"
          >
            Past parties
          </h2>
          <p className="text-xs text-slate-500">
            Insights from events you've already wrapped up.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat
          label="Completed parties"
          value={String(stats.count)}
          hint={stats.count === 1 ? "wrap-up filed" : "wrap-ups filed"}
        />
        <Stat
          label="Avg cost / guest"
          value={
            stats.avgPerGuestCents != null
              ? formatMoney(Math.round(stats.avgPerGuestCents))
              : "—"
          }
          hint={
            stats.avgPerGuestCents != null
              ? "across parties with guest counts"
              : "no data yet"
          }
        />
        <Stat
          label="Avg vendor rating"
          value={stats.avgRating != null ? `${stats.avgRating.toFixed(1)} / 5` : "—"}
          hint={
            stats.avgRating != null
              ? `${stats.ratingSampleSize} rated`
              : "no ratings yet"
          }
          icon={stats.avgRating != null ? <Star size={14} className="text-amber-500" /> : null}
        />
      </div>

      {recentLessons.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            Recent lessons
          </h3>
          <ul className="space-y-2">
            {recentLessons.map((l) => (
              <li key={l.eventId}>
                <Link
                  to={`/events/${l.eventId}/wrap-up`}
                  className="block rounded-lg border border-slate-100 hover:border-brand-200 hover:bg-brand-50/40 px-3 py-2 transition-colors"
                >
                  <div className="text-xs font-semibold text-brand-700">
                    {l.eventName}
                  </div>
                  <p className="text-sm text-slate-700 mt-0.5">{l.snippet}</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-display text-2xl font-bold flex items-center gap-1.5">
        {icon}
        {value}
      </div>
      {hint && <div className="text-xs text-slate-500 mt-0.5">{hint}</div>}
    </div>
  );
}

function truncate(input: string, max: number): string {
  if (input.length <= max) return input;
  return `${input.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function EventCard({ ev }: { ev: EventRow }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [duplicatingNextYear, setDuplicatingNextYear] = useState(false);
  const [sharing, setSharing] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const d = daysUntil(ev.starts_at);
  const chip = getCountdownChip(d);
  const menuId = `ev-actions-${ev.id}`;

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const trigger = triggerRef.current;
    requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    });
    return () => trigger?.focus();
  }, [menuOpen]);

  const onCopyPublicLink = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuOpen(false);
    if (sharing) return;
    setSharing(true);
    try {
      const link = await fetchActiveShareLink(ev.id);
      if (link) {
        await navigator.clipboard.writeText(link.url);
        toast.success("Public link copied");
        return;
      }
      // No active link: surface a hint, then bounce to Settings & Team after a
      // short pause so the user has time to read the toast before the page
      // changes underneath them.
      toast.info("No public link yet — create one in Settings & Team");
      window.setTimeout(() => {
        nav(`/events/${ev.id}/settings`);
      }, 1200);
    } catch (err) {
      console.error("[dashboard] copy public link failed", err);
      toast.error("Couldn't copy link.");
    } finally {
      setSharing(false);
    }
  };

  const onShareVia = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuOpen(false);
    if (sharing) return;
    setSharing(true);
    try {
      const link = await fetchActiveShareLink(ev.id);
      // Prefer the public share URL; the signed-in event URL is acceptable as a
      // fallback for navigator.share because the OS share sheet usually goes to
      // contacts the user already has, and they can re-share to a logged-in
      // collaborator. For the clipboard fallback we mirror Copy public link.
      const shareUrl =
        link?.url ?? `${window.location.origin}/events/${ev.id}`;
      if (typeof navigator.share === "function") {
        try {
          await navigator.share({
            title: ev.name,
            text: `You're invited to ${ev.name}`,
            url: shareUrl,
          });
        } catch (err) {
          // AbortError fires when the user dismisses the share sheet — treat
          // as a no-op. Anything else surfaces as an error toast below.
          const isAbort =
            err instanceof DOMException && err.name === "AbortError";
          if (isAbort) return;
          throw err;
        }
        return;
      }
      // No Web Share API — mirror Copy public link: only copy if we have a
      // public link, otherwise nudge the user to create one.
      if (link) {
        await navigator.clipboard.writeText(link.url);
        toast.success("Public link copied");
        return;
      }
      toast.info("Create a public link in Settings → Public guest page");
      nav(`/events/${ev.id}/settings`);
    } catch (err) {
      console.error("[dashboard] share via failed", err);
      toast.error("Couldn't share event.");
    } finally {
      setSharing(false);
    }
  };

  const onDuplicate = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuOpen(false);
    if (!user) return;
    setDuplicating(true);
    const newId = await duplicateEvent(ev, user.id);
    setDuplicating(false);
    if (newId) nav(`/events/${newId}`);
    else toast.error("Couldn't duplicate event.");
  };

  const onDuplicateNextYear = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuOpen(false);
    if (!user) return;
    setDuplicatingNextYear(true);
    const newId = await duplicateEventNextYear(ev, user.id);
    setDuplicatingNextYear(false);
    if (newId) {
      toast.success("Duplicated as next year's event");
      nav(`/events/${newId}`);
    } else {
      toast.error("Couldn't duplicate event.");
    }
  };

  return (
    <div className="relative">
      <Link
        to={`/events/${ev.id}`}
        className="card overflow-hidden hover:shadow-pop transition-shadow group block"
      >
        <div className="relative h-24 overflow-hidden flex items-center justify-center text-4xl">
          {ev.cover_image_url ? (
            <img
              src={ev.cover_image_url}
              alt=""
              loading="lazy"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover"
              aria-hidden
            />
          ) : null}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: ev.cover_image_url
                ? `linear-gradient(135deg, ${ev.cover_color}99, ${ev.cover_color}bb)`
                : `linear-gradient(135deg, ${ev.cover_color}22, ${ev.cover_color}55)`,
            }}
          />
          <span className="relative z-1 drop-shadow-xs">{ev.cover_emoji}</span>
        </div>
        <div className="p-4 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-display font-bold text-lg group-hover:text-brand-700">
              {ev.name}
            </h3>
            {chip && (
              <span className={`chip shrink-0 ${chip.className}`}>
                {chip.label}
              </span>
            )}
          </div>
          <div className="text-sm text-slate-600 space-y-1">
            <div className="flex items-center gap-1.5">
              <CalendarDays size={14} />
              <span>{formatEventDate(ev.starts_at)}</span>
            </div>
            {ev.location && (
              <div className="flex items-center gap-1.5">
                <MapPin size={14} />
                <span className="truncate">{ev.location}</span>
              </div>
            )}
            {ev.rsvp_count > 0 && (
              <div className="flex items-center gap-1.5">
                <Users size={14} />
                <span>{ev.rsvp_count} RSVPs</span>
              </div>
            )}
          </div>
        </div>
      </Link>

      <button
        ref={triggerRef}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setMenuOpen((v) => !v);
        }}
        type="button"
        aria-label="Event actions"
        aria-expanded={menuOpen}
        aria-controls={menuId}
        aria-haspopup="true"
        className="absolute top-2 right-2 p-2 rounded-lg bg-white/80 backdrop-blur-sm hover:bg-white text-slate-700 shadow-xs"
      >
        <MoreVertical size={16} />
      </button>

      {menuOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setMenuOpen(false)}
            role="presentation"
            aria-hidden
          />
          <div
            id={menuId}
            ref={menuRef}
            role="menu"
            className="absolute top-12 right-2 z-20 card p-1 min-w-[220px]"
            aria-label={`Actions for ${ev.name}`}
          >
            <button
              type="button"
              onClick={onCopyPublicLink}
              disabled={sharing || duplicating || duplicatingNextYear}
              aria-busy={sharing}
              role="menuitem"
              className="flex items-center gap-2 px-2 py-2 rounded-sm hover:bg-slate-100 w-full text-left text-sm disabled:opacity-50"
            >
              <Share2 size={14} />
              {sharing ? "Copying…" : "Copy public link"}
            </button>
            <button
              type="button"
              onClick={onShareVia}
              disabled={sharing || duplicating || duplicatingNextYear}
              role="menuitem"
              className="flex items-center gap-2 px-2 py-2 rounded-sm hover:bg-slate-100 w-full text-left text-sm disabled:opacity-50"
            >
              <Send size={14} />
              Share via…
            </button>
            <div role="separator" className="my-1 border-t border-slate-100" />
            <button
              type="button"
              onClick={onDuplicate}
              disabled={sharing || duplicating || duplicatingNextYear}
              role="menuitem"
              className="flex items-center gap-2 px-2 py-2 rounded-sm hover:bg-slate-100 w-full text-left text-sm disabled:opacity-50"
            >
              <Copy size={14} />
              {duplicating ? "Duplicating…" : "Duplicate event"}
            </button>
            <button
              type="button"
              onClick={onDuplicateNextYear}
              disabled={sharing || duplicating || duplicatingNextYear}
              role="menuitem"
              className="flex items-center gap-2 px-2 py-2 rounded-sm hover:bg-slate-100 w-full text-left text-sm disabled:opacity-50"
            >
              <CalendarPlus size={14} />
              {duplicatingNextYear ? "Duplicating…" : "Duplicate for next year"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function EventGridSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" role="status" aria-live="polite">
      <span className="sr-only">Loading events…</span>
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="card overflow-hidden animate-pulse">
          <div className="h-24 bg-slate-100" />
          <div className="p-4 space-y-3">
            <div className="h-5 bg-slate-100 rounded-sm w-3/4" />
            <div className="h-4 bg-slate-100 rounded-sm w-1/2" />
            <div className="h-4 bg-slate-100 rounded-sm w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="card p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3" role="alert">
      <div>
        <h2 className="font-display font-bold text-slate-900">We couldn't load your events</h2>
        <p className="text-sm text-slate-500 mt-1">{message}</p>
      </div>
      <button type="button" onClick={onRetry} className="btn-secondary">
        Try again
      </button>
    </div>
  );
}

interface EmptyStateProps {
  onCreateBlank: () => void;
  onPickTemplate: (templateId: string) => void;
  onCreateSample: () => void | Promise<void>;
}

function EmptyState({ onCreateBlank, onPickTemplate, onCreateSample }: EmptyStateProps) {
  const [loadingSample, setLoadingSample] = useState(false);
  const onSample = async () => {
    if (loadingSample) return;
    setLoadingSample(true);
    try {
      await onCreateSample();
    } finally {
      setLoadingSample(false);
    }
  };

  return (
    <section
      className="card p-6 sm:p-8"
      role="region"
      aria-label="Get started with your first event"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-6">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-2xl bg-brand-50 text-brand-600 grid place-items-center shrink-0">
            <Sparkles size={22} />
          </div>
          <div>
            <h2 className="font-display text-xl font-bold">
              Throw your first party in 60 seconds
            </h2>
            <p className="text-slate-500 text-sm mt-1 max-w-md">
              Pick a template to get a head start, or build from scratch.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onSample}
          disabled={loadingSample}
          aria-busy={loadingSample}
          data-testid="dashboard-load-sample"
          className="btn-secondary self-start sm:self-auto whitespace-nowrap"
        >
          <Sparkles size={14} />
          {loadingSample ? "Loading sample…" : "Try a sample party"}
        </button>
      </div>

      <div
        className="grid grid-cols-2 sm:grid-cols-4 gap-3"
        role="list"
        aria-label="Starter templates"
      >
        {TEMPLATES.map((t) => (
          <TemplateTile
            key={t.id}
            template={t}
            onClick={() => onPickTemplate(t.id)}
          />
        ))}
        <button
          type="button"
          onClick={onCreateBlank}
          className="card p-4 text-left hover:shadow-pop transition-shadow border-2 border-dashed focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-400"
          role="listitem"
          data-tour="new-event-btn"
        >
          <div className="h-16 -mx-4 -mt-4 mb-3 flex items-center justify-center text-3xl rounded-t-xl bg-slate-50">
            <Sparkles className="text-slate-400" />
          </div>
          <div className="font-display font-bold">Blank event</div>
          <div className="text-xs text-slate-500 mt-1">
            Start from scratch.
          </div>
        </button>
      </div>

      <div className="mt-5 text-center">
        <button
          type="button"
          onClick={onCreateBlank}
          className="text-sm text-brand-700 hover:text-brand-800 hover:underline font-medium focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-400 rounded-sm"
        >
          Or create a blank event →
        </button>
      </div>
    </section>
  );
}

function TemplateTile({
  template,
  onClick,
}: {
  template: EventTemplate;
  onClick: () => void;
}) {
  const itemCount = template.items.length;
  return (
    <button
      type="button"
      onClick={onClick}
      role="listitem"
      className="card p-4 text-left hover:shadow-pop transition-shadow focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-400"
      aria-label={`Use ${template.name} template — ${itemCount} items`}
    >
      <div
        className="h-16 -mx-4 -mt-4 mb-3 flex items-center justify-center text-4xl rounded-t-xl"
        style={{
          background: `linear-gradient(135deg, ${template.color}22, ${template.color}55)`,
        }}
      >
        {template.emoji}
      </div>
      <div className="font-display font-bold">{template.name}</div>
      <div className="text-xs text-slate-500 mt-1">{itemCount} items</div>
    </button>
  );
}
