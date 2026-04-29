import { useEffect, useState } from "react";
import { Archive, Save } from "lucide-react";
import type { EventRow } from "../lib/database.types";
import { parseMoneyToCents, formatMoney } from "../lib/format";
import { useAllItems, useEventPermissions, useWrapUp } from "../lib/hooks";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import { logActivity } from "../lib/activity";

export function WrapUpModule({ event }: { event: EventRow }) {
  const { wrapUp, refresh } = useWrapUp(event.id);
  const { items } = useAllItems(event.id);
  const { user } = useAuth();
  const perms = useEventPermissions(event);
  const toast = useToast();
  const [summary, setSummary] = useState("");
  const [lessons, setLessons] = useState("");
  const [finalCost, setFinalCost] = useState("");
  const [guestCount, setGuestCount] = useState("");
  const [vendorRating, setVendorRating] = useState("5");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!wrapUp) return;
    setSummary(wrapUp.summary ?? "");
    setLessons(wrapUp.lessons ?? "");
    setFinalCost(wrapUp.final_cost_cents ? String(wrapUp.final_cost_cents / 100) : "");
    setGuestCount(wrapUp.guest_count ? String(wrapUp.guest_count) : "");
    setVendorRating(String(wrapUp.vendor_rating ?? 5));
  }, [wrapUp]);

  const postTasks = items.filter((item) => item.kind === "task" && item.phase === "post");
  const donePostTasks = postTasks.filter((item) => item.status === "done").length;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!perms.canEdit) return;
    setSaving(true);
    const { error } = await supabase.from("event_wrap_ups").upsert({
      event_id: event.id,
      summary: summary || null,
      lessons: lessons || null,
      final_cost_cents: parseMoneyToCents(finalCost),
      guest_count: Number(guestCount) || 0,
      vendor_rating: Number(vendorRating) || null,
      updated_by: user?.id ?? null,
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) {
      toast.error(`Couldn't save wrap-up: ${error.message}`);
      return;
    }
    if (user) void logActivity(event.id, user.id, "updated the post-event wrap-up");
    toast.success("Wrap-up saved.");
    refresh();
  };

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-2xl font-bold flex items-center gap-2">
            <Archive size={22} className="text-brand-600" />
            Post-event wrap-up
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Capture what worked, final costs, vendor notes, and lessons for the next party.
          </p>
        </div>
        <div className="card px-4 py-2 text-sm">
          <div className="text-xs text-slate-500">Post tasks</div>
          <div className="font-display font-bold">{donePostTasks} of {postTasks.length} done</div>
        </div>
      </div>

      <form onSubmit={save} className="card p-4 space-y-4">
        {!perms.canEdit && <p className="text-sm text-slate-500">Viewer access: wrap-up is read-only.</p>}
        <div>
          <label className="label" htmlFor="wrap-summary">What worked?</label>
          <textarea id="wrap-summary" className="input min-h-24" value={summary} onChange={(e) => setSummary(e.target.value)} disabled={!perms.canEdit} placeholder="Guests loved the signature cocktail and backyard games…" />
        </div>
        <div>
          <label className="label" htmlFor="wrap-lessons">Lessons for next time</label>
          <textarea id="wrap-lessons" className="input min-h-24" value={lessons} onChange={(e) => setLessons(e.target.value)} disabled={!perms.canEdit} placeholder="Buy ice earlier, add one more trash station, book rentals sooner…" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="label" htmlFor="wrap-cost">Final cost</label>
            <input id="wrap-cost" className="input" inputMode="decimal" value={finalCost} onChange={(e) => setFinalCost(e.target.value)} disabled={!perms.canEdit} placeholder="$0" />
            <p className="text-xs text-slate-500 mt-1">{formatMoney(parseMoneyToCents(finalCost))}</p>
          </div>
          <div>
            <label className="label" htmlFor="wrap-guests">Actual guests</label>
            <input id="wrap-guests" className="input" inputMode="numeric" value={guestCount} onChange={(e) => setGuestCount(e.target.value)} disabled={!perms.canEdit} placeholder="0" />
          </div>
          <div>
            <label className="label" htmlFor="wrap-rating">Vendor rating</label>
            <select id="wrap-rating" className="input" value={vendorRating} onChange={(e) => setVendorRating(e.target.value)} disabled={!perms.canEdit}>
              {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} / 5</option>)}
            </select>
          </div>
        </div>
        {perms.canEdit && (
          <button className="btn-primary" disabled={saving}>
            <Save size={16} /> {saving ? "Saving…" : "Save wrap-up"}
          </button>
        )}
      </form>
    </div>
  );
}
