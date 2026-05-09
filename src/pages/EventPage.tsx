import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
} from "react-router-dom";
import { ArrowLeft, MoreHorizontal } from "lucide-react";
import clsx from "clsx";
import { EventCoverBackdrop } from "../components/EventCoverBackdrop";
import { useEvent } from "../lib/hooks";
import { ChecklistModule } from "../modules/ChecklistModule";
import {
  EVENT_PAGE_GROUPS,
  EVENT_PAGE_PRIMARY_MOBILE_TABS,
  EVENT_PAGE_TABS,
  type EventTabGroup,
} from "./eventPageTabs";

/**
 * Keep this set in sync with the `<Route path="…">` declarations below.
 * In dev (Vite) we cross-check `EVENT_PAGE_TABS` against this list and
 * throw early if a tab is missing a route — preventing "tab opens blank
 * page → catch-all redirect → looks broken" bugs in production.
 */
const RENDERED_ROUTE_PATHS = new Set<string>([
  "",
  "timeline",
  "guests",
  "food",
  "beverages",
  "shopping",
  "budget",
  "vendors",
  "logistics",
  "signs",
  "games",
  "music",
  "restrooms",
  "decorations",
  "setup",
  "wrap-up",
  "settings",
]);

if (import.meta.env.DEV) {
  const missing = EVENT_PAGE_TABS.filter((t) => !RENDERED_ROUTE_PATHS.has(t.to));
  if (missing.length > 0) {
    const labels = missing.map((t) => `"${t.label}" (to=${JSON.stringify(t.to)})`).join(", ");
    throw new Error(
      `EventPage: tabs missing a <Route> match: ${labels}. ` +
        `Add the route in src/pages/EventPage.tsx and update RENDERED_ROUTE_PATHS.`,
    );
  }
}

const Overview = lazy(() => import("../modules/Overview").then((m) => ({ default: m.Overview })));
const TimelineModule = lazy(() =>
  import("../modules/TimelineModule").then((m) => ({ default: m.TimelineModule }))
);
const FoodModule = lazy(() =>
  import("../modules/FoodModule").then((m) => ({ default: m.FoodModule }))
);
const BeveragesModule = lazy(() =>
  import("../modules/BeveragesModule").then((m) => ({ default: m.BeveragesModule }))
);
const ShoppingModule = lazy(() =>
  import("../modules/ShoppingModule").then((m) => ({ default: m.ShoppingModule }))
);
const MusicModule = lazy(() =>
  import("../modules/MusicModule").then((m) => ({ default: m.MusicModule }))
);
const EventSettings = lazy(() =>
  import("../modules/EventSettings").then((m) => ({ default: m.EventSettings }))
);
const GuestModule = lazy(() =>
  import("../modules/GuestModule").then((m) => ({ default: m.GuestModule }))
);
const BudgetModule = lazy(() =>
  import("../modules/BudgetModule").then((m) => ({ default: m.BudgetModule }))
);
const VendorsModule = lazy(() =>
  import("../modules/VendorsModule").then((m) => ({ default: m.VendorsModule }))
);
const WrapUpModule = lazy(() =>
  import("../modules/WrapUpModule").then((m) => ({ default: m.WrapUpModule }))
);

/** Match tab groups even when the location has a trailing slash (or lacks one). */
function stripTrailingSlash(path: string): string {
  if (path.length > 1) return path.replace(/\/+$/, "");
  return path;
}

function EventUnknownSectionRedirect() {
  const { eventId } = useParams<{ eventId: string }>();
  if (!eventId) return <Navigate to="/" replace />;
  return <Navigate to={`/events/${eventId}`} replace />;
}

