import { useMemo, useState } from "react";
import { Plus, Trash2, ShoppingCart, Check, Wallet } from "lucide-react";
import type { EventItem, EventRow } from "../lib/database.types";
import { useEventItems, useEventMembers } from "../lib/hooks";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import { useDebouncedSave } from "../lib/useDebouncedSave";
import { logActivity } from "../lib/activity";
import { AssigneePicker } from "./ChecklistModule";
import { formatMoney } from "../lib/format";
import { SortableList, SortableRow } from "../components/Sortable";

interface ShopMeta {
  store?: string;
  qty?: number;
  unit?: string;
  est_cost_cents?: number;
  cost_cents?: number;
}

const STORES = ["Costco", "Trader Joe's", "Whole Foods", "Local market", "Liquor store", "Online", "Other"];

export function ShoppingModule({ event }: { event: EventRow }) {
  const { items, optimisticUpdate, optimisticDelete } = useEventItems(event.id, "shopping");
  const members = useEventMembers(event.id, event.owner_id);
  const { user } = useAuth();
  const toast = useToast();
  const [newTitle, setNewTitle] = useState("");
  const [store, setStore] = useState("Costco");
  const [filter, setFilter] = useState<"all" | "todo" | "purchased">("all");

  const grouped = useMemo(() => {
    const map = new Map<string, EventItem[]>();
    items.forEach((i) => {
      const s = ((i.meta as ShopMeta).store as string) ?? "Other";
      const arr = map.get(s) ?? [];
      arr.push(i);
      map.set(s, arr);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  const totalEst = items.reduce(
    (a, i) => a + (((i.meta as ShopMeta).est_cost_cents as number) || 0),
    0
  );
  const totalSpent = items
    .filter((i) => i.status === "done")
    .reduce((a, i) => a + (((i.meta as ShopMeta).cost_cents as number) || 0), 0);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !user) return;
    const text = newTitle.trim();
    setNewTitle("");
    const { error } = await supabase.from("event_items").insert({
      event_id: event.id,
      kind: "shopping",
      title: text,
      created_by: user.id,
      meta: { store, qty: 1, unit: "ea", est_cost_cents: 0 } as ShopMeta,
    });
    if (error) {
      toast.error(error.message);
      setNewTitle(text);
    } else {
      logActivity(event.id, user.id, `added "${text}" to shopping list`);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-display text-2xl font-bold">Food Purchasing</h2>
          <p className="text-slate-500 text-sm">
            Shopping list grouped by store. Track who's buying and budget vs actual.
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <div className="flex items-center gap-1 text-slate-600">
            <Wallet size={14} className="text-slate-400" /> Est. {formatMoney(totalEst)}
          </div>
          <div className="flex items-center gap-1 text-emerald-700">
            <Check size={14} /> Spent {formatMoney(totalSpent)}
          </div>
        </div>
      </div>

      <form onSubmit={add} className="card p-2 flex items-center gap-2">
        <select
          value={store}
          onChange={(e) => setStore(e.target.value)}
          className="text-xs bg-slate-100 border-0 rounded px-2 py-1.5"
        >
          {STORES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <Plus size={16} className="text-slate-400" />
        <input
          className="flex-1 bg-transparent border-0 focus:outline-none text-sm py-1"
          placeholder="Burger buns, ice, charcoal…"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
        />
        <button className="btn-primary py-1.5 px-3 text-xs">Add</button>
      </form>

      <div className="flex gap-1 text-xs">
        {(["all", "todo", "purchased"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-2.5 py-1 rounded-full ${
              filter === f ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-600"
            }`}
          >
            {f === "all" ? "All" : f === "todo" ? "To buy" : "Purchased"}
          </button>
        ))}
      </div>

      {grouped.map(([s, list]) => {
        const filtered = list.filter((i) =>
          filter === "all" ? true : filter === "todo" ? i.status !== "done" : i.status === "done"
        );
        if (filtered.length === 0) return null;
        const groupTotal = list.reduce(
          (a, i) => a + (((i.meta as ShopMeta).cost_cents as number) || ((i.meta as ShopMeta).est_cost_cents as number) || 0),
          0
        );
        return (
          <div key={s}>
            <div className="flex items-center gap-2 mb-2 mt-4">
              <ShoppingCart size={16} className="text-brand-600" />
              <h3 className="font-display font-bold">{s}</h3>
              <span className="text-xs text-slate-500">{list.length} items · {formatMoney(groupTotal)}</span>
            </div>
            <div className="space-y-2">
              <SortableList items={filtered}>
                {(item) => (
                  <SortableRow
                    key={item.id}
                    id={item.id}
                    className="flex items-stretch gap-1"
                  >
                    <div className="flex-1 min-w-0">
                      <ShopRow
                        item={item}
                        members={members}
                        eventId={event.id}
                        optimisticUpdate={optimisticUpdate}
                        optimisticDelete={optimisticDelete}
                      />
                    </div>
                  </SortableRow>
                )}
              </SortableList>
            </div>
          </div>
        );
      })}

      {items.length === 0 && (
        <div className="card p-8 text-center text-slate-500 text-sm">
          Empty shopping list. Add ingredients, drinks, ice, supplies — anything to buy.
        </div>
      )}
    </div>
  );
}

function ShopRow({
  item,
  members,
  eventId,
  optimisticUpdate,
  optimisticDelete,
}: {
  item: EventItem;
  members: ReturnType<typeof useEventMembers>;
  eventId: string;
  optimisticUpdate: (id: string, patch: Partial<EventItem>) => void;
  optimisticDelete: (id: string) => void;
}) {
  const meta = (item.meta as ShopMeta) ?? {};
  const { user } = useAuth();
  const toast = useToast();
  const update = async (patch: Partial<EventItem>) => {
    const { error } = await supabase.from("event_items").update(patch).eq("id", item.id);
    if (error) toast.error(error.message);
  };
  const updateMeta = async (m: Partial<ShopMeta>) => {
    await update({ meta: { ...meta, ...m } });
  };
  const [titleVal, setTitleVal] = useDebouncedSave(item.title, (next) => update({ title: next }));
  const togglePurchased = async () => {
    const next = item.status === "done" ? "todo" : "done";
    optimisticUpdate(item.id, { status: next });
    const { error } = await supabase.from("event_items").update({ status: next }).eq("id", item.id);
    if (error) {
      toast.error(error.message);
      optimisticUpdate(item.id, { status: item.status });
    } else if (next === "done" && user) {
      logActivity(eventId, user.id, `bought "${item.title}"`);
    }
  };
  const remove = async () => {
    optimisticDelete(item.id);
    const { error } = await supabase.from("event_items").delete().eq("id", item.id);
    if (error) {
      toast.error(error.message);
    } else if (user) {
      logActivity(eventId, user.id, `removed "${item.title}" from shopping list`);
    }
  };
  const assignee = members.find((m) => m.id === item.assignee_id);
  const purchased = item.status === "done";

  return (
    <div className="card p-3 flex items-center gap-2 flex-wrap">
      <button onClick={togglePurchased} aria-label={purchased ? "Mark as to buy" : "Mark as purchased"}>
        <span
          className={`w-5 h-5 rounded grid place-items-center border-2 ${
            purchased ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-300"
          }`}
        >
          {purchased && <Check size={14} />}
        </span>
      </button>
      <input
        className={`flex-1 min-w-[140px] bg-transparent border-0 focus:outline-none text-sm font-medium ${
          purchased ? "line-through text-slate-400" : ""
        }`}
        value={titleVal}
        onChange={(e) => setTitleVal(e.target.value)}
      />
      <input
        type="number"
        min={0}
        step={0.5}
        className="w-14 bg-slate-100 border-0 rounded px-2 py-1 text-xs"
        placeholder="qty"
        value={meta.qty ?? ""}
        onChange={(e) => updateMeta({ qty: Number(e.target.value) || 0 })}
      />
      <input
        className="w-16 bg-slate-100 border-0 rounded px-2 py-1 text-xs"
        placeholder="unit"
        value={meta.unit ?? ""}
        onChange={(e) => updateMeta({ unit: e.target.value })}
      />
      <input
        className="w-24 bg-slate-100 border-0 rounded px-2 py-1 text-xs"
        placeholder="Est. $"
        value={meta.est_cost_cents ? (meta.est_cost_cents / 100).toFixed(2) : ""}
        onChange={(e) =>
          updateMeta({
            est_cost_cents: Math.round((Number(e.target.value) || 0) * 100),
          })
        }
      />
      <input
        className="w-24 bg-slate-100 border-0 rounded px-2 py-1 text-xs"
        placeholder="Actual $"
        value={meta.cost_cents ? (meta.cost_cents / 100).toFixed(2) : ""}
        onChange={(e) =>
          updateMeta({
            cost_cents: Math.round((Number(e.target.value) || 0) * 100),
          })
        }
      />
      <AssigneePicker
        members={members}
        current={assignee}
        onChange={(id) => update({ assignee_id: id })}
      />
      <button onClick={remove} aria-label="Delete item" className="btn-ghost text-rose-500 py-1 px-2">
        <Trash2 size={14} />
      </button>
    </div>
  );
}
