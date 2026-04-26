import { X } from "lucide-react";
import { useEffect, useId, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

function getFocusable(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute("disabled") && el.offsetParent !== null
  );
}

export function Modal({
  title,
  children,
  onClose,
  maxWidth = "max-w-lg",
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  maxWidth?: string;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const list = getFocusable(panelRef.current);
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || !panelRef.current.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);

    const t = window.setTimeout(() => {
      const el = panelRef.current;
      if (!el) return;
      const list = getFocusable(el);
      (list[0] ?? el).focus();
    }, 0);

    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full ${maxWidth} max-h-[92vh] overflow-hidden flex flex-col outline-none`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 id={titleId} className="font-display text-lg font-bold">
            {title}
          </h2>
          <button onClick={onClose} aria-label="Close dialog" className="btn-ghost -mr-2">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
