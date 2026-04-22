import { useState } from "react";
import { Plus, Trash2, GripVertical, CheckCircle2, Circle, Clock, X, User } from "lucide-react";
import type { EventItem, EventRow, ItemKind, ItemStatus, Profile } from "../lib/database.types";
import { useEventItems, useEventMembers } from "../lib/hooks";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { format, parseISO } from "date-fns";

export type ChecklistField = "due" | "assignee" | "notes" | "status_chip";

export interface MetaField {
  key: string;
  label: string;
  placeholder?: string;
  type?: "text" | "number";
}

interface Props {
  event: EventRow;
  kind: ItemKind;
  title: string;
  description?: string;
  placeholder?: string;
  fields?: ChecklistField[];
  metaFields?: MetaField[];
  emptyHint?: string;
}

export function ChecklistModule({
  event,
  kind,
  title,
  description,
  placeholder = "New item…",
  fields = ["assignee", "notes"],
  metaFields = [],
  emptyHint,
}: Props) {
  const { items } = useEventItems(event.id, kind);
  const { user } = useAuth();
  const members = useEventMembers(event.id, event.owner_id);
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);

  const addItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !user) return;
    setAdding(true);
    await supabase.from("event_items").insert({
      event_id: event.id,
      kind,
      title: newTitle.trim(),
      created_by: user.id,
      position: items.length,
    });
    setNewTitle("");
    setAdding(false);
  };

  const total = items.length;
  const done = items.filter((i) => i.status === "done").length;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-display text-2xl font-bold">{title}</h2>
          {description && <p className="text-slate-500 text-sm mt-0.5">{description}</p>}
        </div>
        {total > 0 && (
          <div className="text-sm text-slate-600">
            {done}/{total} done
          </div>
        )}
      </div>

      <form onSubmit={addItem} className="card p-2 flex items-center gap-2">
        <Plus size={18} className="text-slate-400 ml-2" />
        <input
          className="flex-1 bg-transparent border-0 focus:outline-none text-sm py-1.5"
          placeholder={placeholder}
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
        />
        <button className="btn-primary py-1.5 px-3 text-xs" disabled={adding || !newTitle.trim()}>
          Add
        </button>
      </form>

      {items.length === 0 && (
        <div className="card p-8 text-center text-slate-500 text-sm">
          {emptyHint ?? `Nothing in ${title.toLowerCase()} yet. Add your first item above.`}
        </div>
      )}

      <ul className="space-y-2">
        {items.map((item) => (
          <ChecklistRow
            key={item.id}
            item={item}
            members={members}
            fields={fields}
            metaFields={metaFields}
          />
        ))}
      </ul>
    </div>
  );
}

