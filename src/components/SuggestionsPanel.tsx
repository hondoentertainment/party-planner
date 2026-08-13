/**
 * Reusable "Needs attention" panel that renders a list of {@link Suggestion}
 * cards. The panel is intentionally dumb: it does not compute suggestions or
 * fetch anything; pass in the result of {@link computeSuggestions} from
 * `src/lib/suggestions`.
 *
 * @example
 * ```tsx
 * <SuggestionsPanel
 *   suggestions={suggestions}
 *   basePath={`/events/${event.id}/`}
 *   localStorageDismissedKey={`pp:nudges:${event.id}`}
 * />
 * ```
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Music,
  Share2,
  ShoppingCart,
  Sparkles,
  Users,
  Wallet,
  X,
} from "lucide-react";
import type { Suggestion, SuggestionIcon, SuggestionSeverity } from "../lib/suggestions";

const ICONS: Record<SuggestionIcon, typeof Share2> = {
  share: Share2,
  users: Users,
  alert: AlertTriangle,
  sparkles: Sparkles,
  calendar: CalendarDays,
  shopping: ShoppingCart,
  music: Music,
  wallet: Wallet,
  check: CheckCircle2,
};

interface SeverityStyle {
  /** Left accent border (4px) — also applies the row's color cue. */
  border: string;
  /** Icon foreground tone matching the severity. */
  icon: string;
}

const SEVERITY_STYLES: Record<SuggestionSeverity, SeverityStyle> = {
  info: { border: "border-l-slate-300", icon: "text-slate-500" },
  warn: { border: "border-l-amber-400", icon: "text-amber-600" },
  celebrate: { border: "border-l-emerald-400", icon: "text-emerald-600" },
};

export interface SuggestionsPanelProps {
  /** Already-computed suggestions, in priority order. */
  suggestions: Suggestion[];
  /**
   * Path prefix prepended to each suggestion's `cta.to`. Should usually
   * end with a trailing slash, e.g. `` `/events/${event.id}/` ``.
   */
  basePath: string;
  /**
   * Optional callback fired when the user dismisses a row. Combined with
   * `localStorageDismissedKey`, both are invoked.
   */
  onDismiss?: (id: string) => void;
  /**
   * If provided, the panel persists dismissed ids to `localStorage` under
   * this key (stored as a JSON array of strings) and filters them out on
   * subsequent renders. Use a per-event key, e.g. `` `pp:nudges:${eventId}` ``.
   */
  localStorageDismissedKey?: string;
}

/**
 * Renders the "Needs attention" panel, or `null` when there is nothing to
 * show (after applying any locally-dismissed filter).
 */
export function SuggestionsPanel({
  suggestions,
  basePath,
  onDismiss,
  localStorageDismissedKey,
}: SuggestionsPanelProps): React.JSX.Element | null {
  const [dismissed, setDismissed] = useState<Set<string>>(() =>
    readDismissed(localStorageDismissedKey),
  );

  // Re-hydrate when the storage key changes (e.g. switching events).
  useEffect(() => {
    setDismissed(readDismissed(localStorageDismissedKey));
  }, [localStorageDismissedKey]);

  const handleDismiss = useCallback(
    (id: string) => {
      if (localStorageDismissedKey) {
        setDismissed((prev) => {
          if (prev.has(id)) return prev;
          const next = new Set(prev);
          next.add(id);
          writeDismissed(localStorageDismissedKey, next);
          return next;
        });
      }
      onDismiss?.(id);
    },
    [localStorageDismissedKey, onDismiss],
  );

  const visible = localStorageDismissedKey
    ? suggestions.filter((s) => !dismissed.has(s.id))
    : suggestions;

  if (visible.length === 0) return null;

  // The X is shown when the suggestion is dismissible AND the consumer has
  // wired up dismissal somehow — either via callback or via local storage.
  const canDismiss = (s: Suggestion): boolean =>
    s.dismissible !== false &&
    (onDismiss !== undefined || localStorageDismissedKey !== undefined);

  return (
    <section
      role="region"
      aria-label="Suggestions"
      className="card p-4 space-y-3"
    >
      <header className="flex items-center gap-2">
        <Sparkles size={16} className="text-brand-600 shrink-0" aria-hidden />
        <h3 className="font-display text-base font-bold">
          Needs attention ({visible.length})
        </h3>
      </header>
      <ul className="space-y-2">
        {visible.map((s) => {
          const Icon = ICONS[s.icon];
          const styles = SEVERITY_STYLES[s.severity];
          return (
            <li
              key={s.id}
              className={`flex items-start gap-3 rounded-lg border-l-4 bg-slate-50 p-3 ${styles.border}`}
            >
              <Icon
                size={18}
                className={`shrink-0 mt-0.5 ${styles.icon}`}
                aria-hidden
              />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm">{s.title}</div>
                {s.description && (
                  <p className="text-sm text-slate-600 mt-0.5">{s.description}</p>
                )}
              </div>
              {s.cta && (
                <Link
                  to={`${basePath}${s.cta.to}`}
                  className="btn-secondary text-sm whitespace-nowrap"
                >
                  {s.cta.label}
                </Link>
              )}
              {canDismiss(s) && (
                <button
                  type="button"
                  onClick={() => handleDismiss(s.id)}
                  className="p-1 rounded-sm text-slate-400 hover:text-slate-700 hover:bg-slate-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-400"
                  aria-label={`Dismiss '${s.title}' suggestion`}
                >
                  <X size={14} aria-hidden />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

function readDismissed(key: string | undefined): Set<string> {
  if (!key || typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === "string"));
  } catch {
    return new Set();
  }
}

function writeDismissed(key: string, ids: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(Array.from(ids)));
  } catch {
    /* ignore quota / privacy mode */
  }
}
