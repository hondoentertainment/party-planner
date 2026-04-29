import { useState } from "react";
import { Building2, Plus, Trash2 } from "lucide-react";
import type { EventRow } from "../lib/database.types";
import { formatMoney, parseMoneyToCents, formatShortDate } from "../lib/format";
import { useEventPermissions, useVendors } from "../lib/hooks";
import { supabase } from "../lib/supabase";
import { useToast } from "../lib/toast";

export function VendorsModule({ event }: { event: EventRow }) {
  const { vendors, refresh } = useVendors(event.id);
  const perms = useEventPermissions(event);
  const toast = useToast();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Vendor");
  const [contact, setContact] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [deposit, setDeposit] = useState("");
  const [dueAt, setDueAt] = useState("");

  const addVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !perms.canEdit) return;
    const { error } = await supabase.from("event_vendors").insert({
      event_id: event.id,
      name: name.trim(),
      category,
      contact_name: contact || null,
      phone: phone || null,
      email: email || null,
      deposit_cents: parseMoneyToCents(deposit),
      due_at: dueAt ? new Date(dueAt).toISOString() : null,
    });
    if (error) {
      toast.error(`Couldn't add vendor: ${error.message}`);
      return;
    }
    setName("");
    setContact("");
    setPhone("");
    setEmail("");
    setDeposit("");
    setDueAt("");
    refresh();
  };

  const removeVendor = async (id: string) => {
    if (!perms.canEdit) return;
    const { error } = await supabase.from("event_vendors").delete().eq("id", id);
    if (error) toast.error(error.message);
    else refresh();
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-2xl font-bold flex items-center gap-2">
          <Building2 size={22} className="text-brand-600" />
          Vendors & contacts
        </h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Keep caterers, DJs, rentals, venues, deposits, and follow-up dates in one place.
        </p>
      </div>

      {perms.canEdit ? (
        <form onSubmit={addVendor} className="card p-3 grid grid-cols-1 sm:grid-cols-6 gap-2 items-end">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="vendor-name">Vendor</label>
            <input id="vendor-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Caterer, venue, DJ…" />
          </div>
          <div>
            <label className="label" htmlFor="vendor-category">Type</label>
            <input id="vendor-category" className="input" value={category} onChange={(e) => setCategory(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="vendor-contact">Contact</label>
            <input id="vendor-contact" className="input" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Name" />
          </div>
          <div>
            <label className="label" htmlFor="vendor-phone">Phone</label>
            <input id="vendor-phone" className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123…" />
          </div>
          <button className="btn-primary self-end" disabled={!name.trim()}>
            <Plus size={16} /> Add
          </button>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="vendor-email">Email</label>
            <input id="vendor-email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vendor@example.com" />
          </div>
          <div>
            <label className="label" htmlFor="vendor-deposit">Deposit</label>
            <input id="vendor-deposit" className="input" inputMode="decimal" value={deposit} onChange={(e) => setDeposit(e.target.value)} placeholder="$0" />
          </div>
          <div>
            <label className="label" htmlFor="vendor-due">Follow-up</label>
            <input id="vendor-due" type="date" className="input" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </div>
        </form>
      ) : (
        <div className="card p-3 text-sm text-slate-500">Viewer access: vendors are read-only.</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {vendors.map((vendor) => (
          <article key={vendor.id} className="card p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-700 grid place-items-center">
                <Building2 size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-display font-bold truncate">{vendor.name}</h3>
                <p className="text-xs text-slate-500">{vendor.category ?? "Vendor"}</p>
              </div>
              {perms.canEdit && (
                <button className="btn-ghost text-rose-600 px-2" onClick={() => void removeVendor(vendor.id)} aria-label={`Delete ${vendor.name}`}>
                  <Trash2 size={15} />
                </button>
              )}
            </div>
            <dl className="mt-3 text-sm text-slate-600 space-y-1">
              {vendor.contact_name && <div><dt className="inline font-medium">Contact:</dt> <dd className="inline">{vendor.contact_name}</dd></div>}
              {vendor.phone && <div><dt className="inline font-medium">Phone:</dt> <dd className="inline">{vendor.phone}</dd></div>}
              {vendor.email && <div><dt className="inline font-medium">Email:</dt> <dd className="inline">{vendor.email}</dd></div>}
              <div><dt className="inline font-medium">Deposit:</dt> <dd className="inline">{formatMoney(vendor.deposit_cents)}</dd></div>
              {vendor.due_at && <div><dt className="inline font-medium">Follow-up:</dt> <dd className="inline">{formatShortDate(vendor.due_at)}</dd></div>}
            </dl>
          </article>
        ))}
        {vendors.length === 0 && (
          <div className="card p-8 text-center text-sm text-slate-500 md:col-span-2">
            No vendors yet. Add caterers, rentals, venues, or helpers you need to coordinate.
          </div>
        )}
      </div>
    </div>
  );
}
