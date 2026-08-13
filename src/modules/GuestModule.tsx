import { useEffect, useId, useState } from "react";
import {
  Check,
  Download,
  HelpCircle,
  Plus,
  Trash2,
  Users,
  UserPlus,
  X,
  Clipboard,
  Utensils,
} from "lucide-react";
import clsx from "clsx";
import type { EventItem, EventRow } from "../lib/database.types";
import {
  dietaryTags,
  exportGuestsCsv,
  MAX_GUESTS,
  plusOnesFromMeta,
  type GuestMeta,
  type GuestRsvpAnswer,
  type GuestRsvpFilter,
} from "../lib/guestStats";
import {
  fetchAllGuestsMatching,
  useGuestMetaCounts,
  useEventPermissions,
  usePaginatedGuestItems,
} from "../lib/hooks";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import { logActivity } from "../lib/activity";
import { Modal } from "../components/Modal";
import { useDebouncedSave } from "../lib/useDebouncedSave";

type Rsvp = GuestRsvpAnswer;

const DIETARY_OPTIONS = [
  "Vegetarian",
  "Vegan",
  "Gluten-free",
  "Dairy-free",
  "Nut-free",
  "Kosher",
  "Halal",
  "Pescatarian",
];

const RSVP_META: Record<Rsvp, { label: string; cls: string; dot: string }> = {
  yes: {
    label: "Going",
    cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
  },
  maybe: {
    label: "Maybe",
    cls: "bg-amber-50 text-amber-700 border-amber-200",
    dot: "bg-amber-500",
  },
  no: { label: "Not going", cls: "bg-rose-50 text-rose-700 border-rose-200", dot: "bg-rose-500" },
  pending: {
    label: "Pending",
    cls: "bg-slate-100 text-slate-600 border-slate-200",
    dot: "bg-slate-400",
  },
};

