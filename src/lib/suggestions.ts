/**
 * Smart Suggestions ("nudges") — pure helpers that derive an actionable list
 * of cards from an event and its already-loaded sub-collections (items,
 * collaborators, share links). Designed to be called from the Overview page
 * (or any other surface) without making its own database calls.
 *
 * All rules are deterministic. The optional `now` argument lets callers pin
 * "current time" for tests and for stable rendering when a single React
 * render needs to evaluate "today" exactly once.
 *
 * @example
 * ```ts
 * const suggestions = computeSuggestions({
 *   event,
 *   items,
 *   collaborators,
 *   shareLinks,
 *   wrapUpFiled: isOwner ? !!wrapUp?.summary : undefined,
 * });
 * ```
 */
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import type {
  EventCollaborator,
  EventItem,
  EventRow,
  EventShareLink,
} from "./database.types";

/** Visual + semantic weight for a suggestion. */
export type SuggestionSeverity = "info" | "warn" | "celebrate";

/**
 * Logical icon name for a suggestion. The panel maps these to concrete
 * Lucide icons so this library stays UI-agnostic and tree-shakeable.
 */
export type SuggestionIcon =
  | "share"
  | "users"
  | "alert"
  | "sparkles"
  | "calendar"
  | "shopping"
  | "music"
  | "wallet"
  | "check";

/** Optional call-to-action that the panel renders as a `<Link>`. */
export interface SuggestionCta {
  /** Short button copy, e.g. "Open shopping". */
  label: string;
  /**
   * Path relative to the event base, e.g. `"settings"` or `"food"`. The
   * panel concatenates this with its `basePath` prop. Use an empty string
   * to point at the event root.
   */
  to: string;
}

/** A single actionable card returned by {@link computeSuggestions}. */
export interface Suggestion {
  /** Stable id, e.g. `"no_public_link"`. Safe to use as a React key. */
  id: string;
  severity: SuggestionSeverity;
  icon: SuggestionIcon;
  /** Short, action-oriented headline. */
  title: string;
  /** Optional one-line detail rendered below the title. */
  description?: string;
  cta?: SuggestionCta;
  /**
   * Whether the user can dismiss this card. Defaults to `true`. Set to
   * `false` for time-sensitive cards (e.g. "It's party day!").
   */
  dismissible?: boolean;
}

/** Inputs for {@link computeSuggestions}. All collections are already loaded. */
export interface SuggestionContext {
  event: EventRow;
  items: EventItem[];
  collaborators: EventCollaborator[];
  shareLinks: EventShareLink[];
  /**
   * Whether the owner has filed a wrap-up. The wrap-up rule is skipped
   * when this is `undefined`, so callers who don't have access to
   * `event_wrap_ups` (for example viewers / collaborators that aren't
   * the owner) can simply omit it.
   */
  wrapUpFiled?: boolean;
}

// ---------------------------------------------------------------------------
// Defensive shapes for `EventItem.meta` (typed as `Record<string, unknown>`).
// We always guard each access with a default and never trust the values.
// ---------------------------------------------------------------------------

interface GuestMeta extends Record<string, unknown> {
  rsvp?: string;
  /** Newer numeric shape, if present. */
  plus_ones?: number;
  /** Legacy boolean shape — defaults plus_one_count to 1. */
  plus_one?: boolean;
  plus_one_count?: number;
}

interface FoodMeta extends Record<string, unknown> {
  servings?: number;
}

