import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  CalendarPlus,
  Check,
  ChevronDown,
  Clock,
  ExternalLink,
  GlassWater,
  MapPin,
  Music,
  PartyPopper,
  PencilLine,
  Share2,
  Utensils,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import type {
  EventItem,
  PublicEventShare,
} from "../lib/database.types";
import type {
  LookupRsvpByTokenResult,
} from "../lib/types.rsvpRecovery";
import { formatEventDate } from "../lib/format";
import { downloadPublicEventIcs } from "../lib/exportIcs";
import {
  RSVP_ACCENT,
  RSVP_ICON,
  RSVP_LABEL,
  type RsvpChoice,
  type StoredRsvp,
} from "./public/rsvpShared";

// Lazy chunks — kept out of the main public bundle so the hero, segmented
// control, and Add-to-calendar dropdown can paint without waiting on the
// form/recovery code paths. The form loads the moment a user picks an RSVP
// choice (or arrives via a `?rsvp_token=` recovery link); the recovery
// banner only loads inside the post-submit confirmed card when the guest
// supplied an email.
const LazyRsvpForm = lazy(() => import("./public/RsvpForm"));
const LazyRecoveryLinkBanner = lazy(() => import("./public/RecoveryLinkBanner"));

// Module-cached preloader — calling it more than once is a no-op because the
// dynamic import resolves to the same module in the loader's cache.
function preloadRsvpForm(): void {
  void import("./public/RsvpForm");
}

