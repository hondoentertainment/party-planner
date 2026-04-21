import { Link, NavLink, Navigate, Route, Routes, useParams } from "react-router-dom";
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
  Sofa,
  Signpost,
  ToyBrick,
  Truck,
} from "lucide-react";
import clsx from "clsx";
import { useEvent } from "../lib/hooks";
import { Overview } from "../modules/Overview";
import { TimelineModule } from "../modules/TimelineModule";
import { ChecklistModule } from "../modules/ChecklistModule";
import { FoodModule } from "../modules/FoodModule";
import { BeveragesModule } from "../modules/BeveragesModule";
import { ShoppingModule } from "../modules/ShoppingModule";
import { MusicModule } from "../modules/MusicModule";
import { EventSettings } from "../modules/EventSettings";

interface TabDef {
  to: string;
  label: string;
  icon: LucideIcon;
}

const TABS: TabDef[] = [
  { to: "", label: "Overview", icon: HomeIcon },
  { to: "timeline", label: "Timeline", icon: CalendarClock },
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

export function EventPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const { event, loading } = useEvent(eventId);

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
      {/* Banner */}
      <div
        className="relative"
        style={{
          background: `linear-gradient(135deg, ${event.cover_color}33, ${event.cover_color}88)`,
        }}
      >
        <div className="max-w-7xl mx-auto p-4 sm:p-6">
          <Link to="/" className="inline-flex items-center gap-1 text-sm text-slate-700 hover:text-slate-900 mb-2">
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

      {/* Tab strip */}
      <div className="bg-white border-b border-slate-200 sticky top-14 z-20">
        <div className="max-w-7xl mx-auto px-2 sm:px-4">
          <nav className="flex overflow-x-auto gap-1 py-2 scrollbar-thin">
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

      <div className="max-w-7xl mx-auto p-4 sm:p-6">
        <Routes>
          <Route index element={<Overview event={event} />} />
          <Route path="timeline" element={<TimelineModule event={event} />} />
          <Route
            path="food"
            element={<FoodModule event={event} />}
          />
          <Route
            path="beverages"
            element={<BeveragesModule event={event} />}
          />
          <Route
            path="shopping"
            element={<ShoppingModule event={event} />}
          />
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
      </div>
    </div>
  );
}
