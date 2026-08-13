import { useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { Bell, Bug, Calendar, ChevronRight, LogOut, Settings } from "lucide-react";
import { useAuth } from "../lib/auth";

const FOCUSABLE_SEL =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface MobileAccountMenuProps {
  open: boolean;
  onClose: () => void;
  onReportBug?: () => void;
}

export function MobileAccountMenu({ open, onClose, onReportBug }: MobileAccountMenuProps) {
  const { profile, signOut } = useAuth();
  const panelRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const initialPathRef = useRef<string | null>(null);

  // Auto-close after navigation triggered from inside the sheet.
  useEffect(() => {
    if (!open) {
      initialPathRef.current = null;
      return;
    }
    if (initialPathRef.current === null) {
      initialPathRef.current = location.pathname;
      return;
    }
    if (location.pathname !== initialPathRef.current) {
      onClose();
    }
  }, [location.pathname, open, onClose]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      const el = panelRef.current?.querySelector<HTMLElement>("a, button");
      el?.focus();
    }, 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const list = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SEL)
      ).filter((n) => !n.hasAttribute("disabled"));
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, onClose]);

  if (!open) return null;

  const initial = (profile?.display_name || profile?.email || "?")
    .slice(0, 1)
    .toUpperCase();
  const displayName = profile?.display_name ?? "You";
  const email = profile?.email ?? "";

  const navItems = [
    { to: "/settings", label: "Settings", icon: Settings },
    { to: "/settings#notifications", label: "Notifications", icon: Bell },
    { to: "/calendar", label: "Calendar", icon: Calendar },
  ];

  return (
    <div
      className="sm:hidden fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-end"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        className="bg-white rounded-t-2xl w-full p-3 pb-6 shadow-xl safe-bottom max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-account-menu-title"
      >
        <div
          className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-3"
          aria-hidden
        />

        <div className="flex items-center gap-3 px-2 pb-3 mb-2 border-b border-slate-100">
          <div
            className="w-12 h-12 rounded-full bg-linear-to-br from-brand-400 to-brand-700 text-white grid place-items-center text-base font-semibold"
            aria-hidden
          >
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <div
              id="mobile-account-menu-title"
              className="font-display font-bold text-base truncate"
            >
              {displayName}
            </div>
            {email ? (
              <div className="text-xs text-slate-500 truncate">{email}</div>
            ) : null}
          </div>
        </div>

        <h3
          id="mobile-account-menu-section-account"
          className="px-3 pt-1 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500"
        >
          Account
        </h3>
        <ul
          className="space-y-1 mb-2"
          aria-labelledby="mobile-account-menu-section-account"
        >
          {navItems.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <Link
                to={to}
                onClick={onClose}
                className="flex items-center gap-3 px-3 min-h-[48px] rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100"
              >
                <Icon size={18} className="text-slate-500" aria-hidden />
                <span className="flex-1">{label}</span>
                <ChevronRight size={16} className="text-slate-400" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() => {
            onClose();
            onReportBug?.();
          }}
          className="w-full flex items-center gap-3 px-3 min-h-[48px] rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100"
        >
          <Bug size={18} className="text-slate-500" aria-hidden />
          <span className="flex-1 text-left">Report a bug</span>
          <ChevronRight size={16} className="text-slate-400" aria-hidden />
        </button>

        <hr className="border-slate-100 my-2" />

        <button
          type="button"
          onClick={async () => {
            await signOut();
            onClose();
          }}
          className="w-full flex items-center gap-3 px-3 min-h-[48px] rounded-lg text-sm font-medium text-rose-600 hover:bg-rose-50 active:bg-rose-100"
        >
          <LogOut size={18} aria-hidden />
          <span>Sign out</span>
        </button>
      </div>
    </div>
  );
}
