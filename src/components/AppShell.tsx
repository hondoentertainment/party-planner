import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import {
  Calendar,
  ChevronDown,
  Home,
  LogOut,
  PartyPopper,
  Settings,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { PushPrompt } from "./PushPrompt";
import { NotificationCenter } from "./NotificationCenter";
import { MobileAccountMenu } from "./MobileAccountMenu";
import clsx from "clsx";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [desktopMenuOpen, setDesktopMenuOpen] = useState(false);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const desktopTriggerRef = useRef<HTMLButtonElement>(null);
  const desktopMenuRef = useRef<HTMLDivElement>(null);

  const navItems = [
    { to: "/", label: "Events", icon: Home, end: true },
    { to: "/calendar", label: "Calendar", icon: Calendar, end: false },
  ];

  // Mobile sheet: restore focus to the trigger when the sheet closes.
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const trigger = mobileTriggerRef.current;
    return () => {
      trigger?.focus();
    };
  }, [mobileMenuOpen]);

  // Desktop dropdown: Escape + outside click handling.
  useEffect(() => {
    if (!desktopMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setDesktopMenuOpen(false);
        desktopTriggerRef.current?.focus();
      }
    };
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (
        desktopMenuRef.current?.contains(target) ||
        desktopTriggerRef.current?.contains(target)
      ) {
        return;
      }
      setDesktopMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [desktopMenuOpen]);

  // Auto-close the desktop dropdown after navigation.
  useEffect(() => {
    setDesktopMenuOpen(false);
  }, [location.pathname]);

  const initial = (profile?.display_name || profile?.email || "?")
    .slice(0, 1)
    .toUpperCase();
  const displayName = profile?.display_name ?? "You";

  return (
    <div className="min-h-full flex flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-white focus:ring-2 focus:ring-brand-500 focus:shadow"
      >
        Skip to main content
      </a>
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-display font-bold text-lg">
            <span className="w-8 h-8 rounded-lg bg-brand-600 text-white grid place-items-center shadow-pop" aria-hidden>
              <PartyPopper size={18} />
            </span>
            <span>Party&nbsp;Planner</span>
          </Link>

          <nav className="hidden sm:flex items-center gap-1" aria-label="Main">
            {navItems.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  clsx(
                    "px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5",
                    isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100"
                  )
                }
              >
                <n.icon size={16} />
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <NotificationCenter />

            <button
              ref={mobileTriggerRef}
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="sm:hidden inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-full hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
              aria-label={`Open account menu for ${displayName}`}
              aria-haspopup="dialog"
              aria-expanded={mobileMenuOpen}
            >
              <span
                className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-white grid place-items-center text-sm font-semibold"
                aria-hidden
              >
                {initial}
              </span>
            </button>

            <div className="hidden sm:block relative">
              <button
                ref={desktopTriggerRef}
                type="button"
                onClick={() => setDesktopMenuOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={desktopMenuOpen}
                aria-label={`Account menu for ${displayName}`}
                className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 min-h-[40px]"
              >
                <span
                  className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-white grid place-items-center text-xs font-semibold"
                  aria-hidden
                >
                  {initial}
                </span>
                <span className="text-sm leading-tight text-left">
                  <span className="block font-medium">{displayName}</span>
                  <span className="block text-xs text-slate-500">{profile?.email}</span>
                </span>
                <ChevronDown
                  size={14}
                  className={clsx(
                    "text-slate-400 transition-transform",
                    desktopMenuOpen && "rotate-180"
                  )}
                  aria-hidden
                />
              </button>

              {desktopMenuOpen && (
                <div
                  ref={desktopMenuRef}
                  role="menu"
                  aria-label="Account"
                  className="absolute right-0 top-full mt-1 w-56 card p-1 shadow-xl z-40"
                >
                  <Link
                    to="/settings"
                    role="menuitem"
                    onClick={() => setDesktopMenuOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 min-h-[40px]"
                  >
                    <Settings size={16} className="text-slate-500" aria-hidden />
                    Settings
                  </Link>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={async () => {
                      await signOut();
                      setDesktopMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-rose-600 hover:bg-rose-50 min-h-[40px]"
                  >
                    <LogOut size={16} aria-hidden />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <nav className="sm:hidden border-t border-slate-100 px-4 py-2 flex items-center gap-1" aria-label="Main">
          {navItems.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                clsx(
                  "px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 flex-1 justify-center",
                  isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100"
                )
              }
            >
              <n.icon size={16} />
              {n.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <PushPrompt />

      <main id="main-content" className="flex-1" tabIndex={-1}>
        {children}
      </main>

      <MobileAccountMenu
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
      />
    </div>
  );
}
