import { useState } from "react";
import { Plus, Trash2, GlassWater, Wine, Coffee, CupSoda, Beer } from "lucide-react";
import type { EventItem, EventRow } from "../lib/database.types";
import { useEventItems, useEventMembers, useEventPermissions } from "../lib/hooks";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { logActivity } from "../lib/activity";
import { AssigneePicker } from "./ChecklistModule";

const TYPES = [
  { key: "cocktail", label: "Cocktails", icon: Wine },
  { key: "beer", label: "Beer", icon: Beer },
  { key: "wine", label: "Wine", icon: Wine },
  { key: "non_alc", label: "Non-alcoholic", icon: CupSoda },
  { key: "coffee", label: "Coffee/Tea", icon: Coffee },
  { key: "other", label: "Other", icon: GlassWater },
] as const;

interface BevMeta {
  type?: string;
  qty?: number;
  unit?: string;
  alcoholic?: boolean;
  notes?: string;
}

export function BeveragesModule({ event }: { event: EventRow }) {
  const { items } = useEventItems(event.id, "beverage");
  const members = useEventMembers(event.id, event.owner_id);
  const { user } = useAuth();
  const perms = useEventPermissions(event);
  const [newTitle, setNewTitle] = useState("");
  const [type, setType] = useState("non_alc");

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !user || !perms.canEdit) return;
    const title = newTitle.trim();
    setNewTitle("");
    const { error } = await supabase.from("event_items").insert({
      event_id: event.id,
      kind: "beverage",
      title,
      created_by: user.id,
      meta: {
        type,
        qty: 1,
        unit: type === "beer" ? "12pk" : type === "wine" ? "bottle" : "L",
        alcoholic: type !== "non_alc" && type !== "coffee",
      } as BevMeta,
    });
    if (!error) logActivity(event.id, user.id, `added beverage "${title}"`);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-2xl font-bold">Beverages</h2>
        <p className="text-slate-500 text-sm">
          Cocktails, beer, wine, and non-alcoholic options. Track quantities and ice.
        </p>
      </div>
      {!perms.canEdit && (
        <div className="card p-3 text-sm text-slate-500">Viewer access: this drink list is read-only.</div>
      )}

      <form onSubmit={add} className="card p-2 flex items-center gap-2">
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="text-xs bg-slate-100 border-0 rounded px-2 py-1.5"
          disabled={!perms.canEdit}
        >
          {TYPES.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
        <Plus size={16} className="text-slate-400" />
        <input
          className="flex-1 bg-transparent border-0 focus:outline-none text-sm py-1"
          placeholder="Margaritas, IPA, sparkling water…"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          disabled={!perms.canEdit}
        />
        <button className="btn-primary py-1.5 px-3 text-xs" disabled={!perms.canEdit}>
          Add
        </button>
      </form>

      {TYPES.map((t) => {
        const list = items.filter((i) => (i.meta as BevMeta).type === t.key);
        if (list.length === 0) return null;
        return (
          <div key={t.key}>
            <div className="flex items-center gap-2 mb-2 mt-4">
              <t.icon size={16} className="text-brand-600" />
              <h3 className="font-display font-bold">{t.label}</h3>
              <span className="text-xs text-slate-500">{list.length}</span>
            </div>
            <ul className="space-y-2">
              {list.map((item) => (
                <BevRow key={item.id} item={item} eventId={event.id} members={members} canEdit={perms.canEdit} />
              ))}
            </ul>
          </div>
        );
      })}

      {items.length === 0 && (
        <div className="card p-8 text-center text-slate-500 text-sm">
          No beverages yet. Add cocktails, beer, wine, or non-alcoholic options.
        </div>
      )}
    </div>
  );
}

function BevRow({
  item,
  eventId,
  members,
  canEdit,
}: {
  item: EventItem;
  eventId: string;
  members: ReturnType<typeof useEventMembers>;
  canEdit: boolean;
}) {
  const { user } = useAuth();
  const meta = (item.meta as BevMeta) ?? {};
  const update = async (patch: Partial<EventItem>) => {
    if (!canEdit) return;
    await supabase.from("event_items").update(patch).eq("id", item.id);
  };
  const updateMeta = async (m: Partial<BevMeta>) => {
    await update({ meta: { ...meta, ...m } });
  };
  const remove = async () => {
    if (!canEdit) return;
    await supabase.from("event_items").delete().eq("id", item.id);
    if (user) logActivity(eventId, user.id, `removed beverage "${item.title}"`);
  };
  const assignee = members.find((m) => m.id === item.assignee_id);

  return (
    <li className="card p-3 flex items-center gap-2 flex-wrap">
      <input
        className="flex-1 min-w-[140px] bg-transparent border-0 focus:outline-none text-sm font-medium"
        value={item.title}
        onChange={(e) => update({ title: e.target.value })}
        disabled={!canEdit}
      />
      <input
        type="number"
        min={0}
        step={0.5}
        className="w-16 bg-slate-100 border-0 rounded px-2 py-1 text-xs"
        value={meta.qty ?? ""}
        onChange={(e) => updateMeta({ qty: Number(e.target.value) || 0 })}
        disabled={!canEdit}
      />
      <input
        className="w-20 bg-slate-100 border-0 rounded px-2 py-1 text-xs"
        placeholder="unit"
        value={meta.unit ?? ""}
        onChange={(e) => updateMeta({ unit: e.target.value })}
        disabled={!canEdit}
      />
      <label className="flex items-center gap-1 text-xs">
        <input
          type="checkbox"
          checked={!!meta.alcoholic}
          onChange={(e) => updateMeta({ alcoholic: e.target.checked })}
          disabled={!canEdit}
        />
        Alc
      </label>
      <input
        className="flex-1 min-w-[120px] bg-transparent border-b border-slate-200 focus:border-brand-500 focus:outline-none text-xs px-1"
        placeholder="Notes (mixers, ice, garnish…)"
        value={item.description ?? ""}
        onChange={(e) => update({ description: e.target.value })}
        disabled={!canEdit}
      />
      <AssigneePicker
        members={members}
        current={assignee}
        onChange={(id) => update({ assignee_id: id })}
        disabled={!canEdit}
      />
      {canEdit && (
        <button onClick={remove} aria-label="Delete beverage" className="btn-ghost text-rose-500 py-1 px-2">
          <Trash2 size={14} />
        </button>
      )}
    </li>
  );
}
