import type { EventBudgetItemMeta } from "./database.types";

export type PaymentApp = NonNullable<EventBudgetItemMeta["payment_app"]>;

export const PAYMENT_APP_LABELS: Record<PaymentApp, string> = {
  venmo: "Venmo",
  cashapp: "Cash App",
  zelle: "Zelle",
};

/**
 * Strip leading symbols (@, $) and surrounding whitespace from a payment
 * handle. Venmo and Cash App both accept handles with or without the symbol,
 * but the URL templates each expect a particular form, so we normalise here
 * and let the URL builder add the symbol back.
 */
function normalizeHandle(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/^[@$]+/, "");
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Format an amount in cents as the URL-friendly decimal string the payment
 * apps expect (e.g. 1234 → "12.34"). Negative amounts and NaN coalesce to
 * null so the caller can decide whether to render a "request" or "send"
 * link without an amount component.
 */
function formatCentsForUrl(cents: number | null | undefined): string | null {
  if (cents == null || !Number.isFinite(cents) || cents <= 0) return null;
  return (cents / 100).toFixed(2);
}

export interface PaymentLinkArgs {
  app: PaymentApp;
  handle: string | null | undefined;
  /** Cents to request. Pass null for a generic "open profile" link. */
  amountCents?: number | null;
  /** Short note shown in the request, e.g. "Pizza for Alex's birthday". */
  note?: string | null;
}

/**
 * Returns a URL that opens the requested payment app to a "send/request"
 * screen pre-filled with the host's handle, the split share amount, and the
 * event note. Falls back to the app's web profile when no amount or handle
 * is available. Returns null when there's nothing actionable to render.
 *
 * Notes:
 * - Venmo: deep link `venmo.com/u/<handle>` works on web + iOS/Android.
 *   The query string `?txn=charge&amount=&note=` is honored on mobile and
 *   ignored gracefully on web.
 * - Cash App: `cash.app/$<handle>/<amount>` opens the cashtag with a
 *   pre-filled amount on mobile. The note isn't supported in the URL.
 * - Zelle does not have a true deep-link standard. We surface a `mailto:`
 *   for email-style handles and a `sms:` for phone-style handles since
 *   most banks' Zelle UIs accept either as a contact lookup. When the
 *   handle is neither, we omit the link rather than mislead.
 */
export function buildPaymentLink(args: PaymentLinkArgs): string | null {
  const handle = normalizeHandle(args.handle);
  if (!handle) return null;

  const amount = formatCentsForUrl(args.amountCents);
  const note = args.note?.trim() || "";

  switch (args.app) {
    case "venmo": {
      const params = new URLSearchParams();
      params.set("txn", "charge");
      if (amount) params.set("amount", amount);
      if (note) params.set("note", note);
      const qs = params.toString();
      return `https://venmo.com/u/${encodeURIComponent(handle)}${qs ? `?${qs}` : ""}`;
    }
    case "cashapp": {
      // Cash App deep link: cash.app/$<handle>[/<amount>]
      return amount
        ? `https://cash.app/$${encodeURIComponent(handle)}/${amount}`
        : `https://cash.app/$${encodeURIComponent(handle)}`;
    }
    case "zelle": {
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(handle);
      const isPhone = /^\+?[\d\s().-]{7,}$/.test(handle);
      if (isEmail) {
        const subject = note ? `?subject=${encodeURIComponent(note)}` : "";
        return `mailto:${handle}${subject}`;
      }
      if (isPhone) {
        const body = note ? `?body=${encodeURIComponent(note)}` : "";
        return `sms:${handle.replace(/\s+/g, "")}${body}`;
      }
      return null;
    }
  }
}

/**
 * Returns the per-person split amount (in cents) for an item that's being
 * shared across N+1 people (the payer plus N split-with targets). Returns
 * null when the cost or split list isn't actionable.
 */
export function splitAmountCents(
  totalCents: number | null | undefined,
  splitWith: string[] | null | undefined
): number | null {
  if (!totalCents || !Number.isFinite(totalCents) || totalCents <= 0) return null;
  const splits = splitWith?.filter((s) => s.trim().length > 0) ?? [];
  if (splits.length === 0) return null;
  // The payer is also a participant, so divide by splits.length + 1.
  return Math.round(totalCents / (splits.length + 1));
}