export function GuestModule({ event }: { event: EventRow }) {
  const { user } = useAuth();
  const perms = useEventPermissions(event);
  const toast = useToast();
  const [newName, setNewName] = useState("");
  const [filter, setFilter] = useState<GuestRsvpFilter>("all");
  const [search, setSearch] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const newGuestId = useId();
  const searchId = useId();

  const {
    items,
    totalCount,
    loading: guestsLoading,
    loadingMore,
    error,
    refresh,
    loadMore,
  } = usePaginatedGuestItems(event.id, filter, search, { realtimeDebounceMs: 400 });
  const { stats, loading: statsLoading } = useGuestMetaCounts(event.id);

  const atGuestCap = stats.total >= MAX_GUESTS;

  const counts = stats;

  const hasMoreGuests = totalCount != null && items.length < totalCount;

  const addGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !user || !perms.canEdit) return;
    if (atGuestCap) {
      toast.error(`Guest list is full (${MAX_GUESTS} max). Remove someone or export and archive.`);
      return;
    }
    const name = newName.trim();
    setNewName("");
    const { error } = await supabase.from("event_items").insert({
      event_id: event.id,
      kind: "guest" as const,
      title: name,
      created_by: user.id,
      position: stats.total,
      meta: { rsvp: "pending" } as GuestMeta,
    });
    if (error) {
      toast.error(`Couldn't add guest: ${error.message}`);
    } else {
      logActivity(event.id, user.id, `added guest "${name}"`);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-display text-2xl font-bold flex items-center gap-2">
            <Users size={22} className="text-brand-600" />
            Guest list
          </h2>
          <p className="text-slate-500 text-sm mt-0.5">
            Track who's coming, dietary needs, and plus-ones. Paste names from Partiful to import in
            bulk.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              void (async () => {
                setExportBusy(true);
                try {
                  const rows = await fetchAllGuestsMatching(event.id, filter, search);
                  exportGuestsCsv(
                    `guests-${String(event.title ?? "event").replace(/[^\w-]+/g, "_").slice(0, 40) || "event"}.csv`,
                    rows,
                  );
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Couldn't export guests.");
                } finally {
                  setExportBusy(false);
                }
              })();
            }}
            className="btn-secondary text-sm"
            disabled={exportBusy || counts.total === 0}
          >
            <Download size={14} /> {exportBusy ? "Exporting…" : `Export CSV (${counts.total})`}
          </button>
          <button
            type="button"
            onClick={() => setShowImport(true)}
            className="btn-secondary text-sm"
            disabled={!perms.canEdit || atGuestCap}
          >
            <Clipboard size={14} /> Paste from Partiful
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <SummaryCard label="Total" value={counts.total} icon={Users} loading={statsLoading} />
        <SummaryCard label="Going" value={counts.byRsvp.yes} accent="emerald" loading={statsLoading} />
        <SummaryCard label="Maybe" value={counts.byRsvp.maybe} accent="amber" loading={statsLoading} />
        <SummaryCard label="Not going" value={counts.byRsvp.no} accent="rose" loading={statsLoading} />
        <SummaryCard
          label="Heads to feed"
          value={counts.totalAttendees}
          accent="brand"
          icon={Utensils}
          hint="Confirmed + plus-ones"
          loading={statsLoading}
        />
      </div>

      {/* Filters + search */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2 items-center">
          {(["all", "yes", "maybe", "pending", "no"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={clsx(
              "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
              filter === f
                ? "bg-brand-600 text-white border-brand-600"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            )}
          >
            {f === "all"
              ? `All (${counts.total})`
              : `${RSVP_META[f].label} (${counts.byRsvp[f]})`}
          </button>
        ))}
        </div>
        <div className="w-full sm:max-w-xs">
          <label htmlFor={searchId} className="sr-only">
            Search guests by name or email
          </label>
          <input
            id={searchId}
            type="search"
            className="input py-1.5 text-sm w-full"
            placeholder="Search name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoComplete="off"
          />
        </div>
      </div>

      {atGuestCap && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2" role="status">
          Guest list has reached the maximum of {MAX_GUESTS}. Remove guests or export your list before adding more.
        </p>
      )}

      {perms.canEdit ? (
        <form onSubmit={addGuest} className="card p-2 flex items-center gap-2">
          <UserPlus size={18} className="text-slate-400 ml-2" />
          <label htmlFor={newGuestId} className="sr-only">
            Add guest name
          </label>
          <input
            id={newGuestId}
            className="flex-1 bg-transparent border-0 focus:outline-hidden text-sm py-1.5"
            placeholder="Add guest name…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            disabled={atGuestCap}
          />
          <button className="btn-primary py-1.5 px-3 text-xs" disabled={!newName.trim() || atGuestCap}>
            Add
          </button>
        </form>
      ) : (
        <div className="card p-3 text-sm text-slate-500">Viewer access: guest details are read-only.</div>
      )}

      {guestsLoading ? (
        <div className="card p-4 text-sm text-slate-500" role="status" aria-live="polite">
          Loading guests…
        </div>
      ) : error ? (
        <div className="card p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3" role="alert">
          <p className="text-sm text-slate-600">Couldn't load guests: {error}</p>
          <button type="button" onClick={() => void refresh()} className="btn-secondary">
            Try again
          </button>
        </div>
      ) : items.length === 0 && !guestsLoading ? (
        <div className="card p-8 text-center text-slate-500 text-sm">
          {!statsLoading && counts.total === 0
            ? "No guests yet. Add one above or paste a list from Partiful."
            : search.trim()
              ? "No guests match your search."
              : filter !== "all"
                ? `No guests match "${filter}".`
                : "No guests match the current filters."}
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {items.map((g) => (
              <GuestRow key={g.id} item={g} eventId={event.id} canEdit={perms.canEdit} />
            ))}
          </ul>
          {hasMoreGuests && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                className="btn-secondary text-sm"
                disabled={loadingMore}
                onClick={() => void loadMore()}
              >
                {loadingMore
                  ? "Loading…"
                  : `Load more (${(totalCount ?? 0) - items.length} remaining)`}
              </button>
            </div>
          )}
          <p className="text-xs text-slate-500 text-center">
            Showing {items.length}
            {totalCount != null ? ` of ${totalCount}` : ""}
            {search.trim() || filter !== "all" ? " matching" : ""} guests (loaded)
          </p>
        </>
      )}

      {showImport && <ImportDialog eventId={event.id} onClose={() => setShowImport(false)} />}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  accent,
  icon: Icon,
  hint,
  loading: summaryLoading,
}: {
  label: string;
  value: number;
  accent?: "emerald" | "amber" | "rose" | "brand";
  icon?: typeof Users;
  hint?: string;
  loading?: boolean;
}) {
  const accentCls =
    accent === "emerald"
      ? "text-emerald-700"
      : accent === "amber"
      ? "text-amber-700"
      : accent === "rose"
      ? "text-rose-700"
      : accent === "brand"
      ? "text-brand-700"
      : "text-slate-700";
  return (
    <div className="card p-3">
      <div className="text-xs uppercase font-semibold text-slate-500 tracking-wide flex items-center gap-1">
        {Icon && <Icon size={12} />}
        {label}
      </div>
      <div className={`font-display text-2xl font-bold mt-1 ${accentCls}`}>
        {summaryLoading ? "…" : value}
      </div>
      {hint && <div className="text-[11px] text-slate-400 mt-0.5">{hint}</div>}
    </div>
  );
}

