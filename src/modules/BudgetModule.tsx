import { useId, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  DollarSign,
  ExternalLink,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import type { EventBudgetItem, EventBudgetItemMeta, EventRow } from "../lib/database.types";
import { formatMoney, parseMoneyToCents } from "../lib/format";
import { useBudgetItems, useEventPermissions } from "../lib/hooks";
import { supabase } from "../lib/supabase";
import { useToast } from "../lib/toast";
import { useAuth } from "../lib/auth";
import { logActivity } from "../lib/activity";
import {
  PAYMENT_APP_LABELS,
  buildPaymentLink,
  splitAmountCents,
  type PaymentApp,
} from "../lib/paymentLinks";

const CATEGORIES = ["Food", "Drinks", "Decor", "Vendors", "Rentals", "Supplies", "Other"];

const PAYMENT_APP_OPTIONS: PaymentApp[] = ["venmo", "cashapp", "zelle"];

export function BudgetModule({ event }: { event: EventRow }) {
  const { items, refresh } = useBudgetItems(event.id);
  const perms = useEventPermissions(event);
  const { user } = useAuth();
  const toast = useToast();
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [estimated, setEstimated] = useState("");
  const [actual, setActual] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [paidByName, setPaidByName] = useState("");
  const [splitWithRaw, setSplitWithRaw] = useState("");
  const [paymentApp, setPaymentApp] = useState<PaymentApp | "">("");
  const [paymentHandle, setPaymentHandle] = useState("");
  const advancedPanelId = useId();

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

  const resetForm = () => {
    setLabel("");
    setEstimated("");
    setActual("");
    setPaidByName("");
    setSplitWithRaw("");
    setPaymentApp("");
    setPaymentHandle("");
    setAdvancedOpen(false);
  };

  const addItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim() || !perms.canEdit) return;

    const splitWith = splitWithRaw
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const meta: EventBudgetItemMeta = {};
    if (paidByName.trim()) meta.paid_by_name = paidByName.trim();
    if (splitWith.length > 0) meta.split_with = splitWith;
    if (paymentApp) meta.payment_app = paymentApp;
    if (paymentHandle.trim()) meta.payment_handle = paymentHandle.trim();

    const { error } = await supabase.from("event_budget_items").insert({
      event_id: event.id,
      label: label.trim(),
      category,
      estimated_cents: parseMoneyToCents(estimated),
      actual_cents: parseMoneyToCents(actual),
      meta,
    });
    if (error) {
      toast.error(`Couldn't add budget item: ${error.message}`);
      return;
    }
    if (user) void logActivity(event.id, user.id, `added budget item "${label.trim()}"`);
    resetForm();
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
            Track estimated and actual costs, who fronted, and who owes you.
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
        <form onSubmit={addItem} className="card p-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 items-end">
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
          </div>
          <div>
            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              aria-expanded={advancedOpen}
              aria-controls={advancedPanelId}
              className="btn-ghost text-xs inline-flex items-center gap-1"
            >
              {advancedOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              Who fronted / split with / payment app
            </button>
            {advancedOpen && (
              <div
                id={advancedPanelId}
                className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2"
              >
                <div>
                  <label className="label" htmlFor="budget-paid-by-name">
                    Fronted by
                  </label>
                  <input
                    id="budget-paid-by-name"
                    className="input"
                    value={paidByName}
                    onChange={(e) => setPaidByName(e.target.value)}
                    placeholder="Alex"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="budget-split-with">
                    Split with (comma-separated)
                  </label>
                  <input
                    id="budget-split-with"
                    className="input"
                    value={splitWithRaw}
                    onChange={(e) => setSplitWithRaw(e.target.value)}
                    placeholder="Sam, Riley, Jordan"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="budget-payment-app">
                    Payment app
                  </label>
                  <select
                    id="budget-payment-app"
                    className="input"
                    value={paymentApp}
                    onChange={(e) => setPaymentApp(e.target.value as PaymentApp | "")}
                  >
                    <option value="">None</option>
                    {PAYMENT_APP_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{PAYMENT_APP_LABELS[opt]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="budget-payment-handle">
                    Handle / email / phone
                  </label>
                  <input
                    id="budget-payment-handle"
                    className="input"
                    value={paymentHandle}
                    onChange={(e) => setPaymentHandle(e.target.value)}
                    placeholder={
                      paymentApp === "zelle"
                        ? "you@example.com"
                        : paymentApp === "cashapp"
                          ? "$alex"
                          : "@alex"
                    }
                  />
                </div>
              </div>
            )}
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
            <BudgetRow
              key={item.id}
              item={item}
              canEdit={perms.canEdit}
              onRemove={() => void removeItem(item.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface BudgetRowProps {
  item: EventBudgetItem;
  canEdit: boolean;
  onRemove: () => void;
}

function BudgetRow({ item, canEdit, onRemove }: BudgetRowProps) {
  const meta = item.meta ?? {};
  const splitWith = meta.split_with ?? [];
  const splitCents = splitAmountCents(item.actual_cents || item.estimated_cents, splitWith);
  const paymentApp = meta.payment_app ?? null;
  const paymentLink =
    paymentApp && meta.payment_handle
      ? buildPaymentLink({
          app: paymentApp,
          handle: meta.payment_handle,
          amountCents: splitCents ?? item.actual_cents ?? null,
          note: item.label,
        })
      : null;

  return (
    <div className="p-3 flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{item.label}</div>
        <div className="text-xs text-slate-500">{item.category ?? "General"}</div>
        {(meta.paid_by_name || splitWith.length > 0) && (
          <div className="text-xs text-slate-600 mt-1 flex flex-wrap items-center gap-1.5">
            <Users size={12} className="text-slate-400" aria-hidden />
            {meta.paid_by_name && (
              <span>
                Fronted by <strong className="font-medium">{meta.paid_by_name}</strong>
              </span>
            )}
            {meta.paid_by_name && splitWith.length > 0 && <span aria-hidden>·</span>}
            {splitWith.length > 0 && (
              <span>
                Split with{" "}
                <span className="font-medium">{splitWith.join(", ")}</span>
                {splitCents != null && (
                  <span className="text-slate-500">
                    {" "}({formatMoney(splitCents)} each)
                  </span>
                )}
              </span>
            )}
          </div>
        )}
        {paymentLink && paymentApp && (
          <a
            href={paymentLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-brand-700 hover:text-brand-800 hover:underline mt-1.5"
          >
            <ExternalLink size={11} aria-hidden />
            Request {splitCents != null ? formatMoney(splitCents) : "share"} via{" "}
            {PAYMENT_APP_LABELS[paymentApp]}
          </a>
        )}
      </div>
      <div className="text-right text-sm">
        <div>{formatMoney(item.estimated_cents)}</div>
        <div className="text-xs text-slate-500">actual {formatMoney(item.actual_cents)}</div>
      </div>
      {canEdit && (
        <button
          className="btn-ghost text-rose-600 px-2"
          onClick={onRemove}
          aria-label={`Delete ${item.label}`}
        >
          <Trash2 size={15} />
        </button>
      )}
    </div>
  );
}
