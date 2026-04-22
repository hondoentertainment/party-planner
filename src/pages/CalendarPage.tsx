import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMyEvents } from "../lib/hooks";

export function CalendarPage() {
  const { events } = useMyEvents();
  const [cursor, setCursor] = useState(new Date());

  const weeks = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 });
    const days = eachDayOfInterval({ start, end });
    const out: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) out.push(days.slice(i, i + 7));
    return out;
  }, [cursor]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, typeof events>();
    events.forEach((e) => {
      if (!e.starts_at) return;
      const k = format(parseISO(e.starts_at), "yyyy-MM-dd");
      const arr = map.get(k) ?? [];
      arr.push(e);
      map.set(k, arr);
    });
    return map;
  }, [events]);

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold">Calendar</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCursor(subMonths(cursor, 1))}
            aria-label="Previous month"
            className="btn-secondary"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="font-display font-semibold text-lg w-40 text-center" aria-live="polite">
            {format(cursor, "MMMM yyyy")}
          </div>
          <button
            onClick={() => setCursor(addMonths(cursor, 1))}
            aria-label="Next month"
            className="btn-secondary"
          >
            <ChevronRight size={16} />
          </button>
          <button onClick={() => setCursor(new Date())} className="btn-ghost ml-1 text-sm">
            Today
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-100 text-xs font-semibold text-slate-500 uppercase">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="p-2 text-center">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 grid-rows-[repeat(6,minmax(80px,1fr))]">
          {weeks.flat().map((day) => {
            const k = format(day, "yyyy-MM-dd");
            const dayEvents = eventsByDay.get(k) ?? [];
            const inMonth = isSameMonth(day, cursor);
            return (
              <div
                key={day.toISOString()}
                className={`border-r border-b border-slate-100 p-1.5 min-h-[80px] ${
                  inMonth ? "bg-white" : "bg-slate-50/50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div
                    className={`text-xs w-6 h-6 grid place-items-center rounded-full ${
                      isToday(day)
                        ? "bg-brand-600 text-white font-semibold"
                        : inMonth
                        ? "text-slate-700"
                        : "text-slate-400"
                    }`}
                  >
                    {format(day, "d")}
                  </div>
                </div>
                <div className="space-y-1 mt-1">
                  {dayEvents.map((ev) => (
                    <Link
                      key={ev.id}
                      to={`/events/${ev.id}`}
                      className="block text-xs px-1.5 py-0.5 rounded truncate font-medium"
                      style={{
                        background: `${ev.cover_color}22`,
                        color: ev.cover_color,
                      }}
                      title={`${ev.cover_emoji} ${ev.name}${
                        ev.starts_at ? " — " + format(parseISO(ev.starts_at), "h:mm a") : ""
                      }`}
                    >
                      {ev.cover_emoji} {ev.name}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Upcoming list */}
      <div className="space-y-2">
        <h2 className="font-display text-lg font-bold">Upcoming</h2>
        <div className="space-y-2">
          {events
            .filter((e) => e.starts_at && parseISO(e.starts_at) >= new Date(new Date().setHours(0, 0, 0, 0)))
            .slice(0, 5)
            .map((ev) => (
              <Link
                key={ev.id}
                to={`/events/${ev.id}`}
                className="card p-3 flex items-center gap-3 hover:shadow-pop"
              >
                <span className="text-2xl">{ev.cover_emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{ev.name}</div>
                  <div className="text-xs text-slate-500">
                    {ev.starts_at && format(parseISO(ev.starts_at), "EEE, MMM d • h:mm a")}
                    {ev.location && ` • ${ev.location}`}
                  </div>
                </div>
                {ev.starts_at && isSameDay(parseISO(ev.starts_at), new Date()) && (
                  <span className="chip bg-brand-50 text-brand-700">Today</span>
                )}
              </Link>
            ))}
        </div>
      </div>
    </div>
  );
}
