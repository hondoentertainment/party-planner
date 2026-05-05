import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  CalendarDays,
  Check,
  Circle,
  Copy,
  ExternalLink,
  Loader2,
  MapPin,
  Pencil,
  Send,
  Share2,
  Sparkles,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import type { EventRow, Profile } from "../lib/database.types";
import { formatEventDate, daysUntil, formatMoney } from "../lib/format";
import {
  useAllItems,
  useCollaborators,
  useEventShareLinks,
  useEventWrapUp,
} from "../lib/hooks";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { useToast } from "../lib/toast";
import { logActivity } from "../lib/activity";
import { computeEventHealthChecklist, computeSuggestions } from "../lib/suggestions";
import { Sentry } from "../lib/sentry";
import { SuggestionsPanel } from "../components/SuggestionsPanel";
import { EditEventDialog } from "../components/EditEventDialog";
import { ActivityFeed } from "../components/ActivityFeed";
import { Modal } from "../components/Modal";

const KIND_TABS: { kind: string; label: string; route: string }[] = [
  { kind: "task", label: "Tasks", route: "timeline" },
  { kind: "guest", label: "Guests", route: "guests" },
  { kind: "food", label: "Menu items", route: "food" },
  { kind: "beverage", label: "Beverages", route: "beverages" },
  { kind: "shopping", label: "Shopping", route: "shopping" },
  { kind: "logistics", label: "Logistics", route: "logistics" },
  { kind: "sign", label: "Signs", route: "signs" },
  { kind: "game", label: "Games", route: "games" },
  { kind: "music", label: "Tracks", route: "music" },
  { kind: "restroom", label: "Restrooms", route: "restrooms" },
  { kind: "decoration", label: "Decorations", route: "decorations" },
  { kind: "setup", label: "Setup", route: "setup" },
];

const FIRST_RUN_BANNER_PREFIX = "pp:first-event-banner:";
const FIRST_RUN_SENTRY_PREFIX = "pp:first-run-sentry:";

function readDismissedFlag(eventId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(`${FIRST_RUN_BANNER_PREFIX}${eventId}`) === "1";
  } catch {
    return false;
  }
}

