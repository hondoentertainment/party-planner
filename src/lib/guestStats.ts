import type { EventItem } from "./database.types";

export const MAX_GUESTS = 1000;

export type GuestRsvpAnswer = "yes" | "no" | "maybe" | "pending";
export type GuestRsvpFilter = GuestRsvpAnswer | "all";

export interface GuestMeta extends Record<string, unknown> {
  email?: string;
  rsvp?: GuestRsvpAnswer;
  /** Public RSVP path stores a numeric count */
  plus_ones?: number;
  plus_one?: boolean;
  plus_one_count?: number;
  dietary?: string[] | string;
  notes?: string;
}

export function plusOnesFromMeta(m: GuestMeta): number {
  if (typeof m.plus_ones === "number" && Number.isFinite(m.plus_ones) && m.plus_ones > 0) {
    return Math.min(50, Math.floor(m.plus_ones));
  }
  if (m.plus_one) return Math.max(0, Math.floor(m.plus_one_count ?? 1));
  return 0;
}

export function dietaryForExport(m: GuestMeta): string {
  const d = m.dietary;
  if (Array.isArray(d)) return d.join(";");
  if (typeof d === "string") return d;
  return "";
}

/** Normalize dietary tags whether stored as Partiful-style array or public RSVP comma string */
export function dietaryTags(meta: GuestMeta): string[] {
  const d = meta.dietary;
  if (Array.isArray(d)) return d;
  if (typeof d === "string" && d.trim()) {
    return d.split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

export interface GuestListStats {
  byRsvp: Record<GuestRsvpAnswer, number>;
  totalAttendees: number;
  total: number;
}

export function emptyGuestStats(): GuestListStats {
  return {
    byRsvp: { yes: 0, no: 0, maybe: 0, pending: 0 },
    totalAttendees: 0,
    total: 0,
  };
}

/** Map `get_event_guest_stats` RPC payload to UI stats (migration 0026). */
export function guestStatsFromRpc(data: unknown): GuestListStats {
  const o = data as Record<string, number> | null;
  if (!o || typeof o !== "object") return emptyGuestStats();
  return {
    byRsvp: {
      yes: Number(o.yes) || 0,
      no: Number(o.no) || 0,
      maybe: Number(o.maybe) || 0,
      pending: Number(o.pending) || 0,
    },
    totalAttendees: Number(o.total_attendees) || 0,
    total: Number(o.total) || 0,
  };
}

export function aggregateGuestStatsFromMetaRows(rows: { meta: unknown }[]): GuestListStats {
  const byRsvp: GuestListStats["byRsvp"] = { yes: 0, no: 0, maybe: 0, pending: 0 };
  let totalAttendees = 0;
  for (const row of rows) {
    const m = (row.meta ?? {}) as GuestMeta;
    const raw = m.rsvp ?? "pending";
    const rsvp: GuestRsvpAnswer =
      raw === "yes" || raw === "no" || raw === "maybe" || raw === "pending" ? raw : "pending";
    byRsvp[rsvp]++;
    if (rsvp === "yes") {
      totalAttendees += 1 + plusOnesFromMeta(m);
    }
  }
  return { byRsvp, totalAttendees, total: rows.length };
}

export function exportGuestsCsv(filename: string, guests: EventItem[]) {
  const esc = (cell: string) => `"${cell.replace(/"/g, '""')}"`;
  const rows: string[][] = [["name", "email", "rsvp", "plus_ones", "dietary", "notes"]];
  for (const g of guests) {
    const m = (g.meta ?? {}) as GuestMeta;
    rows.push([
      g.title,
      m.email ?? "",
      String(m.rsvp ?? "pending"),
      String(plusOnesFromMeta(m)),
      dietaryForExport(m),
      (g.description ?? "").replace(/\r?\n/g, " "),
    ]);
  }
  const csv = rows.map((r) => r.map((c) => esc(c)).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
