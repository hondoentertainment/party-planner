import { Activity } from "lucide-react";
import { useActivity } from "../lib/activity";
import { relative } from "../lib/format";

export function ActivityFeed({ eventId, limit = 12 }: { eventId: string; limit?: number }) {
  const { items, loading } = useActivity(eventId, limit);

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-3">
        <Activity size={16} className="text-brand-600" />
        <h3 className="font-display font-bold">Recent activity</h3>
      </div>
      {loading && items.length === 0 ? (
        <div className="text-sm text-slate-400">Loading…</div>
      ) : items.length === 0 ? (
        <div className="text-sm text-slate-400">
          No activity yet. As you and your collaborators add and complete things, they'll show up here.
        </div>
      ) : (
        <ol className="relative pl-4 space-y-3 before:absolute before:left-1 before:top-1 before:bottom-1 before:w-px before:bg-slate-200">
          {items.map((it) => {
            const name =
              it.actor?.display_name ?? it.actor?.email ?? (it.actor_id ? "Someone" : "System");
            return (
              <li key={it.id} className="relative">
                <span
                  className="absolute -left-[15px] top-1.5 w-2.5 h-2.5 rounded-full bg-brand-500 ring-2 ring-white"
                  aria-hidden
                />
                <div className="text-sm">
                  <span className="font-medium">{name}</span>{" "}
                  <span className="text-slate-700">{it.message}</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {relative(it.created_at)}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
