import { Link, NavLink } from "react-router-dom";
import { Calendar, Home, LogOut, PartyPopper } from "lucide-react";
import { useAuth } from "../lib/auth";
import clsx from "clsx";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useAuth();

  const navItems = [
    { to: "/", label: "Events", icon: Home, end: true },
    { to: "/calendar", label: "Calendar", icon: Calendar, end: false },
  ];

  return (
    <div className="min-h-full flex flex-col">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-display font-bold text-lg">
            <span className="w-8 h-8 rounded-lg bg-brand-600 text-white grid place-items-center shadow-pop">
              <PartyPopper size={18} />
            </span>
            <span>Party&nbsp;Planner</span>
          </Link>

          <nav className="hidden sm:flex items-center gap-1">
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
            <div className="hidden sm:flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-white grid place-items-center text-xs font-semibold">
                {(profile?.display_name || profile?.email || "?").slice(0, 1).toUpperCase()}
              </div>
              <div className="text-sm leading-tight">
                <div className="font-medium">{profile?.display_name ?? "You"}</div>
                <div className="text-xs text-slate-500">{profile?.email}</div>
              </div>
            </div>
            <button
              onClick={signOut}
              aria-label="Sign out"
              className="btn-ghost"
              title="Sign out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>

        <nav className="sm:hidden border-t border-slate-100 px-4 py-2 flex items-center gap-1">
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

      <main className="flex-1">{children}</main>
    </div>
  );
}
