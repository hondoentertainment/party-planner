import { differenceInCalendarDays, format, formatDistanceToNow, isThisYear, parseISO } from "date-fns";

export function formatEventDate(iso?: string | null): string {
  if (!iso) return "Date TBD";
  const d = parseISO(iso);
  return isThisYear(d) ? format(d, "EEE, MMM d • h:mm a") : format(d, "EEE, MMM d, yyyy • h:mm a");
}

export function formatShortDate(iso?: string | null): string {
  if (!iso) return "TBD";
  const d = parseISO(iso);
  return isThisYear(d) ? format(d, "MMM d") : format(d, "MMM d, yyyy");
}

export function relative(iso?: string | null): string {
  if (!iso) return "—";
  return formatDistanceToNow(parseISO(iso), { addSuffix: true });
}

export function daysUntil(iso?: string | null): number | null {
  if (!iso) return null;
  return differenceInCalendarDays(parseISO(iso), new Date());
}

export function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function parseMoneyToCents(input: string): number {
  const n = Number(String(input).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}