function writeDismissedFlag(eventId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${FIRST_RUN_BANNER_PREFIX}${eventId}`, "1");
  } catch {
    /* ignore quota / privacy mode */
  }
}

export function Overview({ event }: { event: EventRow }) {
  const { user, profile } = useAuth();
  const { items } = useAllItems(event.id);
  const { collabs } = useCollaborators(event.id);
  const { links, refresh: refreshLinks } = useEventShareLinks(event.id);
  const { wrapUp } = useEventWrapUp(event.id);
  const ownerProfile = useOwnerProfile(event.owner_id, user?.id, profile);
  const [editing, setEditing] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(() =>
    readDismissedFlag(event.id),
  );

  // Re-read the dismissed flag when navigating between events.
  useEffect(() => {
    setBannerDismissed(readDismissedFlag(event.id));
  }, [event.id]);

  const total = items.length;
  const done = items.filter((i) => i.status === "done").length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const d = daysUntil(event.starts_at);

  const totalCost = items
    .filter((i) => i.kind === "shopping")
    .reduce((acc, i) => {
      const m = i.meta as { cost_cents?: number };
      return acc + (m.cost_cents ?? 0);
    }, 0);

  const guests = items.filter((i) => i.kind === "guest");
  const confirmedGuests = guests.reduce((acc, g) => {
    const m = (g.meta ?? {}) as { rsvp?: string; plus_one?: boolean; plus_one_count?: number };
    if (m.rsvp !== "yes") return acc;
    return acc + 1 + (m.plus_one ? Math.max(0, m.plus_one_count ?? 1) : 0);
  }, 0);

  const activeLink = useMemo(
    () => links.find((l) => l.enabled && !l.revoked_at) ?? null,
    [links],
  );
  const hasPublicLink = !!activeLink;
  const hasWrapUp = !!wrapUp?.summary;

  const isOwner = user?.id === event.owner_id;
  const suggestions = useMemo(
    () =>
      computeSuggestions({
        event,
        items,
        collaborators: collabs,
        shareLinks: links,
        wrapUpFiled: isOwner ? hasWrapUp : undefined,
      }),
    [event, items, collabs, links, isOwner, hasWrapUp],
  );

  const healthChecklist = useMemo(
    () =>
      computeEventHealthChecklist({
        event,
        items,
        collaborators: collabs,
        shareLinks: links,
        wrapUpFiled: isOwner ? hasWrapUp : undefined,
      }),
    [event, items, collabs, links, isOwner, hasWrapUp],
  );

  const healthDone = healthChecklist.length
    ? healthChecklist.filter((h) => h.done).length
    : 0;

  const tCountdown = computeTCountdown(event.starts_at);

  const firstRunSteps = useMemo(
    () => [
      { id: "created", label: "Created your event", done: true, to: null as string | null },
      {
        id: "guest",
        label: "Add at least 1 guest",
        done: guests.length > 0,
        to: `/events/${event.id}/guests` as const,
      },
      {
        id: "share",
        label: "Share your public RSVP page",
        done: hasPublicLink,
        to: `/events/${event.id}/settings` as const,
      },
    ],
    [guests.length, hasPublicLink, event.id],
  );
  const firstRunComplete = firstRunSteps.every((s) => s.done);
  const showFirstRunBanner = !bannerDismissed && !firstRunComplete;

  const dismissFirstRun = () => {
    writeDismissedFlag(event.id);
    setBannerDismissed(true);
  };

  useEffect(() => {
    if (!firstRunComplete) return;
    if (!import.meta.env.PROD || !import.meta.env.VITE_SENTRY_DSN) return;
    const key = `${FIRST_RUN_SENTRY_PREFIX}${event.id}`;
    try {
      if (window.localStorage.getItem(key) === "1") return;
      window.localStorage.setItem(key, "1");
    } catch {
      return;
    }
    Sentry.captureMessage("First-run onboarding checklist completed", {
      level: "info",
      tags: { event_id: event.id },
    });
  }, [firstRunComplete, event.id]);

  return (
    <div className="space-y-6">
      {tCountdown && <TMinusPin label={tCountdown} />}

      {showFirstRunBanner && (
        <FirstRunBanner steps={firstRunSteps} onDismiss={dismissFirstRun} />
      )}

      <SuggestionsPanel
        suggestions={suggestions}
        basePath={`/events/${event.id}/`}
        localStorageDismissedKey={`pp:nudges:${event.id}`}
      />

      {healthChecklist.length > 0 && (
        <section
          className="card p-5"
          aria-labelledby="event-health-heading"
        >
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2
                id="event-health-heading"
                className="font-display font-bold text-lg flex items-center gap-2"
              >
                <Check size={18} className="text-brand-600" aria-hidden />
                Pre-event health
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                {healthDone}/{healthChecklist.length} checks · quick wins before go time
              </p>
            </div>
          </div>
          <ul className="mt-4 space-y-2">
            {healthChecklist.map((row) => (
              <li key={row.id}>
                <Link
                  to={`/events/${event.id}/${row.href}`}
                  className="flex items-start gap-3 rounded-lg border border-slate-100 px-3 py-2 hover:bg-slate-50/80 transition-colors"
                >
                  {row.done ? (
                    <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 grid place-items-center flex-shrink-0 mt-0.5">
                      <Check size={14} aria-hidden />
                    </span>
                  ) : (
                    <span
                      className="w-6 h-6 rounded-full border-2 border-slate-200 grid place-items-center flex-shrink-0 mt-0.5"
                      aria-hidden
                    >
                      <Circle size={8} className="text-slate-300 fill-current" />
                    </span>
                  )}
                  <span
                    className={
                      row.done ? "text-sm text-slate-600 line-through" : "text-sm font-medium text-slate-800"
                    }
                  >
                    {row.label}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-5 lg:col-span-2 space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-xs uppercase font-semibold text-slate-500 tracking-wide">
                Event details
              </div>
              <h2 className="font-display text-xl font-bold mt-1">{event.name}</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShareOpen(true)}
                className="btn-secondary text-sm"
                data-tour="share-link"
                aria-haspopup="dialog"
                aria-expanded={shareOpen}
              >
                <Share2 size={14} /> Share
              </button>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="btn-secondary text-sm"
              >
                <Pencil size={14} /> Edit
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <Detail icon={CalendarDays} label="When">
              {formatEventDate(event.starts_at)}
              {d != null && d >= 0 && (
                <span className="ml-2 chip bg-amber-50 text-amber-700">
                  {d === 0 ? "Today" : `in ${d}d`}
                </span>
              )}
            </Detail>
            <Detail icon={MapPin} label="Where">
              {event.location ?? "—"}
            </Detail>
            <Detail icon={Sparkles} label="Theme">
              {event.theme ?? "—"}
            </Detail>
            <Detail icon={Users} label="Confirmed guests">
              {confirmedGuests > 0 ? (
                <Link to={`/events/${event.id}/guests`} className="text-brand-600 hover:underline">
                  {confirmedGuests} attending
                </Link>
              ) : event.rsvp_count > 0 ? (
                `${event.rsvp_count} (Partiful)`
              ) : (
                <Link to={`/events/${event.id}/guests`} className="text-slate-400 hover:text-brand-600">
                  Add guests →
                </Link>
              )}
            </Detail>
            <Detail icon={Wallet} label="Spent on shopping">
              {formatMoney(totalCost)}
              {event.budget_cents > 0 && (
                <span className="text-slate-500"> / {formatMoney(event.budget_cents)} budget</span>
              )}
            </Detail>
            <Detail icon={ExternalLink} label="Partiful">
              {event.partiful_url ? (
                <a
                  href={event.partiful_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand-600 underline truncate inline-flex items-center gap-1"
                >
                  Open page <ExternalLink size={12} />
                </a>
              ) : (
                <span className="text-slate-400">Not linked</span>
              )}
            </Detail>
          </div>
          {event.description && (
            <div>
              <div className="label">Notes</div>
              <p className="text-sm whitespace-pre-wrap">{event.description}</p>
            </div>
          )}
        </div>

        <div className="card p-5 space-y-4" data-tour="overview-progress">
          <div>
            <div className="text-xs uppercase font-semibold text-slate-500 tracking-wide">
              Overall progress
            </div>
            <div className="mt-2 flex items-end gap-2">
              <div className="font-display text-4xl font-bold">{pct}%</div>
              <div className="text-slate-500 text-sm pb-1">
                {done} / {total} done
              </div>
            </div>
            <div className="mt-2 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-500 transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
          <div>
            <div className="text-xs uppercase font-semibold text-slate-500 tracking-wide mb-2">
              Team ({1 + collabs.length})
            </div>
            <div className="flex -space-x-2">
              <div
                className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-white grid place-items-center text-xs font-semibold ring-2 ring-white"
                title={ownerProfile.name ? `Owner — ${ownerProfile.name}` : "Owner"}
                aria-label={ownerProfile.name ? `Owner: ${ownerProfile.name}` : "Owner"}
              >
                {ownerProfile.initial}
              </div>
              {collabs.slice(0, 6).map((c) => (
                <div
                  key={c.user_id}
                  className="w-8 h-8 rounded-full bg-slate-300 text-white grid place-items-center text-xs font-semibold ring-2 ring-white"
                  title={c.profile?.display_name ?? c.invited_email ?? c.user_id}
                >
                  {(c.profile?.display_name ?? c.invited_email ?? "?").slice(0, 1).toUpperCase()}
                </div>
              ))}
            </div>
            <Link
              to={`/events/${event.id}/settings`}
              className="text-xs text-brand-600 mt-2 inline-block hover:underline"
            >
              Invite collaborators →
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <h3 className="font-display text-lg font-bold mb-2">Progress by category</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {KIND_TABS.map((t) => {
              const list = items.filter((i) => i.kind === t.kind);
              const tDone = list.filter((i) => i.status === "done").length;
              const tPct = list.length ? Math.round((tDone / list.length) * 100) : 0;
              return (
                <Link
                  to={`/events/${event.id}/${t.route}`}
                  key={t.kind}
                  className="card p-3 hover:shadow-pop transition-shadow"
                >
                  <div className="text-sm font-semibold">{t.label}</div>
                  <div className="text-xs text-slate-500 mb-2">
                    {list.length === 0 ? "Nothing yet" : `${tDone} / ${list.length} done`}
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand-500"
                      style={{ width: `${tPct}%` }}
                    />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
        <ActivityFeed eventId={event.id} />
      </div>

      {editing && <EditEventDialog event={event} onClose={() => setEditing(false)} />}
      {shareOpen && (
        <ShareEventModal
          event={event}
          activeLink={activeLink}
          onClose={() => setShareOpen(false)}
          onLinkChange={() => void refreshLinks()}
        />
      )}
    </div>
  );
}

/* ---------- Subcomponents ---------- */

function Detail({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof MapPin;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon size={16} className="text-slate-400 mt-0.5 flex-shrink-0" />
      <div className="min-w-0">
        <div className="text-xs text-slate-500">{label}</div>
        <div className="font-medium truncate">{children}</div>
      </div>
    </div>
  );
}

function TMinusPin({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-xl border border-brand-200 bg-gradient-to-r from-brand-50 via-brand-100/70 to-amber-50 text-brand-900 px-4 py-2.5 flex items-center gap-2 text-sm font-semibold shadow-soft"
    >
      <CalendarClock size={16} className="text-brand-600 flex-shrink-0" aria-hidden />
      <span className="truncate">{label}</span>
    </div>
  );
}

interface FirstRunStep {
  id: string;
  label: string;
  done: boolean;
  to: string | null;
}

function FirstRunBanner({
  steps,
  onDismiss,
}: {
  steps: FirstRunStep[];
  onDismiss: () => void;
}) {
  return (
    <section
      className="rounded-xl border border-brand-200 bg-brand-50 text-brand-900 p-4 relative"
      role="region"
      aria-label="Getting started checklist"
    >
      <button
        type="button"
        onClick={onDismiss}
        className="absolute top-2 right-2 p-1 rounded text-brand-700/70 hover:text-brand-900 hover:bg-brand-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
        aria-label="Dismiss getting started checklist"
      >
        <X size={14} />
      </button>
      <div className="text-sm font-semibold mb-3 flex items-center gap-2">
        <Sparkles size={14} className="text-brand-600" aria-hidden />
        Get your event ready
      </div>
      <ul className="space-y-2 text-sm">
        {steps.map((s) => {
          const inner = (
            <span className="flex items-center gap-2">
              {s.done ? (
                <span className="w-5 h-5 rounded-full bg-brand-600 text-white grid place-items-center flex-shrink-0">
                  <Check size={12} aria-hidden />
                </span>
              ) : (
                <span
                  className="w-5 h-5 rounded-full border-2 border-brand-400 grid place-items-center flex-shrink-0 animate-pulse"
                  aria-hidden
                >
                  <Circle size={6} className="text-brand-400 fill-current" />
                </span>
              )}
              <span className={s.done ? "line-through text-brand-700/70" : "font-medium"}>
                {s.label}
              </span>
            </span>
          );
          if (s.done || !s.to) {
            return (
              <li key={s.id} aria-checked={s.done} role="checkbox">
                {inner}
              </li>
            );
          }
          return (
            <li key={s.id} aria-checked={s.done} role="checkbox">
              <Link
                to={s.to}
                className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 rounded inline-flex"
              >
                {inner}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ShareEventModal({
  event,
  activeLink,
  onClose,
  onLinkChange,
}: {
  event: EventRow;
  activeLink: { id: string; token: string } | null;
  onClose: () => void;
  onLinkChange: () => void;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const publicUrl = activeLink
    ? `${window.location.origin}/s/${activeLink.token}`
    : "";
  const qrSrc = publicUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(publicUrl)}`
    : null;
  const canShareApi =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  const onCopy = async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success("Public link copied");
    } catch {
      toast.error("Couldn't copy. Try selecting the link and copying manually.");
    }
  };

  const onEmailMe = async () => {
    if (!activeLink || emailing) return;
    setEmailing(true);
    try {
      const { data, error } = await supabase.functions.invoke("notify-share", {
        body: { event_id: event.id, share_token: activeLink.token },
      });
      if (error) {
        const detail =
          (data as { error?: string } | null)?.error ?? error.message ?? "Could not send email.";
        toast.error(detail);
        return;
      }
      toast.success("Sent! Check your inbox.");
    } catch (err) {
      toast.error((err as Error).message ?? "Couldn't send email.");
    } finally {
      setEmailing(false);
    }
  };

  const onShareVia = async () => {
    if (!canShareApi) return;
    const url = publicUrl || `${window.location.origin}/events/${event.id}`;
    try {
      await navigator.share({
        title: event.name,
        text: `You're invited to ${event.name}`,
        url,
      });
    } catch (err) {
      const isAbort = err instanceof DOMException && err.name === "AbortError";
      if (!isAbort) toast.error("Couldn't open share sheet.");
    }
  };

  const onCreateLink = async () => {
    if (!user || creating) return;
    setCreating(true);
    const { error } = await supabase.rpc("create_event_share_link", {
      _event_id: event.id,
      _label: "Public guest page",
    });
    setCreating(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    void logActivity(event.id, user.id, "created a public share link");
    onLinkChange();
    toast.success("Public link created.");
  };

  return (
    <Modal title="Share event" onClose={onClose} maxWidth="max-w-md">
      {publicUrl ? (
        <div className="space-y-4">
          <div>
            <div className="label mb-1">Public RSVP link</div>
            <div className="bg-slate-50 rounded-lg p-2 text-xs break-all border border-slate-200 font-mono">
              {publicUrl}
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              <button type="button" className="btn-secondary text-sm" onClick={() => void onCopy()}>
                <Copy size={14} /> Copy link
              </button>
              <button
                type="button"
                className="btn-secondary text-sm"
                onClick={() => void onEmailMe()}
                disabled={emailing}
              >
                {emailing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Email me this link
              </button>
              {canShareApi && (
                <button
                  type="button"
                  className="btn-secondary text-sm"
                  onClick={() => void onShareVia()}
                >
                  <Share2 size={14} /> Share via…
                </button>
              )}
            </div>
          </div>
          {qrSrc && (
            <div className="border-t border-slate-100 pt-4">
              <div className="label mb-2">Scan to open</div>
              <div className="flex justify-center bg-white">
                <img
                  src={qrSrc}
                  alt={`QR code for ${event.name} public RSVP page`}
                  width={220}
                  height={220}
                  className="rounded-lg border border-slate-200"
                  loading="lazy"
                />
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Create a public RSVP page so guests can respond without logging in. You can revoke
            it anytime from Settings.
          </p>
          <button
            type="button"
            className="btn-primary text-sm"
            onClick={() => void onCreateLink()}
            disabled={creating}
          >
            {creating ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />}
            Create public link
          </button>
          {canShareApi && (
            <button
              type="button"
              className="btn-secondary text-sm w-full"
              onClick={() => void onShareVia()}
            >
              <Share2 size={14} /> Share signed-in link via…
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}

/* ---------- Helpers ---------- */

function computeTCountdown(startsAt: string | null): string | null {
  if (!startsAt) return null;
  const start = new Date(startsAt).getTime();
  if (Number.isNaN(start)) return null;
  const now = Date.now();
  const diffMs = start - now;
  if (diffMs < 0) return null;
  const oneDay = 24 * 60 * 60 * 1000;
  const days = Math.floor(diffMs / oneDay);
  if (days > 14) return null;
  if (diffMs < oneDay) {
    const hours = Math.floor(diffMs / (60 * 60 * 1000));
    const minutes = Math.floor((diffMs % (60 * 60 * 1000)) / (60 * 1000));
    return `Starts in ${hours} hour${hours === 1 ? "" : "s"}, ${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  const remainder = diffMs - days * oneDay;
  const hours = Math.floor(remainder / (60 * 60 * 1000));
  return `T-minus ${days} day${days === 1 ? "" : "s"}, ${hours} hour${hours === 1 ? "" : "s"}`;
}

interface OwnerProfileSummary {
  name: string | null;
  initial: string;
}

/**
 * Resolve the owner's display initial. Uses the current user's profile when
 * the viewer is the owner (avoids an extra fetch); otherwise pulls the owner
 * row from `profiles`. Falls back to "?" so the avatar never shows literal "Y".
 */
function useOwnerProfile(
  ownerId: string,
  currentUserId: string | undefined,
  currentProfile: Profile | null,
): OwnerProfileSummary {
  const isSelf = currentUserId === ownerId;
  const [ownerRow, setOwnerRow] = useState<Pick<
    Profile,
    "display_name" | "email"
  > | null>(null);

  useEffect(() => {
    if (isSelf) {
      setOwnerRow(null);
      return;
    }
    let cancelled = false;
    void supabase
      .from("profiles")
      .select("display_name, email")
      .eq("id", ownerId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setOwnerRow((data ?? null) as { display_name: string | null; email: string | null } | null);
      });
    return () => {
      cancelled = true;
    };
  }, [ownerId, isSelf]);

  if (isSelf) {
    const name = currentProfile?.display_name ?? currentProfile?.email ?? null;
    return { name, initial: pickInitial(name) };
  }
  const name = ownerRow?.display_name ?? ownerRow?.email ?? null;
  return { name, initial: pickInitial(name) };
}

function pickInitial(name: string | null): string {
  if (!name) return "?";
  const trimmed = name.trim();
  if (!trimmed) return "?";
  return trimmed.charAt(0).toUpperCase();
}