interface ShoppingMeta extends Record<string, unknown> {
  cost_cents?: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute the prioritized list of suggestion cards for an event.
 *
 * Rules are evaluated in declared (priority) order; the returned list
 * preserves that order so the caller can render the most important
 * nudges first without a separate sort.
 *
 * @param ctx Already-loaded event data; no DB calls are made.
 * @param now Reference "current time" for date-based rules; defaults to
 *            `new Date()`. Pass a fixed value in tests.
 */
export function computeSuggestions(
  ctx: SuggestionContext,
  now: Date = new Date(),
): Suggestion[] {
  const out: Suggestion[] = [];
  const days = daysUntilStart(ctx.event.starts_at, now);
  const daysSince = daysSinceStart(ctx.event.starts_at, now);
  const inFuture = isInFuture(ctx.event.starts_at, now);

  // 1. No public share link.
  const hasActiveLink = ctx.shareLinks.some((l) => l.enabled && !l.revoked_at);
  if (!hasActiveLink) {
    out.push({
      id: "no_public_link",
      severity: "info",
      icon: "share",
      title: "Share with your guests",
      description:
        "Create a public link so guests can RSVP, see the menu, and add the event to their calendar.",
      cta: { label: "Create public link", to: "settings" },
    });
  }

  // 2. Capacity shortfall.
  const confirmedYes = countConfirmedGuests(ctx.items);
  const totalServings = countTotalServings(ctx.items);
  if (confirmedYes > totalServings) {
    out.push({
      id: "food_capacity",
      severity: "warn",
      icon: "alert",
      title: "Not enough servings planned",
      description: `${confirmedYes} guests confirmed but only ${totalServings} servings on the menu.`,
      cta: { label: "Update menu", to: "food" },
    });
  }

  // 3. No guests yet (only when the event is still upcoming).
  const guestCount = ctx.items.filter((i) => i.kind === "guest").length;
  if (guestCount === 0 && inFuture) {
    out.push({
      id: "no_guests",
      severity: "info",
      icon: "users",
      title: "Add your guest list",
      description: "Track RSVPs and plan portions accurately.",
      cta: { label: "Add guests", to: "guests" },
    });
  }

  // 4. No collaborators (only meaningful with a few days of runway).
  if (ctx.collaborators.length === 0 && days != null && days > 3) {
    out.push({
      id: "no_collabs",
      severity: "info",
      icon: "users",
      title: "Plan with friends",
      description:
        "Invite a co-planner. They get email and push notifications when assigned.",
      cta: { label: "Invite collaborator", to: "settings" },
    });
  }

  // 5. Many unassigned tasks.
  const unassignedTasks = ctx.items.filter(
    (i) => i.kind === "task" && i.assignee_id == null && i.status !== "done",
  ).length;
  if (unassignedTasks >= 3) {
    out.push({
      id: "unassigned_tasks",
      severity: "warn",
      icon: "alert",
      title: `${unassignedTasks} unassigned tasks`,
      description:
        "Assign them so teammates know what they're responsible for.",
      cta: { label: "Open timeline", to: "timeline" },
    });
  }

  // 6. Pending guest RSVPs close to the event.
  if (days != null && days >= 0 && days <= 7) {
    const pending = ctx.items.filter((i) => {
      if (i.kind !== "guest") return false;
      const m = (i.meta ?? {}) as GuestMeta;
      return m.rsvp === "pending";
    }).length;
    if (pending >= 3) {
      out.push({
        id: "pending_rsvps",
        severity: "info",
        icon: "users",
        title: `${pending} guests haven't RSVP'd yet`,
        description: "Send them a reminder so you can plan portions accurately.",
        cta: { label: "Open guest list", to: "guests" },
      });
    }
  }

  // 7. Music empty close to the event.
  if (days != null && days >= 0 && days <= 14) {
    const musicCount = ctx.items.filter((i) => i.kind === "music").length;
    if (musicCount === 0) {
      out.push({
        id: "no_music",
        severity: "info",
        icon: "music",
        title: "No music yet",
        description:
          "Add a playlist or a few tracks so the vibe is set when guests arrive.",
        cta: { label: "Open music", to: "music" },
      });
    }
  }

  // 8. Shopping items missing prices.
  const shoppingNoPrice = ctx.items.filter((i) => {
    if (i.kind !== "shopping") return false;
    const m = (i.meta ?? {}) as ShoppingMeta;
    return !m.cost_cents || m.cost_cents <= 0;
  }).length;
  if (shoppingNoPrice >= 3) {
    out.push({
      id: "shopping_no_prices",
      severity: "info",
      icon: "wallet",
      title: "Add prices to shopping items",
      description: "Track spend against your budget.",
      cta: { label: "Open shopping", to: "shopping" },
    });
  }

  // 9. Over budget.
  if (ctx.event.budget_cents > 0) {
    const totalShoppingCost = ctx.items
      .filter((i) => i.kind === "shopping")
      .reduce((acc, i) => {
        const m = (i.meta ?? {}) as ShoppingMeta;
        return acc + (m.cost_cents ?? 0);
      }, 0);
    if (totalShoppingCost > ctx.event.budget_cents) {
      out.push({
        id: "over_budget",
        severity: "warn",
        icon: "wallet",
        title: "You're over budget",
        description: `Spent ${formatDollars(totalShoppingCost)} of ${formatDollars(ctx.event.budget_cents)} planned. Review shopping items.`,
        cta: { label: "Open budget", to: "budget" },
      });
    }
  }

  // 10. Event today.
  if (isSameLocalDay(ctx.event.starts_at, now)) {
    out.push({
      id: "event_today",
      severity: "celebrate",
      icon: "sparkles",
      title: "It's party day! 🎉",
      description:
        "Hope it's a great one. Don't forget to take photos for the wrap-up.",
      dismissible: false,
    });
  }

  // 11. Wrap-up not filed (owner-only; caller passes `wrapUpFiled`).
  if (
    ctx.wrapUpFiled === false &&
    daysSince != null &&
    daysSince >= 1
  ) {
    out.push({
      id: "no_wrap_up",
      severity: "info",
      icon: "check",
      title: "How did it go?",
      description:
        "File a wrap-up so you can compare costs and remember what worked.",
      cta: { label: "File wrap-up", to: "wrap-up" },
    });
  }

  return out;
}

/** Single owner-facing checklist: ordered items with pass/fail for pre-event (and post-event wrap-up). */
export interface EventHealthChecklistItem {
  id: string;
  label: string;
  done: boolean;
  /** Relative path under `/events/:id/` */
  href: string;
  priority: number;
}

/**
 * Deterministic health checklist derived from the same data as {@link computeSuggestions}.
 * Omits redundant rows when not applicable (e.g. no budget set).
 */
export function computeEventHealthChecklist(
  ctx: SuggestionContext,
  now: Date = new Date()
): EventHealthChecklistItem[] {
  const days = daysUntilStart(ctx.event.starts_at, now);
  const daysSince = daysSinceStart(ctx.event.starts_at, now);
  const inFuture = isInFuture(ctx.event.starts_at, now);
  const hasActiveLink = ctx.shareLinks.some((l) => l.enabled && !l.revoked_at);
  const guestCount = ctx.items.filter((i) => i.kind === "guest").length;
  const unassignedTasks = ctx.items.filter(
    (i) => i.kind === "task" && i.assignee_id == null && i.status !== "done"
  ).length;
  const musicCount = ctx.items.filter((i) => i.kind === "music").length;
  const confirmedYes = countConfirmedGuests(ctx.items);
  const totalServings = countTotalServings(ctx.items);
  const shoppingNoPrice = ctx.items.filter((i) => {
    if (i.kind !== "shopping") return false;
    const m = (i.meta ?? {}) as ShoppingMeta;
    return !m.cost_cents || m.cost_cents <= 0;
  }).length;
  const totalShoppingCost = ctx.items
    .filter((i) => i.kind === "shopping")
    .reduce((acc, i) => {
      const m = (i.meta ?? {}) as ShoppingMeta;
      return acc + (m.cost_cents ?? 0);
    }, 0);

  const items: EventHealthChecklistItem[] = [];

  if (inFuture || (days != null && days >= 0)) {
    items.push({
      id: "public_link",
      label: "Public guest link is live",
      done: hasActiveLink,
      href: "settings",
      priority: 1,
    });
    items.push({
      id: "guests",
      label: "Guest list started",
      done: guestCount > 0,
      href: "guests",
      priority: 2,
    });
  }

  if (inFuture && days != null && days > 3) {
    items.push({
      id: "collab",
      label: "Co-host or collaborator invited",
      done: ctx.collaborators.length > 0,
      href: "settings",
      priority: 3,
    });
  }

  if (inFuture || (days != null && days >= 0)) {
    items.push({
      id: "tasks",
      label: "Fewer than 3 unassigned open tasks",
      done: unassignedTasks < 3,
      href: "timeline",
      priority: 4,
    });
  }

  if ((inFuture || (days != null && days >= 0)) && days != null && days <= 14) {
    items.push({
      id: "music",
      label: "Music or playlist added",
      done: musicCount > 0,
      href: "music",
      priority: 5,
    });
  }

  if (confirmedYes > 0 && totalServings > 0) {
    items.push({
      id: "servings",
      label: "Menu servings cover confirmed guests",
      done: confirmedYes <= totalServings,
      href: "food",
      priority: 6,
    });
  }

  if (shoppingNoPrice >= 3) {
    items.push({
      id: "prices",
      label: "Prices on shopping items (you have 3+ without)",
      done: shoppingNoPrice < 3,
      href: "shopping",
      priority: 7,
    });
  }

  if (ctx.event.budget_cents > 0) {
    items.push({
      id: "budget",
      label: "Shopping spend within budget",
      done: totalShoppingCost <= ctx.event.budget_cents,
      href: "budget",
      priority: 8,
    });
  }

  if (
    ctx.wrapUpFiled === false &&
    daysSince != null &&
    daysSince >= 1
  ) {
    items.push({
      id: "wrap_up",
      label: "Post-party wrap-up filed",
      done: false,
      href: "wrap-up",
      priority: 9,
    });
  }

  items.sort((a, b) => a.priority - b.priority);
  return items;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysUntilStart(starts: string | null, now: Date): number | null {
  if (!starts) return null;
  const d = parseISO(starts);
  if (Number.isNaN(d.getTime())) return null;
  return differenceInCalendarDays(d, now);
}

function daysSinceStart(starts: string | null, now: Date): number | null {
  if (!starts) return null;
  const d = parseISO(starts);
  if (Number.isNaN(d.getTime())) return null;
  return differenceInCalendarDays(now, d);
}

function isInFuture(starts: string | null, now: Date): boolean {
  if (!starts) return false;
  const d = parseISO(starts);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() > now.getTime();
}

function isSameLocalDay(starts: string | null, now: Date): boolean {
  if (!starts) return false;
  const d = parseISO(starts);
  if (Number.isNaN(d.getTime())) return false;
  return format(d, "yyyy-MM-dd") === format(now, "yyyy-MM-dd");
}

function countConfirmedGuests(items: EventItem[]): number {
  return items.reduce((acc, i) => {
    if (i.kind !== "guest") return acc;
    const m = (i.meta ?? {}) as GuestMeta;
    if (m.rsvp !== "yes") return acc;
    let extras = 0;
    if (typeof m.plus_ones === "number") {
      extras = Math.max(0, m.plus_ones);
    } else if (m.plus_one) {
      extras = Math.max(0, m.plus_one_count ?? 1);
    }
    return acc + 1 + extras;
  }, 0);
}

function countTotalServings(items: EventItem[]): number {
  return items.reduce((acc, i) => {
    if (i.kind !== "food") return acc;
    const m = (i.meta ?? {}) as FoodMeta;
    return acc + Math.max(0, m.servings ?? 0);
  }, 0);
}

function formatDollars(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