function GuestRow({ item, eventId, canEdit }: { item: EventItem; eventId: string; canEdit: boolean }) {
  const meta = (item.meta ?? {}) as GuestMeta;
  const rsvp: Rsvp = meta.rsvp ?? "pending";
  const plusN = plusOnesFromMeta(meta);
  const dietTags = dietaryTags(meta);
  const [expanded, setExpanded] = useState(false);
  const { user } = useAuth();
  const toast = useToast();
  const rowId = useId();

  const update = async (patch: Partial<EventItem>) => {
    if (!canEdit) return;
    const { error } = await supabase.from("event_items").update(patch).eq("id", item.id);
    if (error) toast.error(error.message);
  };
  const [titleVal, setTitleVal] = useDebouncedSave(item.title, (next) => update({ title: next }));

  const updateMeta = async (patch: Partial<GuestMeta>) => {
    const newMeta = { ...meta, ...patch };
    await update({ meta: newMeta as Record<string, unknown> });
  };

  const setRsvp = async (next: Rsvp) => {
    await updateMeta({ rsvp: next });
    if (user)
      logActivity(eventId, user.id, `marked "${item.title}" as ${RSVP_META[next].label.toLowerCase()}`);
  };

  const remove = async () => {
    if (!canEdit) return;
    await supabase.from("event_items").delete().eq("id", item.id);
    if (user) logActivity(eventId, user.id, `removed guest "${item.title}"`);
  };

  const toggleDietary = async (tag: string) => {
    const current = new Set(dietTags);
    if (current.has(tag)) current.delete(tag);
    else current.add(tag);
    await updateMeta({ dietary: Array.from(current) });
  };

  const m = RSVP_META[rsvp];

  return (
    <li className="card overflow-hidden">
      <div className="flex items-center gap-2 p-3 flex-wrap">
        <span className={`w-2 h-2 rounded-full ${m.dot} shrink-0`} aria-hidden />
        <input
          aria-label={`Guest name for ${item.title}`}
          className="flex-1 min-w-[120px] bg-transparent border-0 focus:outline-hidden text-sm font-medium"
          value={titleVal}
          onChange={(e) => setTitleVal(e.target.value)}
          disabled={!canEdit}
        />
        {plusN > 0 && (
          <span className="chip bg-brand-50 text-brand-700">+{plusN}</span>
        )}
        {dietTags.slice(0, 2).map((d) => (
          <span key={d} className="chip bg-slate-100 text-slate-600">
            {d}
          </span>
        ))}
        {dietTags.length > 2 && (
          <span className="chip bg-slate-100 text-slate-600">
            +{dietTags.length - 2}
          </span>
        )}
        <div className="flex items-center gap-1">
          <RsvpButton current={rsvp} value="yes" onClick={() => setRsvp("yes")} disabled={!canEdit} />
          <RsvpButton current={rsvp} value="maybe" onClick={() => setRsvp("maybe")} disabled={!canEdit} />
          <RsvpButton current={rsvp} value="no" onClick={() => setRsvp("no")} disabled={!canEdit} />
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="btn-ghost py-1 px-2 text-xs"
        >
          {expanded ? "Hide" : "More"}
        </button>
        {canEdit && (
          <button
            type="button"
            onClick={remove}
            aria-label="Remove guest"
            className="btn-ghost text-rose-500 min-h-[44px] min-w-[44px] py-2 px-3"
            title="Remove"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
      {expanded && (
        <div className="border-t border-slate-100 p-3 bg-slate-50/50 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor={`${rowId}-email`}>Email (optional)</label>
              <input
                id={`${rowId}-email`}
                type="email"
                className="input"
                value={meta.email ?? ""}
                onChange={(e) => updateMeta({ email: e.target.value })}
                disabled={!canEdit}
                placeholder="alex@example.com"
              />
            </div>
            <div>
              <div className="label">Plus-ones</div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-xs" htmlFor={`${rowId}-plus-one`}>
                  <input
                    id={`${rowId}-plus-one`}
                    type="checkbox"
                    checked={!!meta.plus_one}
                    disabled={!canEdit}
                    onChange={(e) =>
                      updateMeta({
                        plus_one: e.target.checked,
                        plus_one_count: e.target.checked ? meta.plus_one_count ?? 1 : 0,
                      })
                    }
                  />
                  Bringing guests
                </label>
                {meta.plus_one && (
                  <input
                    aria-label={`Plus-one count for ${item.title}`}
                    type="number"
                    min={1}
                    className="input max-w-[80px]"
                    value={meta.plus_one_count ?? 1}
                    disabled={!canEdit}
                    onChange={(e) =>
                      updateMeta({ plus_one_count: Math.max(0, Number(e.target.value) || 0) })
                    }
                  />
                )}
              </div>
            </div>
          </div>
          <div>
            <div className="label">Dietary restrictions</div>
            <div className="flex flex-wrap gap-1.5">
              {DIETARY_OPTIONS.map((d) => {
                const active = dietTags.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDietary(d)}
                    disabled={!canEdit}
                    aria-pressed={active}
                    className={clsx(
                      "px-2 py-1 rounded-full text-xs border transition-colors",
                      active
                        ? "bg-brand-600 text-white border-brand-600"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                    )}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="label" htmlFor={`${rowId}-notes`}>Notes</label>
            <textarea
              id={`${rowId}-notes`}
              className="input min-h-[60px]"
              value={item.description ?? ""}
              onChange={(e) => update({ description: e.target.value })}
              disabled={!canEdit}
              placeholder="Allergies, kids, transport, anything else…"
            />
          </div>
        </div>
      )}
    </li>
  );
}

function RsvpButton({
  current,
  value,
  onClick,
  disabled = false,
}: {
  current: Rsvp;
  value: Rsvp;
  onClick: () => void;
  disabled?: boolean;
}) {
  const meta = RSVP_META[value];
  const active = current === value;
  const Icon = value === "yes" ? Check : value === "no" ? X : HelpCircle;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={meta.label}
      className={clsx(
        "p-1.5 rounded-md border text-xs transition-colors",
        active ? meta.cls : "bg-white text-slate-400 border-slate-200 hover:bg-slate-50"
      )}
      aria-label={`Mark as ${meta.label}`}
      aria-pressed={active}
    >
      <Icon size={14} />
    </button>
  );
}

function ImportDialog({
  eventId,
  onClose,
}: {
  eventId: string;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [defaultRsvp, setDefaultRsvp] = useState<Rsvp>("pending");
  const [busy, setBusy] = useState(false);
  const [dedupeGuests, setDedupeGuests] = useState<EventItem[]>([]);
  const [dedupeLoading, setDedupeLoading] = useState(true);
  const { user } = useAuth();
  const toast = useToast();
  const importId = useId();

  useEffect(() => {
    let cancelled = false;
    setDedupeLoading(true);
    void fetchAllGuestsMatching(eventId, "all", "")
      .then((rows) => {
        if (!cancelled) setDedupeGuests(rows);
      })
      .catch(() => {
        if (!cancelled) setDedupeGuests([]);
      })
      .finally(() => {
        if (!cancelled) setDedupeLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  const parsedGuests = parseGuestImport(text, defaultRsvp, dedupeGuests);
  const existingCount = dedupeGuests.length;
  const remainingSlots = Math.max(0, MAX_GUESTS - existingCount);
  const willImportCount = Math.min(parsedGuests.length, remainingSlots);

  const submit = async () => {
    if (!user || parsedGuests.length === 0) return;
    const rowsToInsert = parsedGuests.slice(0, remainingSlots);
    if (rowsToInsert.length === 0) {
      toast.error(`Guest list is full (${MAX_GUESTS} max).`);
      return;
    }
    if (parsedGuests.length > remainingSlots) {
      toast.info(
        `Importing ${rowsToInsert.length} of ${parsedGuests.length} — guest list is capped at ${MAX_GUESTS}.`,
      );
    }
    setBusy(true);
    const rows = rowsToInsert.map((guest, i) => ({
      event_id: eventId,
      kind: "guest" as const,
      title: guest.name,
      description: guest.notes ?? null,
      created_by: user.id,
      position: existingCount + i,
      meta: guest.meta as Record<string, unknown>,
    }));
    let error: { message: string } | null = null;
    for (let i = 0; i < rows.length; i += 100) {
      const chunk = rows.slice(i, i + 100);
      const result = await supabase.from("event_items").insert(chunk);
      if (result.error) {
        error = result.error;
        break;
      }
    }
    setBusy(false);
    if (error) {
      toast.error(`Import failed: ${error.message}`);
      return;
    }
    toast.success(`Imported ${rowsToInsert.length} guests`);
    logActivity(eventId, user.id, `imported ${rowsToInsert.length} guests`);
    onClose();
  };

  return (
    <Modal title="Paste from Partiful" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          Paste one guest per line. CSV is supported: name, email, RSVP, plus-one count, dietary, notes.
        </p>
        <label className="label" htmlFor={`${importId}-guests`}>Guest list</label>
        <textarea
          id={`${importId}-guests`}
          className="input min-h-[180px] font-mono text-xs"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"Sarah\nAlex\nJordan\nSam"}
          autoFocus
        />
        <div className="flex items-center gap-2 text-sm">
          <label className="text-slate-600" htmlFor={`${importId}-default-rsvp`}>Default RSVP:</label>
          <select
            id={`${importId}-default-rsvp`}
            className="input max-w-[160px] py-1.5"
            value={defaultRsvp}
            onChange={(e) => setDefaultRsvp(e.target.value as Rsvp)}
          >
            <option value="pending">Pending</option>
            <option value="yes">Going</option>
            <option value="maybe">Maybe</option>
            <option value="no">Not going</option>
          </select>
        </div>
        <div className="flex justify-between items-center pt-2 gap-2 flex-wrap">
          <span className="text-xs text-slate-500">
            {dedupeLoading
              ? "Loading guest list for duplicate check…"
              : `${parsedGuests.length} new ${parsedGuests.length === 1 ? "guest" : "guests"} detected · will import ${willImportCount} (${remainingSlots} slots left, max ${MAX_GUESTS})`}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={parsedGuests.length === 0 || busy || dedupeLoading}
              className="btn-primary"
            >
              <Plus size={14} /> Import {willImportCount || ""}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function parseGuestImport(text: string, defaultRsvp: Rsvp, existingGuests: EventItem[]) {
  const seen = new Set(
    existingGuests.map((guest) => `${guest.title}|${((guest.meta ?? {}) as GuestMeta).email ?? ""}`.toLowerCase())
  );
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = splitCsvLine(line);
      const name = (parts[0] ?? "").trim();
      const email = (parts[1] ?? "").trim();
      const rsvp = normalizeRsvp(parts[2]) ?? defaultRsvp;
      const plusOneCount = Math.max(0, Number(parts[3] ?? 0) || 0);
      const dietary = (parts[4] ?? "")
        .split(/[;|]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const notes = (parts[5] ?? "").trim();
      const meta: GuestMeta = {
        rsvp,
        email: email || undefined,
        plus_one: plusOneCount > 0,
        plus_one_count: plusOneCount,
        dietary,
      };
      return { name, notes, meta };
    })
    .filter((guest) => {
      const key = `${guest.name}|${guest.meta.email ?? ""}`.toLowerCase();
      if (!guest.name || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function splitCsvLine(line: string) {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      quoted = !quoted;
    } else if (ch === "," && !quoted) {
      out.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  out.push(current.trim());
  return out.length === 1 ? line.split(/\t+/).map((s) => s.trim()) : out;
}

function normalizeRsvp(input?: string): Rsvp | null {
  const value = (input ?? "").trim().toLowerCase();
  if (["yes", "going", "attending"].includes(value)) return "yes";
  if (["no", "not going", "declined"].includes(value)) return "no";
  if (["maybe", "tentative"].includes(value)) return "maybe";
  if (["pending", ""].includes(value)) return "pending";
  return null;
}