function ChecklistRow({
  item,
  members,
  fields,
  metaFields,
}: {
  item: EventItem;
  members: Profile[];
  fields: ChecklistField[];
  metaFields: MetaField[];
}) {
  const [expanded, setExpanded] = useState(false);

  const update = async (patch: Partial<EventItem>) => {
    await supabase
      .from("event_items")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", item.id);
  };

  const updateMeta = async (key: string, value: unknown) => {
    const meta = { ...(item.meta as Record<string, unknown>), [key]: value };
    await update({ meta });
  };

  const cycleStatus = async () => {
    const order: ItemStatus[] = ["todo", "in_progress", "done"];
    const next = order[(order.indexOf(item.status) + 1) % order.length];
    await update({ status: next });
  };

  const remove = async () => {
    await supabase.from("event_items").delete().eq("id", item.id);
  };

  const assignee = members.find((m) => m.id === item.assignee_id);

  return (
    <li className="card overflow-hidden">
      <div className="flex items-start gap-2 p-3">
        <GripVertical size={16} className="text-slate-300 mt-1 hidden sm:block" />
        <button onClick={cycleStatus} className="mt-0.5 flex-shrink-0" title={item.status}>
          {item.status === "done" ? (
            <CheckCircle2 size={20} className="text-emerald-500" />
          ) : item.status === "in_progress" ? (
            <Clock size={20} className="text-amber-500" />
          ) : (
            <Circle size={20} className="text-slate-300" />
          )}
        </button>
        <input
          className={`flex-1 bg-transparent border-0 focus:outline-none text-sm ${
            item.status === "done" ? "line-through text-slate-400" : ""
          }`}
          value={item.title}
          onChange={(e) => update({ title: e.target.value })}
        />
        <div className="flex items-center gap-1 flex-wrap">
          {fields.includes("assignee") && (
            <AssigneePicker
              members={members}
              current={assignee}
              onChange={(id) => update({ assignee_id: id })}
            />
          )}
          {fields.includes("due") && (
            <input
              type="date"
              className="text-xs px-2 py-1 rounded border border-slate-200 bg-white"
              value={item.due_at ? item.due_at.slice(0, 10) : ""}
              onChange={(e) =>
                update({ due_at: e.target.value ? new Date(e.target.value).toISOString() : null })
              }
            />
          )}
          {fields.includes("status_chip") && <StatusChip status={item.status} />}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="btn-ghost py-1 px-2 text-xs"
            title="Details"
          >
            {expanded ? "Hide" : "More"}
          </button>
          <button
            onClick={remove}
            aria-label="Delete item"
            className="btn-ghost text-rose-500 py-1 px-2"
            title="Delete"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      {expanded && (
        <div className="border-t border-slate-100 p-3 bg-slate-50/50 space-y-3">
          {metaFields.map((mf) => {
            const value = ((item.meta as Record<string, unknown>)[mf.key] as string | number) ?? "";
            return (
              <div key={mf.key}>
                <label className="label">{mf.label}</label>
                <input
                  type={mf.type ?? "text"}
                  className="input"
                  value={String(value)}
                  placeholder={mf.placeholder}
                  onChange={(e) =>
                    updateMeta(
                      mf.key,
                      mf.type === "number" ? Number(e.target.value) || 0 : e.target.value
                    )
                  }
                />
              </div>
            );
          })}
          {fields.includes("notes") && (
            <div>
              <label className="label">Notes</label>
              <textarea
                className="input min-h-[60px]"
                value={item.description ?? ""}
                onChange={(e) => update({ description: e.target.value })}
                placeholder="Anything else…"
              />
            </div>
          )}
          {item.due_at && (
            <div className="text-xs text-slate-500">
              Due {format(parseISO(item.due_at), "MMM d, yyyy")}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function StatusChip({ status }: { status: ItemStatus }) {
  const map: Record<ItemStatus, { cls: string; label: string }> = {
    todo: { cls: "bg-slate-100 text-slate-600", label: "Todo" },
    in_progress: { cls: "bg-amber-100 text-amber-700", label: "In progress" },
    done: { cls: "bg-emerald-100 text-emerald-700", label: "Done" },
  };
  const m = map[status];
  return <span className={`chip ${m.cls}`}>{m.label}</span>;
}

export function AssigneePicker({
  members,
  current,
  onChange,
}: {
  members: Profile[];
  current?: Profile;
  onChange: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 px-2 py-1 rounded border border-slate-200 hover:bg-slate-50 text-xs"
        title={current ? `Assigned to ${current.display_name ?? current.email}` : "Assign"}
      >
        {current ? (
          <>
            <span className="w-5 h-5 rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-white grid place-items-center text-[10px] font-semibold">
              {(current.display_name ?? current.email ?? "?").slice(0, 1).toUpperCase()}
            </span>
            <span className="hidden sm:inline max-w-[80px] truncate">
              {current.display_name ?? current.email}
            </span>
          </>
        ) : (
          <>
            <User size={14} />
            <span className="hidden sm:inline">Assign</span>
          </>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 z-20 card p-1 min-w-[180px] max-h-60 overflow-auto">
            {current && (
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-100 w-full text-left text-xs text-rose-600"
              >
                <X size={14} /> Unassign
              </button>
            )}
            {members.map((m) => (
              <button
                type="button"
                key={m.id}
                onClick={() => {
                  onChange(m.id);
                  setOpen(false);
                }}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-100 w-full text-left text-xs"
              >
                <span className="w-5 h-5 rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-white grid place-items-center text-[10px] font-semibold">
                  {(m.display_name ?? m.email ?? "?").slice(0, 1).toUpperCase()}
                </span>
                <span className="truncate">{m.display_name ?? m.email}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
