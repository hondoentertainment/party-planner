import { useState } from "react";
import {
  CalendarDays,
  ExternalLink,
  MapPin,
  Pencil,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
import type { EventRow } from "../lib/database.types";
import { formatEventDate, daysUntil, formatMoney } from "../lib/format";
import { useAllItems, useCollaborators } from "../lib/hooks";
import { EditEventDialog } from "../components/EditEventDialog";
import { Link } from "react-router-dom";

const KIND_TABS: { kind: string; label: string; route: string }[] = [
  { kind: "task", label: "Tasks", route: "timeline" },
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

export function Overview({ event }: { event: EventRow }) {
  const { items } = useAllItems(event.id);
  const { collabs } = useCollaborators(event.id);
  const [editing, setEditing] = useState(false);

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

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-5 lg:col-span-2 space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-xs uppercase font-semibold text-slate-500 tracking-wide">
                Event details
              </div>
              <h2 className="font-display text-xl font-bold mt-1">{event.name}</h2>
            </div>
            <button onClick={() => setEditing(true)} className="btn-secondary text-sm">
              <Pencil size={14} /> Edit
            </button>
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
            <Detail icon={Users} label="RSVPs">
              {event.rsvp_count ?? 0}
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

        <div className="card p-5 space-y-4">
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
                title="Owner"
              >
                Y
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
              to="settings"
              className="text-xs text-brand-600 mt-2 inline-block hover:underline"
            >
              Invite collaborators →
            </Link>
          </div>
        </div>
      </div>

      <div>
        <h3 className="font-display text-lg font-bold mb-2">Progress by category</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {KIND_TABS.map((t) => {
            const list = items.filter((i) => i.kind === t.kind);
            const tDone = list.filter((i) => i.status === "done").length;
            const tPct = list.length ? Math.round((tDone / list.length) * 100) : 0;
            return (
              <Link
                to={t.route}
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

      {editing && <EditEventDialog event={event} onClose={() => setEditing(false)} />}
    </div>
  );
}

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