export function EventPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const { event, loading, error, refresh } = useEvent(eventId);
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const morePanelRef = useRef<HTMLDivElement>(null);

  const moreTriggerRef = useRef<HTMLButtonElement>(null);

  const activeGroup: EventTabGroup = useMemo(() => {
    if (!event) return EVENT_PAGE_GROUPS[0];
    const base = `/events/${event.id}`;
    const pathname = stripTrailingSlash(location.pathname);
    const match = EVENT_PAGE_GROUPS.find((g) =>
      g.tabs.some((t) => {
        const path = stripTrailingSlash(t.to ? `${base}/${t.to}` : base);
        if (t.to === "") return pathname === path;
        return pathname === path || pathname.startsWith(`${path}/`);
      })
    );
    return match ?? EVENT_PAGE_GROUPS[0];
  }, [event, location.pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    const trigger = moreTriggerRef.current;
    const t = window.setTimeout(() => {
      const el = morePanelRef.current?.querySelector<HTMLElement>("a, button");
      el?.focus();
    }, 0);
    const focusableSel =
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setMoreOpen(false);
        return;
      }
      if (e.key !== "Tab" || !morePanelRef.current) return;
      const list = Array.from(
        morePanelRef.current.querySelectorAll<HTMLElement>(focusableSel)
      ).filter((n) => !n.hasAttribute("disabled"));
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", onKey, true);
      trigger?.focus();
    };
  }, [moreOpen]);

  if (loading) {
    return (
      <div className="p-6" role="status" aria-live="polite">
        <div className="card p-5 flex items-center gap-3 text-slate-600 shadow-soft max-w-sm">
          <span className="h-3 w-3 rounded-full bg-brand-500 animate-pulse" aria-hidden />
          <span className="text-sm font-medium">Loading event workspace…</span>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-6">
        <Link to="/" className="btn-ghost">
          <ArrowLeft size={16} /> Back to events
        </Link>
        <div className="card p-8 mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3" role="alert">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-800">We couldn't load this event</h2>
            <p className="text-slate-600 mt-1">{error}</p>
          </div>
          <button type="button" className="btn-secondary" onClick={() => void refresh()}>
            Try again
          </button>
        </div>
      </div>
    );
  }
  if (!event)
    return (
      <div className="p-6">
        <Link to="/" className="btn-ghost">
          <ArrowLeft size={16} /> Back to events
        </Link>
        <div className="card p-8 mt-3 text-center" role="region" aria-label="Event unavailable">
          <h2 className="font-display text-lg font-bold text-slate-800">Event unavailable</h2>
          <p className="text-slate-600 mt-1">This event does not exist or you do not have access.</p>
        </div>
      </div>
    );

  const tabTo = (to: string) => (to ? `/events/${event.id}/${to}` : `/events/${event.id}`);

  const showSubRow = activeGroup.tabs.length > 1;

  return (
    <div>
      <EventCoverBackdrop coverColor={event.cover_color} coverImageUrl={event.cover_image_url}>
        <div className="max-w-7xl mx-auto p-4 sm:p-6">
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-sm text-slate-900/90 hover:text-slate-900 mb-2"
          >
            <ArrowLeft size={14} /> All events
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-5xl drop-shadow-sm">{event.cover_emoji}</span>
            <div>
              <h1 className="font-display text-3xl font-bold text-slate-900 drop-shadow-sm">
                {event.name}
              </h1>
              {event.theme && (
                <p className="text-slate-800 text-sm drop-shadow-sm">{event.theme}</p>
              )}
            </div>
          </div>
        </div>
      </EventCoverBackdrop>

      <div className="hidden sm:block bg-white border-b border-slate-200 sticky top-14 z-20">
        <div className="max-w-7xl mx-auto px-2 sm:px-4">
          <nav
            className="flex overflow-x-auto gap-1 py-2 scrollbar-thin"
            aria-label="Event sections"
          >
            {EVENT_PAGE_GROUPS.map((g) => {
              const primaryTab = g.tabs[0];
              const isActive = activeGroup.id === g.id;
              return (
                <NavLink
                  key={g.id}
                  to={tabTo(primaryTab.to)}
                  end={primaryTab.to === ""}
                  data-tour={g.id === "settings" ? "settings-tab" : undefined}
                  aria-current={isActive ? "page" : undefined}
                  className={clsx(
                    "tab whitespace-nowrap",
                    isActive && "tab-active"
                  )}
                >
                  <g.icon size={16} />
                  {g.label}
                </NavLink>
              );
            })}
          </nav>
        </div>
        {showSubRow && (
          <div className="bg-slate-50/60 border-t border-slate-100">
            <div className="max-w-7xl mx-auto px-2 sm:px-4 sm:pl-6">
              <nav
                className="flex overflow-x-auto gap-1 py-1.5 scrollbar-thin"
                aria-label={`${activeGroup.label} sub-sections`}
              >
                {activeGroup.tabs.map((t) => (
                  <NavLink
                    key={t.to}
                    to={tabTo(t.to)}
                    end={t.to === ""}
                    className={({ isActive }) =>
                      clsx(
                        "flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap min-h-[32px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400",
                        isActive
                          ? "bg-white text-brand-700 shadow-sm border border-slate-200"
                          : "text-slate-600 hover:bg-white/60"
                      )
                    }
                  >
                    <t.icon size={14} />
                    {t.label}
                  </NavLink>
                ))}
              </nav>
            </div>
          </div>
        )}
      </div>

      <div className="max-w-7xl mx-auto p-4 sm:p-6 pb-24 sm:pb-6">
        <Suspense
          fallback={
            <div className="text-slate-500 text-sm" role="status" aria-live="polite">
              Loading…
            </div>
          }
        >
          <Routes>
            <Route index element={<Overview event={event} />} />
            <Route path="timeline" element={<TimelineModule event={event} />} />
            <Route path="guests" element={<GuestModule event={event} />} />
            <Route path="food" element={<FoodModule event={event} />} />
            <Route path="beverages" element={<BeveragesModule event={event} />} />
            <Route path="shopping" element={<ShoppingModule event={event} />} />
            <Route path="budget" element={<BudgetModule event={event} />} />
            <Route path="vendors" element={<VendorsModule event={event} />} />
            <Route
              path="logistics"
              element={
                <ChecklistModule
                  event={event}
                  kind="logistics"
                  title="Logistics"
                  description="Vendors, parking, permits, transport, timing — anything operational."
                  placeholder="Reserve parking spots…"
                  fields={["due", "assignee", "notes"]}
                />
              }
            />
            <Route
              path="signs"
              element={
                <ChecklistModule
                  event={event}
                  kind="sign"
                  title="Signs"
                  description="Welcome signs, directions, drink labels, table numbers."
                  placeholder="Bathroom sign with arrow…"
                  fields={["assignee", "status_chip", "notes"]}
                  metaFields={[
                    { key: "content", label: "Sign text", placeholder: "Drinks → that way" },
                    { key: "location", label: "Where it goes", placeholder: "Front gate" },
                  ]}
                />
              }
            />
            <Route
              path="games"
              element={
                <ChecklistModule
                  event={event}
                  kind="game"
                  title="Games"
                  description="Activities to keep guests entertained."
                  placeholder="Beer pong, charades, photo booth…"
                  fields={["assignee", "notes"]}
                  metaFields={[
                    { key: "supplies", label: "Supplies needed", placeholder: "10 cups, 2 balls" },
                    { key: "area", label: "Area / station", placeholder: "Backyard" },
                  ]}
                />
              }
            />
            <Route path="music" element={<MusicModule event={event} />} />
            <Route
              path="restrooms"
              element={
                <ChecklistModule
                  event={event}
                  kind="restroom"
                  title="Restrooms"
                  description="Supplies, signage, and any porta-potty arrangements."
                  placeholder="Stock TP & paper towels…"
                  fields={["assignee", "status_chip", "notes"]}
                  metaFields={[
                    { key: "location", label: "Restroom", placeholder: "Upstairs / Porta #1" },
                    { key: "qty", label: "Quantity", placeholder: "3 rolls" },
                  ]}
                />
              }
            />
            <Route
              path="decorations"
              element={
                <ChecklistModule
                  event={event}
                  kind="decoration"
                  title="Decorations"
                  description="Theme items, lighting, balloons, table settings."
                  placeholder="String lights along fence…"
                  fields={["assignee", "status_chip", "notes"]}
                  metaFields={[
                    { key: "area", label: "Area", placeholder: "Entry, table, bar…" },
                    { key: "qty", label: "Quantity", placeholder: "12" },
                  ]}
                />
              }
            />
            <Route
              path="setup"
              element={
                <ChecklistModule
                  event={event}
                  kind="setup"
                  title="Setup & Teardown"
                  description="Day-of setup tasks and cleanup. Use phases on the timeline for time-based ordering."
                  placeholder="Set up tables on the lawn…"
                  fields={["due", "assignee", "status_chip", "notes"]}
                  metaFields={[
                    { key: "duration_min", label: "Time needed (min)", placeholder: "30" },
                  ]}
                />
              }
            />
            <Route path="wrap-up" element={<WrapUpModule event={event} />} />
            <Route path="settings" element={<EventSettings event={event} />} />
            <Route path="*" element={<EventUnknownSectionRedirect />} />
          </Routes>
        </Suspense>
      </div>

      {/* Mobile bottom tab bar */}
      <nav
        className="sm:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 shadow-[0_-4px_16px_rgba(0,0,0,0.04)] safe-bottom"
        aria-label="Event primary sections"
      >
        <div className="grid grid-cols-6">
          {EVENT_PAGE_PRIMARY_MOBILE_TABS.map((t) => {
              const short = t.mobileShortLabel ?? t.label;
              const a11y =
                t.mobileShortLabel && t.mobileShortLabel !== t.label
                  ? `${t.mobileShortLabel}, ${t.label}`
                  : t.label;
              return (
            <NavLink
              key={t.to}
              to={tabTo(t.to)}
              end={t.to === ""}
              aria-label={a11y}
              className={({ isActive }) =>
                clsx(
                  "flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium min-h-[56px]",
                  isActive ? "text-brand-700" : "text-slate-500 active:bg-slate-100"
                )
              }
            >
              <t.icon size={20} />
              <span className="leading-tight">{short}</span>
            </NavLink>
              );
            })}
          <button
            type="button"
            ref={moreTriggerRef}
            onClick={() => setMoreOpen(true)}
            className="flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium min-h-[56px] text-slate-500 active:bg-slate-100"
            aria-label="More sections"
            aria-expanded={moreOpen}
            aria-controls="event-more-sections"
          >
            <MoreHorizontal size={20} />
            <span className="leading-tight">More</span>
          </button>
        </div>
      </nav>

      {/* "More" sheet */}
      {moreOpen && (
        <div
          className="sm:hidden fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm flex items-end"
          onClick={() => setMoreOpen(false)}
          role="presentation"
        >
          <div
            ref={morePanelRef}
            className="bg-white rounded-t-2xl w-full p-3 pb-6 shadow-xl safe-bottom max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
            id="event-more-sections"
            role="dialog"
            aria-modal="true"
            aria-labelledby="event-more-title"
          >
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-3" aria-hidden />
            <h2 className="font-display font-bold text-base px-2 mb-2" id="event-more-title">
              All sections
            </h2>
            <div className="space-y-4">
              {EVENT_PAGE_GROUPS.map((g) => (
                <section key={g.id} aria-label={g.label}>
                  <div className="flex items-center gap-2 px-2 mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <g.icon size={14} aria-hidden />
                    <span>{g.label}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {g.tabs.map((t) => (
                      <NavLink
                        key={t.to}
                        to={tabTo(t.to)}
                        end={t.to === ""}
                        onClick={() => setMoreOpen(false)}
                        className={({ isActive }) =>
                          clsx(
                            "flex flex-col items-center justify-center gap-1 py-3 rounded-xl text-xs font-medium border",
                            isActive
                              ? "bg-brand-50 text-brand-700 border-brand-200"
                              : "bg-white text-slate-700 border-slate-100 active:bg-slate-50"
                          )
                        }
                      >
                        <t.icon size={20} />
                        <span className="text-center leading-tight">{t.label}</span>
                      </NavLink>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
