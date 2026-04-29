import { useMemo, useState } from "react";
import { DollarSign, Plus, Trash2 } from "lucide-react";
import type { EventRow } from "../lib/database.types";
import { formatMoney, parseMoneyToCents } from "../lib/format";
import { useBudgetItems, useEventPermissions } from "../lib/hooks";
import { supabase } from "../lib/supabase";
import { useToast } from "../lib/toast";
import { useAuth } from "../lib/auth";
import { logActivity } from "../lib/activity";

const CATEGORIES = ["Food", "Drinks", "Decor", "Vendors", "Rentals", "Supplies", "Other"];

export function BudgetModule({ event }: { event: EventRow }) {
  const { items, refresh } = useBudgetItems(event.id);
  const perms = useEventPermissions(event);
  const { user } = useAuth();
  const toast = useToast();
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [estimated, setEstimated] = useState("");
  const [actual, setActual] = useState("");

  const totals = useMemo(
    () =>
      items.reduce(
        (acc, item) => ({
          estimated: acc.estimated + (item.estimated_cents ?? 0),
          actual: acc.actual + (item.actual_cents ?? 0),
        }),
        { estimated: 0, actual: 0 }
      ),
    [items]
  );
  const remaining = (event.budget_cents ?? 0) - totals.actual;

  const addItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim() || !perms.canEdit) return;
    const { error } = await supabase.from("event_budget_items").insert({
      event_id: event.id,
      label: label.trim(),
      category,
      estimated_cents: parseMoneyToCents(estimated),
      actual_cents: parseMoneyToCents(actual),
    });
    if (error) {
      toast.error(`Couldn't add budget item: ${error.message}`);
      return;
    }
    if (user) void logActivity(event.id, user.id, `added budget item "${label.trim()}"`);
    setLabel("");
    setEstimated("");
    setActual("");
    refresh();
  };

  const removeItem = async (id: string) => {
    if (!perms.canEdit) return;
    const { error } = await supabase.from("event_budget_items").delete().eq("id", id);
    if (error) toast.error(error.message);
    else refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-2xl font-bold flex items-center gap-2">
            <DollarSign size={22} className="text-brand-600" />
            Budget
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Track estimated and actual costs across food, vendors, rentals, and supplies.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-right">
          <div className="card px-4 py-2">
            <div className="text-xs text-slate-500">Target</div>
            <div className="font-display font-bold">{formatMoney(event.budget_cents ?? 0)}</div>
          </div>
          <div className="card px-4 py-2">
            <div className="text-xs text-slate-500">Line estimates</div>
            <div className="font-display font-bold">{formatMoney(totals.estimated)}</div>
          </div>
          <div className="card px-4 py-2">
            <div className="text-xs text-slate-500">{remaining >= 0 ? "Remaining" : "Over"}</div>
            <div className={`font-display font-bold ${remaining >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
              {formatMoney(Math.abs(remaining))}
            </div>
          </div>
        </div>
      </div>

      {perms.canEdit ? (
        <form onSubmit={addItem} className="card p-3 grid grid-cols-1 sm:grid-cols-5 gap-2 items-end">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="budget-label">Item</label>
            <input id="budget-label" className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Catering deposit" />
          </div>
          <div>
            <label className="label" htmlFor="budget-category">Category</label>
            <select id="budget-category" className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="budget-estimated">Estimated</label>
            <input id="budget-estimated" className="input" inputMode="decimal" value={estimated} onChange={(e) => setEstimated(e.target.value)} placeholder="$0" />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="label" htmlFor="budget-actual">Actual</label>
              <input id="budget-actual" className="input" inputMode="decimal" value={actual} onChange={(e) => setActual(e.target.value)} placeholder="$0" />
            </div>
            <button className="btn-primary self-end px-3" disabled={!label.trim()} aria-label="Add budget item">
              <Plus size={16} />
            </button>
          </div>
        </form>
      ) : (
        <div className="card p-3 text-sm text-slate-500">Viewer access: budget is read-only.</div>
      )}

      <div className="card divide-y divide-slate-100 overflow-hidden">
        {items.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No budget lines yet.</div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{item.label}</div>
                <div className="text-xs text-slate-500">{item.category ?? "General"}</div>
              </div>
              <div className="text-right text-sm">
                <div>{formatMoney(item.estimated_cents)}</div>
                <div className="text-xs text-slate-500">actual {formatMoney(item.actual_cents)}</div>
              </div>
              {perms.canEdit && (
                <button className="btn-ghost text-rose-600 px-2" onClick={() => void removeItem(item.id)} aria-label={`Delete ${item.label}`}>
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
