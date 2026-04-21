import { useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  Circle,
  Clock,
  Plus,
  Sparkles,
  Sun,
  Sunrise,
  Trash2,
} from "lucide-react";
import type { EventItem, EventRow, Phase } from "../lib/database.types";
import { useEventItems, useEventMembers } from "../lib/hooks";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { AssigneePicker } from "./ChecklistModule";
import { format, parseISO } from "date-fns";

const PHASES: { key: Phase; label: string; description: string; icon: typeof Sun; color: string }[] = [
  {
    key: "pre",
    label: "Pre-party",
    description: "Planning leading up to the event.",
    icon: Sunrise,
    color: "from-amber-50 to-amber-100/40 text-amber-800",
  },
  {
    key: "day_of",
    label: "Day of",
    description: "Day-of timeline and setup.",
    icon: Sun,
    color: "from-brand-50 to-brand-100/40 text-brand-800",
  },
  {
    key: "post",
    label: "Post-party",
    description: "Cleanup, returns, thank-yous.",
    icon: Sparkles,
    color: "from-emerald-50 to-emerald-100/40 text-emerald-800",
  },
];

const STARTER_TASKS: Record<Phase, string[]> = {
  pre: [
    "Confirm guest list",
    "Send Partiful invite",
    "Finalize menu",
    "Buy groceries",
    "Pick up rentals",
    "Make playlist",
  ],
  day_of: [
    "Tidy the space",
    "Set up tables & chairs",
    "Hang decorations",
    "Prep food",
    "Stock drinks & ice",
    "Greet first guests",
  ],
  post: [
    "Clean up dishes",
    "Take out trash",
    "Return rentals",
    "Send thank-yous",
    "Save photos to shared album",
  ],
};

export function TimelineModule({ event }: { event: EventRow }) {
  const { items } = useEventItems(event.id, "task");
  const { user } = useAuth();
  const members = useEventMembers(event.id, event.owner_id);
  const [newTitle, setNewTitle] = useState<Record<Phase, string>>({
    pre: "",
    day_of: "",
    post: "",
  });

  const addTask = async (phase: Phase) => {
    if (!user) return;
    const title = newTitle[phase].trim();
    if (!title) return;
    setNewTitle((v) => ({ ...v, [phase]: "" }));
    await supabase.from("event_items").insert({
      event_id: event.id,
      kind: "task",
      phase,
      title,
      created_by: user.id,
    });
  };

  const seedStarters = async (phase: Phase) => {
    if (!user) return;
    const rows = STARTER_TASKS[phase].map((title, i) => ({
      event_id: event.id,
      kind: "task" as const,
      phase,
      title,
      created_by: user.id,
      position: i,
    }));
    await supabase.from("event_items").insert(rows);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-2xl font-bold">Timeline</h2>
        <p className="text-slate-500 text-sm">
          Three phases — pre, day-of, and post. Assign tasks to your team.
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {PHASES.map((p) => {
          const phaseItems = items.filter((i) => i.phase === p.key);
          const done = phaseItems.filter((i) => i.status === "done").length;
          return (
            <div key={p.key} className="card overflow-hidden flex flex-col">
              <div
                className={`p-4 bg-gradient-to-br ${p.color}`}
              >
                <div className="flex items-center gap-2">
                  <p.icon size={18} />
                  <div>
                    <div className="font-display font-bold">{p.label}</div>
                    <div className="text-xs opacity-80">{p.description}</div>
                  </div>
                </div>
                <div className="mt-2 text-xs opacity-80">
                  {phaseItems.length === 0
                    ? "No tasks yet"
                    : `${done} of ${phaseItems.length} done`}
                </div>
              </div>
              <div className="flex-1 p-3 space-y-2 max-h-[60vh] overflow-y-auto">
                {phaseItems.length === 0 && (
                  <button
                    onClick={() => seedStarters(p.key)}
                    className="w-full text-left text-xs text-brand-600 hover:bg-brand-50 rounded p-2"
                  >
                    + Add starter tasks
                  </button>
                )}
                {phaseItems.map((it) => (
                  <TaskRow key={it.id} item={it} members={members} />
                ))}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  addTask(p.key);
                }}
                className="border-t border-slate-100 p-2 flex items-center gap-1"
              >
                <Plus size={16} className="text-slate-400 ml-1" />
                <input
                  className="flex-1 bg-transparent border-0 focus:outline-none text-sm py-1"
                  placeholder="Add task…"
                  value={newTitle[p.key]}
                  onChange={(e) =>
                    setNewTitle((v) => ({ ...v, [p.key]: e.target.value }))
                  }
                />
              </form>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TaskRow({
  item,
  members,
}: {
  item: EventItem;
  members: ReturnType<typeof useEventMembers>;
}) {
  const update = async (patch: Partial<EventItem>) => {
    await supabase.from("event_items").update(patch).eq("id", item.id);
  };
  const cycle = async () => {
    const order = ["todo", "in_progress", "done"] as const;
    await update({ status: order[(order.indexOf(item.status) + 1) % order.length] });
  };
  const remove = async () => {
    await supabase.from("event_items").delete().eq("id", item.id);
  };
  const assignee = members.find((m) => m.id === item.assignee_id);

  return (
    <div className="group flex items-start gap-2 p-2 rounded-lg border border-slate-100 bg-white hover:border-slate-200">
      <button onClick={cycle} className="mt-0.5">
        {item.status === "done" ? (
          <CheckCircle2 size={18} className="text-emerald-500" />
        ) : item.status === "in_progress" ? (
          <Clock size={18} className="text-amber-500" />
        ) : (
          <Circle size={18} className="text-slate-300" />
        )}
      </button>
      <div className="flex-1 min-w-0">
        <input
          className={`w-full bg-transparent border-0 focus:outline-none text-sm ${
            item.status === "done" ? "line-through text-slate-400" : ""
          }`}
          value={item.title}
          onChange={(e) => update({ title: e.target.value })}
        />
        <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
          <input
            type="date"
            className="bg-transparent border-0 px-0 text-xs"
            value={item.due_at ? item.due_at.slice(0, 10) : ""}
            onChange={(e) =>
              update({
                due_at: e.target.value ? new Date(e.target.value).toISOString() : null,
              })
            }
          />
          {item.due_at && (
            <span className="flex items-center gap-1">
              <CalendarClock size={12} />
              {format(parseISO(item.due_at), "MMM d")}
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1 items-end">
        <AssigneePicker
          members={members}
          current={assignee}
          onChange={(id) => update({ assignee_id: id })}
        />
        <button
          onClick={remove}
          className="opacity-0 group-hover:opacity-100 text-rose-400 hover:text-rose-600"
          title="Delete"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
