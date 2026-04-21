import { useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, MapPin, Plus, Users, Sparkles } from "lucide-react";
import { useMyEvents } from "../lib/hooks";
import { formatEventDate, daysUntil } from "../lib/format";
import { NewEventDialog } from "../components/NewEventDialog";

export function Dashboard() {
  const { events, loading } = useMyEvents();
  const [creating, setCreating] = useState(false);

  const upcoming = events.filter((e) => !e.archived);
  const archived = events.filter((e) => e.archived);

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Your events</h1>
          <p className="text-slate-500 text-sm mt-1">
            Plan together. Track everything from menu to music.
          </p>
        </div>
        <button onClick={() => setCreating(true)} className="btn-primary">
          <Plus size={16} /> New event
        </button>
      </div>

      {loading ? (
        <div className="text-slate-500 text-sm">Loading…</div>
      ) : upcoming.length === 0 ? (
        <EmptyState onCreate={() => setCreating(true)} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {upcoming.map((ev) => {
            const d = daysUntil(ev.starts_at);
            return (
              <Link
                key={ev.id}
                to={`/events/${ev.id}`}
                className="card overflow-hidden hover:shadow-pop transition-shadow group"
              >
                <div
                  className="h-24 flex items-center justify-center text-4xl"
                  style={{
                    background: `linear-gradient(135deg, ${ev.cover_color}22, ${ev.cover_color}55)`,
                  }}
                >
                  <span className="drop-shadow-sm">{ev.cover_emoji}</span>
                </div>
                <div className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-display font-bold text-lg group-hover:text-brand-700">
                      {ev.name}
                    </h3>
                    {d != null && d >= 0 && d <= 30 && (
                      <span className="chip bg-amber-50 text-amber-700">
                        {d === 0 ? "Today" : `in ${d}d`}
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
            );
          })}
        </div>
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
                    <div className="font-semibold">{ev.name}</div>
                    <div className="text-xs text-slate-500">{formatEventDate(ev.starts_at)}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {creating && <NewEventDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="card p-10 text-center">
      <div className="w-14 h-14 rounded-2xl bg-brand-50 text-brand-600 grid place-items-center mx-auto mb-4">
        <Sparkles size={26} />
      </div>
      <h2 className="font-display text-xl font-bold">Throw your first party</h2>
      <p className="text-slate-500 text-sm mt-1 max-w-md mx-auto">
        Create an event, invite collaborators, and start checking off the menu, music,
        decorations, setup, and more — together.
      </p>
      <button onClick={onCreate} className="btn-primary mt-5">
        <Plus size={16} /> New event
      </button>
    </div>
  );
}
