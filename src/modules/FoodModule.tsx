import { useState } from "react";
import { Plus, Trash2, Cookie, Salad, IceCreamCone, ChefHat, Pizza } from "lucide-react";
import type { EventItem, EventRow } from "../lib/database.types";
import { useEventItems, useEventMembers } from "../lib/hooks";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { AssigneePicker } from "./ChecklistModule";

const COURSES = [
  { key: "appetizer", label: "Appetizers", icon: Salad },
  { key: "main", label: "Mains", icon: ChefHat },
  { key: "side", label: "Sides", icon: Pizza },
  { key: "dessert", label: "Desserts", icon: IceCreamCone },
  { key: "snack", label: "Snacks", icon: Cookie },
] as const;

const DIETARY_TAGS = ["VG", "GF", "DF", "Nut-free", "Spicy"];

interface FoodMeta {
  course?: string;
  dietary?: string[];
  servings?: number;
  brought_by?: string;
}

export function FoodModule({ event }: { event: EventRow }) {
  const { items } = useEventItems(event.id, "food");
  const members = useEventMembers(event.id, event.owner_id);
  const { user } = useAuth();
  const [newTitle, setNewTitle] = useState("");
  const [course, setCourse] = useState<string>("main");

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !user) return;
    await supabase.from("event_items").insert({
      event_id: event.id,
      kind: "food",
      title: newTitle.trim(),
      created_by: user.id,
      meta: { course, dietary: [], servings: 1 } as FoodMeta,
    });
    setNewTitle("");
  };

  const totalServings = items.reduce(
    (a, i) => a + (((i.meta as FoodMeta).servings as number) || 0),
    0
  );

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-display text-2xl font-bold">Food & Menu</h2>
          <p className="text-slate-500 text-sm">
            Build the menu by course. Tag dietary needs and track who's bringing what.
          </p>
        </div>
        <div className="text-sm text-slate-600">
          {items.length} items · {totalServings} total servings
        </div>
      </div>

      <form onSubmit={add} className="card p-2 flex items-center gap-2">
        <select
          value={course}
          onChange={(e) => setCourse(e.target.value)}
          className="text-xs bg-slate-100 border-0 rounded px-2 py-1.5"
        >
          {COURSES.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
        <Plus size={16} className="text-slate-400" />
        <input
          className="flex-1 bg-transparent border-0 focus:outline-none text-sm py-1"
          placeholder="Pulled pork sliders…"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
        />
        <button className="btn-primary py-1.5 px-3 text-xs">Add</button>
      </form>

      {COURSES.map((c) => {
        const list = items.filter((i) => (i.meta as FoodMeta).course === c.key);
        if (list.length === 0) return null;
        return (
          <div key={c.key}>
            <div className="flex items-center gap-2 mb-2 mt-4">
              <c.icon size={16} className="text-brand-600" />
              <h3 className="font-display font-bold">{c.label}</h3>
              <span className="text-xs text-slate-500">{list.length}</span>
            </div>
            <ul className="space-y-2">
              {list.map((item) => (
                <FoodRow key={item.id} item={item} members={members} />
              ))}
            </ul>
          </div>
        );
      })}

      {items.length === 0 && (
        <div className="card p-8 text-center text-slate-500 text-sm">
          No menu items yet. Add appetizers, mains, sides, and desserts above.
        </div>
      )}
    </div>
  );
}

function FoodRow({
  item,
  members,
}: {
  item: EventItem;
  members: ReturnType<typeof useEventMembers>;
}) {
  const meta = (item.meta as FoodMeta) ?? {};
  const update = async (patch: Partial<EventItem>) => {
    await supabase.from("event_items").update(patch).eq("id", item.id);
  };
  const updateMeta = async (m: Partial<FoodMeta>) => {
    await update({ meta: { ...meta, ...m } });
  };
  const remove = async () => {
    await supabase.from("event_items").delete().eq("id", item.id);
  };
  const toggleTag = (tag: string) => {
    const cur = new Set(meta.dietary ?? []);
    if (cur.has(tag)) cur.delete(tag);
    else cur.add(tag);
    updateMeta({ dietary: Array.from(cur) });
  };
  const assignee = members.find((m) => m.id === item.assignee_id);

  return (
    <li className="card p-3">
      <div className="flex items-start gap-2 flex-wrap">
        <input
          className="flex-1 min-w-[160px] bg-transparent border-0 focus:outline-none text-sm font-medium"
          value={item.title}
          onChange={(e) => update({ title: e.target.value })}
        />
        <div className="flex items-center gap-1.5 text-xs">
          <select
            className="bg-slate-100 border-0 rounded px-2 py-1 text-xs"
            value={meta.course ?? "main"}
            onChange={(e) => updateMeta({ course: e.target.value })}
          >
            {COURSES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={0}
            className="w-16 bg-slate-100 border-0 rounded px-2 py-1 text-xs"
            placeholder="Servings"
            value={meta.servings ?? ""}
            onChange={(e) => updateMeta({ servings: Number(e.target.value) || 0 })}
          />
          <AssigneePicker
            members={members}
            current={assignee}
            onChange={(id) => update({ assignee_id: id })}
          />
          <button onClick={remove} className="btn-ghost text-rose-500 py-1 px-2">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1 mt-2">
        {DIETARY_TAGS.map((t) => {
          const on = (meta.dietary ?? []).includes(t);
          return (
            <button
              key={t}
              type="button"
              onClick={() => toggleTag(t)}
              className={`chip ${
                on ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
              }`}
            >
              {t}
            </button>
          );
        })}
        <input
          className="text-xs bg-transparent border-b border-slate-200 focus:border-brand-500 focus:outline-none px-1 ml-auto w-40"
          placeholder="Notes / who's bringing"
          value={item.description ?? ""}
          onChange={(e) => update({ description: e.target.value })}
        />
      </div>
    </li>
  );
}