export function PublicEventPage() {
  const { token } = useParams<{ token: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const recoveryParam = searchParams.get("rsvp_token");

  const [share, setShare] = useState<PublicEventShare | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<LookupRsvpByTokenResult | null>(null);
  const [recoveryLoading, setRecoveryLoading] = useState(false);

  const refreshShare = useCallback(async () => {
    if (!token) return;
    const { data, error: loadError } = await supabase.rpc("get_public_event_share", {
      _token: token,
    });
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
      const { data, error: loadError } = await supabase.rpc(
        "get_public_event_share",
        { _token: token },
      );
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

  // When a recovery token is in the URL, eagerly fetch the saved RSVP AND
  // start preloading the form chunk in parallel — by the time the lookup
  // resolves, the form module will already be cached.
  useEffect(() => {
    if (!recoveryParam) {
      setRecovery(null);
      return;
    }
    let cancelled = false;
    setRecoveryLoading(true);
    preloadRsvpForm();
    void (async () => {
      const { data } = await supabase.rpc("lookup_rsvp_by_token", {
        _token: recoveryParam,
      });
      if (cancelled) return;
      const parsed = (data ?? null) as LookupRsvpByTokenResult | null;
      setRecovery(parsed);
      setRecoveryLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [recoveryParam]);

  const tasks = useMemo(
    () => (share?.items ?? []).filter((item: EventItem) => item.kind === "task"),
    [share],
  );
  const menu = useMemo(
    () => (share?.items ?? []).filter((item: EventItem) => item.kind === "food"),
    [share],
  );
  const drinks = useMemo(
    () => (share?.items ?? []).filter((item: EventItem) => item.kind === "beverage"),
    [share],
  );
  const music = useMemo(
    () => (share?.items ?? []).filter((item: EventItem) => item.kind === "music"),
    [share],
  );

  if (loading) {
    return (
      <div
        className="min-h-screen grid place-items-center bg-slate-50 p-6"
        role="status"
        aria-live="polite"
      >
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
          <Link to="/" className="btn-primary mt-4">
            Go to Party Planner
          </Link>
        </div>
      </main>
    );
  }

  const { event } = share;
  const host = share.host;
  const summary = share.rsvp_summary ?? { yes: 0, maybe: 0, no: 0, pending: 0 };
  const mapsUrl = event.location
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        event.location,
      )}`
    : null;

  // Item 23 — social proof chip; never show "0 going".
  const goingChip = summary.yes >= 3 ? `🎉 ${summary.yes} going` : null;
  const maybeChip = summary.maybe > 0 ? `${summary.maybe} maybe` : null;

  return (
    <main className="min-h-screen bg-slate-50">
      {/* Item 2.1 — Hero */}
      <section
        className="p-6 sm:p-10"
        style={{
          background: `linear-gradient(135deg, ${event.cover_color}33, ${event.cover_color}88)`,
        }}
      >
        <div className="max-w-3xl mx-auto">
          <div className="text-6xl mb-3" aria-hidden>
            {event.cover_emoji}
          </div>
          <h1 className="font-display text-4xl font-bold">{event.name}</h1>
          {event.theme && <p className="text-slate-700 mt-1">{event.theme}</p>}
        </div>
      </section>

      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-4">
        {/* Item 2.2 — Date / time + location pill (single line on desktop) */}
        <div className="card p-4 flex flex-col sm:flex-row sm:items-center sm:flex-wrap gap-2 sm:gap-3 text-sm">
          <span className="inline-flex items-center gap-2 font-medium text-slate-800">
            <Clock size={16} className="text-brand-600" aria-hidden />
            <span>{formatEventDate(event.starts_at)}</span>
          </span>
          {event.ends_at && (
            <span className="text-xs text-slate-500">Ends {formatEventDate(event.ends_at)}</span>
          )}
          {event.location && (
            <span className="inline-flex items-center gap-2 text-slate-700">
              <span className="hidden sm:inline text-slate-300" aria-hidden>•</span>
              <MapPin size={16} className="text-brand-600" aria-hidden />
              <span>{event.location}</span>
              {mapsUrl && (
                <a
                  className="text-brand-700 font-medium inline-flex items-center gap-1"
                  href={mapsUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Directions <ExternalLink size={12} aria-hidden />
                </a>
              )}
            </span>
          )}
        </div>

        {/* Item 2.3 / Item 3 — Hosted by avatar + name */}
        {(host?.display_name || host?.initial) && (
          <div className="flex items-center gap-3 px-1 text-sm text-slate-600">
            <span
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-brand-700 font-semibold"
              aria-hidden
            >
              {host.initial || "?"}
            </span>
            <span>
              Hosted by{" "}
              <span className="font-medium text-slate-800">
                {host.display_name?.trim() || "your friend"}
              </span>
            </span>
          </div>
        )}

        {/* Item 2.4 — RSVP segmented control as the FIRST interaction.
            Item 1 — single source of truth for RSVP (inline form is primary).
            The lightweight placeholder lives in this main public chunk; the
            full form + submit logic lazy-loads the moment a choice is picked
            (or when a `?rsvp_token=` recovery flow is in play). */}
        <RsvpCard
          token={token ?? ""}
          eventName={event.name}
          partifulUrl={event.partiful_url}
          recovery={recovery}
          recoveryToken={recoveryParam}
          recoveryLoading={recoveryLoading}
          onClearRecovery={() => {
            setRecovery(null);
            const next = new URLSearchParams(searchParams);
            next.delete("rsvp_token");
            setSearchParams(next, { replace: true });
          }}
          onSubmitted={() => void refreshShare()}
        />

        {/* Item 2.5 — Social proof (only shows when there's something to brag about) */}
        {(goingChip || maybeChip) && (
          <div className="flex flex-wrap items-center gap-2 px-1" aria-live="polite">
            {goingChip && (
              <span className="chip bg-emerald-50 text-emerald-700">{goingChip}</span>
            )}
            {maybeChip && (
              <span className="chip bg-amber-50 text-amber-700">{maybeChip}</span>
            )}
          </div>
        )}

        {/* Item 2.6 / Item 10 — single Add-to-calendar dropdown */}
        <AddToCalendarMenu event={event} />

        {/* Existing sections, in original order */}
        <section className="card p-5">
          <h2 className="font-display font-bold mb-3 flex items-center gap-2">
            <Clock size={18} className="text-brand-600" aria-hidden /> Schedule
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
            <Utensils size={18} className="text-brand-600" aria-hidden /> Food
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
            <GlassWater size={18} className="text-brand-600" aria-hidden /> Drinks
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
              <Music size={18} className="text-brand-600" aria-hidden /> Music
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

// ============================================================================
// Item 10 — single "Add to calendar" dropdown (Google / Outlook / Apple / Yahoo)
// ============================================================================
function AddToCalendarMenu({ event }: { event: PublicEventShare["event"] }) {
  const [open, setOpen] = useState(false);
  const detailsRef = useRef<HTMLDetailsElement | null>(null);

  // Close on outside click — keeps the popover from sticking open when the
  // user taps elsewhere on the page (especially on mobile where the
  // <details> summary doesn't auto-collapse).
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const node = detailsRef.current;
      if (!node) return;
      if (!node.contains(e.target as Node)) {
        node.open = false;
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const close = () => {
    if (detailsRef.current) detailsRef.current.open = false;
    setOpen(false);
  };

  const googleUrl = buildGoogleCalendarUrl(event);
  const outlookUrl = buildOutlookCalendarUrl(event);
  const yahooUrl = buildYahooCalendarUrl(event);

  return (
    <details
      ref={detailsRef}
      className="group relative"
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary
        className="btn-secondary inline-flex cursor-pointer list-none w-full sm:w-auto justify-center"
        aria-haspopup="menu"
      >
        <CalendarPlus size={14} aria-hidden /> Add to calendar
        <ChevronDown
          size={14}
          aria-hidden
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        />
      </summary>
      <div
        role="menu"
        aria-label="Add to calendar options"
        className="absolute left-0 sm:left-auto sm:right-0 z-20 mt-2 w-full sm:w-64 card p-1 shadow-pop"
      >
        <a
          role="menuitem"
          href={googleUrl}
          target="_blank"
          rel="noreferrer"
          onClick={close}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50"
        >
          <CalendarPlus size={14} className="text-brand-600" aria-hidden /> Google Calendar
        </a>
        <a
          role="menuitem"
          href={outlookUrl}
          target="_blank"
          rel="noreferrer"
          onClick={close}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50"
        >
          <CalendarPlus size={14} className="text-brand-600" aria-hidden /> Outlook
        </a>
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            downloadPublicEventIcs(event);
            close();
          }}
          className="flex w-full items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50 text-left"
        >
          <CalendarPlus size={14} className="text-brand-600" aria-hidden /> Apple / iCal (.ics)
        </button>
        <a
          role="menuitem"
          href={yahooUrl}
          target="_blank"
          rel="noreferrer"
          onClick={close}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50"
        >
          <CalendarPlus size={14} className="text-brand-600" aria-hidden /> Yahoo
        </a>
      </div>
    </details>
  );
}

// ============================================================================
// RSVP card — segmented control + collapsible details form
// ============================================================================
function RsvpCard({
  token,
  eventName,
  partifulUrl,
  recovery,
  recoveryToken,
  recoveryLoading,
  onClearRecovery,
  onSubmitted,
}: {
  token: string;
  eventName: string;
  partifulUrl: string | null;
  recovery: LookupRsvpByTokenResult | null;
  recoveryToken: string | null;
  recoveryLoading: boolean;
  onClearRecovery: () => void;
  onSubmitted: () => void;
}) {
  const storageKey = token ? `public-rsvp:${token}` : "";
  const [stored, setStored] = useState<StoredRsvp | null>(null);
  const [editing, setEditing] = useState(false);
  // Tracks the user's first segmented-control click on the placeholder so we
  // can hand the choice off to the lazy-loaded form as `initialChoice`.
  const [pickedChoice, setPickedChoice] = useState<RsvpChoice | null>(null);

  // Hydrate cache from localStorage (fast same-device path).
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

  // Recovery token is authoritative; promote it over any local cache and
  // immediately drop the user into edit mode pre-filled with server data.
  useEffect(() => {
    if (!recovery) return;
    const meta = recovery.meta;
    setStored({
      name: meta.name,
      email: meta.email,
      rsvp: meta.rsvp,
      plus_ones: meta.plus_ones,
      dietary: meta.dietary,
      notes: meta.notes,
      submitted_at: meta.submitted_at ?? new Date().toISOString(),
    });
    setEditing(true);
  }, [recovery]);

  const handleSubmitted = (saved: StoredRsvp) => {
    setStored(saved);
    setEditing(false);
    setPickedChoice(null);
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

  // Confirmed-state card — also the home for Item 19 (forward) and Item 21
  // (recovery-link banner).
  if (stored && !editing) {
    return (
      <RsvpConfirmedCard
        token={token}
        eventName={eventName}
        stored={stored}
        partifulUrl={partifulUrl}
        onEdit={() => setEditing(true)}
      />
    );
  }

  // Lazy-load gating: keep the form chunk out of first paint until either
  //   - the user picks an RSVP choice from the lightweight placeholder, or
  //   - we already have a stored RSVP (localStorage or recovery), or
  //   - a recovery token is in the URL (cross-device update flow).
  const shouldLoadForm =
    pickedChoice !== null || stored !== null || Boolean(recoveryToken);

  if (!shouldLoadForm) {
    return (
      <RsvpChoicePlaceholder
        eventName={eventName}
        onPick={setPickedChoice}
        onPreload={preloadRsvpForm}
      />
    );
  }

  return (
    <Suspense fallback={<RsvpFormSkeleton initialChoice={pickedChoice} />}>
      <LazyRsvpForm
        token={token}
        eventName={eventName}
        initial={stored}
        initialChoice={pickedChoice ?? stored?.rsvp ?? null}
        partifulUrl={partifulUrl}
        isUpdate={Boolean(recovery)}
        recoveryToken={recovery ? recoveryToken : null}
        recoveryLoading={recoveryLoading}
        onCancel={stored ? () => setEditing(false) : undefined}
        onClearRecovery={onClearRecovery}
        onSubmitted={handleSubmitted}
      />
    </Suspense>
  );
}

// ============================================================================
// Lightweight placeholder — same heading + segmented control the form ships
// with, minus the heavy form fields & submit logic. Picking a choice
// triggers the lazy form load via `onPick`; pointer/focus interactions
// pre-warm the chunk via `onPreload` so the Suspense fallback rarely shows.
// ============================================================================
function RsvpChoicePlaceholder({
  eventName,
  onPick,
  onPreload,
}: {
  eventName: string;
  onPick: (choice: RsvpChoice) => void;
  onPreload: () => void;
}) {
  const baseId = useId();
  return (
    <section className="card p-5 space-y-4" aria-label="RSVP to this event">
      <div>
        <h2 className="font-display font-bold flex items-center gap-2">
          <PartyPopper size={18} className="text-brand-600" aria-hidden />
          RSVP to {eventName}
        </h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Tap one to start — we'll ask for the rest after.
        </p>
      </div>
      <fieldset
        // Pre-warm the form chunk on the user's first sign of intent so the
        // lazy import is in-flight (or already done) by the time their click
        // event fires. Pointer + focus together cover mouse, touch, stylus,
        // and keyboard users.
        onPointerEnter={onPreload}
        onFocus={onPreload}
      >
        <legend className="label">Are you coming?</legend>
        <div
          className="grid grid-cols-1 sm:grid-cols-3 gap-2"
          role="radiogroup"
          aria-label="RSVP response"
        >
          {(["yes", "maybe", "no"] as const).map((choice) => {
            const id = `${baseId}-rsvp-${choice}`;
            const Icon = RSVP_ICON[choice];
            const accent = RSVP_ACCENT[choice];
            return (
              <label
                key={choice}
                htmlFor={id}
                className={[
                  "cursor-pointer inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold border-2 transition-colors min-h-[48px]",
                  "focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-1",
                  accent.ring,
                  accent.idle,
                ].join(" ")}
              >
                <input
                  id={id}
                  type="radio"
                  name={`${baseId}-rsvp`}
                  value={choice}
                  checked={false}
                  onChange={() => onPick(choice)}
                  className="sr-only"
                />
                <Icon size={18} aria-hidden />
                <span>{RSVP_LABEL[choice]}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
    </section>
  );
}

// ============================================================================
// Suspense fallback — preserves the placeholder's footprint so the segmented
// control area doesn't collapse during chunk fetch. Mirrors the form's
// segmented-control spacing; the `initialChoice` lets us highlight whichever
// button the user just clicked while the form chunk is in flight.
// ============================================================================
function RsvpFormSkeleton({ initialChoice }: { initialChoice: RsvpChoice | null }) {
  return (
    <section
      className="card p-5 space-y-4"
      aria-label="RSVP to this event"
      aria-busy="true"
    >
      <div>
        <div className="h-5 w-40 rounded bg-slate-100 animate-pulse" />
        <div className="h-3 w-64 rounded bg-slate-100 animate-pulse mt-2" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" aria-hidden>
        {(["yes", "maybe", "no"] as const).map((choice) => {
          const Icon = RSVP_ICON[choice];
          const accent = RSVP_ACCENT[choice];
          const active = initialChoice === choice;
          return (
            <span
              key={choice}
              className={[
                "inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold border-2 min-h-[48px]",
                active ? accent.active : accent.idle,
              ].join(" ")}
            >
              <Icon size={18} aria-hidden />
              <span>{RSVP_LABEL[choice]}</span>
            </span>
          );
        })}
      </div>
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="h-10 rounded-lg bg-slate-100 animate-pulse" />
          <div className="h-10 rounded-lg bg-slate-100 animate-pulse" />
        </div>
        <div className="h-20 rounded-lg bg-slate-100 animate-pulse" />
      </div>
    </section>
  );
}

// ============================================================================
// RSVP confirmed view (post-submit) — also hosts Forward + recovery banner
// ============================================================================
function RsvpConfirmedCard({
  token,
  eventName,
  stored,
  partifulUrl,
  onEdit,
}: {
  token: string;
  eventName: string;
  stored: StoredRsvp;
  partifulUrl: string | null;
  onEdit: () => void;
}) {
  return (
    <section className="card p-5 space-y-4" aria-label="Your RSVP">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display font-bold flex items-center gap-2">
            <Check size={18} className="text-emerald-600" aria-hidden />
            Thanks, {stored.name}! Your RSVP is in.
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            We marked you as <strong>{RSVP_LABEL[stored.rsvp]}</strong>
            {stored.plus_ones > 0 && (
              <>
                {" "}with <strong>{stored.plus_ones}</strong> plus-one
                {stored.plus_ones === 1 ? "" : "s"}
              </>
            )}
            .
          </p>
        </div>
        <button type="button" onClick={onEdit} className="btn-ghost text-xs">
          <PencilLine size={14} aria-hidden /> Update RSVP
        </button>
      </div>

      {/* Item 19 — Forward to a friend */}
      <ForwardToFriendButton eventName={eventName} />

      {/* Item 21 — recovery-link banner (only meaningful when we have an email).
          Lazy-loaded: most viewers never hit the post-submit confirmed state
          on first paint, and even when they do they don't always supply email. */}
      {stored.email && (
        <Suspense fallback={<RecoveryBannerSkeleton />}>
          <LazyRecoveryLinkBanner shareToken={token} email={stored.email} />
        </Suspense>
      )}

      {/* Item 1 — de-emphasized Partiful fallback */}
      {partifulUrl && (
        <p className="text-xs text-slate-500">
          <a
            className="text-slate-500 hover:text-slate-700 underline decoration-slate-300"
            href={partifulUrl}
            target="_blank"
            rel="noreferrer"
          >
            Or RSVP on Partiful →
          </a>
        </p>
      )}
    </section>
  );
}

function RecoveryBannerSkeleton() {
  return (
    <div
      className="rounded-xl border border-brand-100 bg-brand-50/60 p-3 h-12 animate-pulse"
      aria-hidden
    />
  );
}

// ============================================================================
// Item 19 — Forward to a friend (native share, clipboard fallback)
// ============================================================================
function ForwardToFriendButton({ eventName }: { eventName: string }) {
  const [feedback, setFeedback] = useState<string | null>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
  }, []);

  const flash = (msg: string) => {
    setFeedback(msg);
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => setFeedback(null), 4000);
  };

  const handleClick = async () => {
    if (typeof window === "undefined") return;
    const url = window.location.href;
    const shareData = {
      title: eventName,
      text: `You're invited to ${eventName}`,
      url,
    };

    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share(shareData);
        return;
      } catch (err) {
        // AbortError = user dismissed share sheet; treat as no-op.
        const name = (err as { name?: string })?.name;
        if (name === "AbortError") return;
        // Fall through to clipboard on other errors.
      }
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.setAttribute("readonly", "");
        ta.style.position = "absolute";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      flash("Link copied — paste it anywhere");
    } catch {
      flash("Couldn't copy link automatically. Long-press the URL bar to share.");
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={handleClick} className="btn-secondary">
        <Share2 size={14} aria-hidden /> Forward to a friend
      </button>
      <span className="text-xs text-slate-500" role="status" aria-live="polite">
        {feedback}
      </span>
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
        {[courseLabel(meta.course), meta.servings ? `${meta.servings} servings` : null]
          .filter(Boolean)
          .join(" · ")}
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
  const quantity = [meta.qty, meta.unit]
    .filter((value) => value !== undefined && value !== "")
    .join(" ");
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="font-medium text-sm">{item.title}</div>
      <div className="text-xs text-slate-500 mt-0.5">
        {[
          drinkTypeLabel(meta.type),
          quantity || null,
          meta.alcoholic ? "Alcoholic" : "Non-alcoholic",
        ]
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
        {[meta.is_playlist ? "Playlist" : meta.artist, musicSetLabel(meta.set)]
          .filter(Boolean)
          .join(" · ")}
      </div>
      {meta.url && (
        <a
          className="text-xs text-brand-700 font-medium inline-flex items-center gap-1 mt-2"
          href={meta.url}
          target="_blank"
          rel="noreferrer"
        >
          Open music <ExternalLink size={12} aria-hidden />
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
  const end = event.ends_at
    ? new Date(event.ends_at)
    : new Date(start.getTime() + 3 * 60 * 60 * 1000);
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

function buildOutlookCalendarUrl(event: PublicEventShare["event"]) {
  const start = event.starts_at ? new Date(event.starts_at) : new Date();
  const end = event.ends_at
    ? new Date(event.ends_at)
    : new Date(start.getTime() + 3 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: event.name,
    startdt: start.toISOString(),
    enddt: end.toISOString(),
    body: [event.description, event.partiful_url].filter(Boolean).join("\n\n"),
    location: event.location ?? "",
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}

function buildYahooCalendarUrl(event: PublicEventShare["event"]) {
  const start = event.starts_at ? new Date(event.starts_at) : new Date();
  const end = event.ends_at
    ? new Date(event.ends_at)
    : new Date(start.getTime() + 3 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const params = new URLSearchParams({
    v: "60",
    title: event.name,
    st: fmt(start),
    et: fmt(end),
    desc: [event.description, event.partiful_url].filter(Boolean).join("\n\n"),
    in_loc: event.location ?? "",
  });
  return `https://calendar.yahoo.com/?${params.toString()}`;
}
