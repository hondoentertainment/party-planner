import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { Link, NavLink, Navigate, Route, Routes, useParams } from "react-router-dom";
import { MoreHorizontal } from "lucide-react";
import {
  ArrowLeft,
  CalendarClock,
  ClipboardList,
  Cookie,
  GlassWater,
  Home as HomeIcon,
  ListChecks,
  type LucideIcon,
  Music,
  Paintbrush,
  ShoppingCart,
  Signpost,
  Sofa,
  ToyBrick,
  Truck,
  Users,
} from "lucide-react";
import clsx from "clsx";
import { useEvent } from "../lib/hooks";
import { ChecklistModule } from "../modules/ChecklistModule";

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

interface TabDef {
  to: string;
  label: string;
  icon: LucideIcon;
}

export const TABS: TabDef[] = [
  { to: "", label: "Overview", icon: HomeIcon },
  { to: "timeline", label: "Timeline", icon: CalendarClock },
  { to: "guests", label: "Guests", icon: Users },
  { to: "food", label: "Food", icon: Cookie },
  { to: "beverages", label: "Beverages", icon: GlassWater },
  { to: "shopping", label: "Food Purchasing", icon: ShoppingCart },
  { to: "logistics", label: "Logistics", icon: Truck },
  { to: "signs", label: "Signs", icon: Signpost },
  { to: "games", label: "Games", icon: ToyBrick },
  { to: "music", label: "Music", icon: Music },
  { to: "restrooms", label: "Restrooms", icon: ClipboardList },
  { to: "decorations", label: "Decorations", icon: Paintbrush },
  { to: "setup", label: "Setup", icon: Sofa },
  { to: "settings", label: "Settings", icon: ListChecks },
];

const PRIMARY_MOBILE_TABS: TabDef[] = TABS.filter((t) =>
  ["", "timeline", "guests", "food", "shopping"].includes(t.to)
);

export function EventPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const { event, loading } = useEvent(eventId);
  const [moreOpen, setMoreOpen] = useState(false);
  const morePanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreOpen) return;
    const t = window.setTimeout(() => {
      const el = morePanelRef.current?.querySelector<HTMLElement>("a, button");
      el?.focus();
    }, 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setMoreOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", onKey);
    };
  }, [moreOpen]);

  if (loading) return <div className="p-6 text-slate-500">Loading event…</div>;
  if (!event)
    return (
      <div className="p-6">
        <Link to="/" className="btn-ghost">
          <ArrowLeft size={16} /> Back to events
        </Link>
        <div className="card p-8 mt-3 text-center">
          <p className="text-slate-600">This event doesn't exist or you don't have access.</p>
        </div>
      </div>
    );

  return (
    <div>
      <div
        className="relative"
        style={{
          background: `linear-gradient(135deg, ${event.cover_color}33, ${event.cover_color}88)`,
        }}
      >
        <div className="max-w-7xl mx-auto p-4 sm:p-6">
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-sm text-slate-700 hover:text-slate-900 mb-2"
          >
            <ArrowLeft size={14} /> All events
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-5xl drop-shadow-sm">{event.cover_emoji}</span>
            <div>
              <h1 className="font-display text-3xl font-bold">{event.name}</h1>
              {event.theme && <p className="text-slate-700 text-sm">{event.theme}</p>}
            </div>
          </div>
        </div>
      </div>

      <div className="hidden sm:block bg-white border-b border-slate-200 sticky top-14 z-20">
        <div className="max-w-7xl mx-auto px-2 sm:px-4">
          <nav
            className="flex overflow-x-auto gap-1 py-2 scrollbar-thin"
            aria-label="Event sections"
          >
            {TABS.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.to === ""}
                className={({ isActive }) =>
                  clsx("tab whitespace-nowrap", isActive && "tab-active")
                }
              >
                <t.icon size={16} />
                {t.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 sm:p-6 pb-24 sm:pb-6">
        <Suspense fallback={<div className="text-slate-500 text-sm">Loading…</div>}>
          <Routes>
            <Route index element={<Overview event={event} />} />
            <Route path="timeline" element={<TimelineModule event={event} />} />
            <Route path="guests" element={<GuestModule event={event} />} />
            <Route path="food" element={<FoodModule event={event} />} />
            <Route path="beverages" element={<BeveragesModule event={event} />} />
            <Route path="shopping" element={<ShoppingModule event={event} />} />
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
            <Route path="settings" element={<EventSettings event={event} />} />
            <Route path="*" element={<Navigate to="" replace />} />
          </Routes>
        </Suspense>
      </div>

      {/* Mobile bottom tab bar */}
      <nav
        className="sm:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 shadow-[0_-4px_16px_rgba(0,0,0,0.04)] safe-bottom"
        aria-label="Event sections"
      >
        <div className="grid grid-cols-6">
          {PRIMARY_MOBILE_TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.to === ""}
              className={({ isActive }) =>
                clsx(
                  "flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium min-h-[56px]",
                  isActive ? "text-brand-700" : "text-slate-500 active:bg-slate-100"
                )
              }
            >
              <t.icon size={20} />
              <span className="leading-tight">{t.label}</span>
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className="flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium min-h-[56px] text-slate-500 active:bg-slate-100"
            aria-label="More sections"
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
            role="dialog"
            aria-modal="true"
            aria-labelledby="event-more-title"
          >
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-3" aria-hidden />
            <h3 className="font-display font-bold text-base px-2 mb-2" id="event-more-title">
              All sections
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {TABS.map((t) => (
                <NavLink
                  key={t.to}
                  to={t.to}
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
          </div>
        </div>
      )}
    </div>
  );
}
