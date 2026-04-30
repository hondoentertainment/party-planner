import { useEffect, useId, useRef, useState } from "react";
import { Bell, CheckCheck, Settings } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useNotifications } from "../lib/hooks";
import { relative } from "../lib/format";

export function NotificationCenter() {
  const { user } = useAuth();
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications(user?.id);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLElement>("button, a")?.focus();
    });
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
      trigger?.focus();
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="btn-ghost relative"
        aria-label={unreadCount ? `${unreadCount} unread notifications` : "Notifications"}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] leading-4 text-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          id={panelId}
          ref={panelRef}
          className="absolute right-0 mt-2 w-[min(22rem,calc(100vw-2rem))] card shadow-xl z-50 overflow-hidden"
          role="dialog"
          aria-modal="false"
          aria-label="Notifications"
        >
          <div className="p-3 border-b border-slate-100 flex items-center justify-between gap-2">
            <div>
              <h2 className="font-display font-bold text-sm">Notifications</h2>
              <p className="text-xs text-slate-500">{unreadCount} unread</p>
            </div>
            <button
              type="button"
              className="btn-ghost text-xs py-1 px-2"
              onClick={() => void markAllRead()}
              disabled={unreadCount === 0}
            >
              <CheckCheck size={14} /> Mark read
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-500">No notifications yet.</div>
            ) : (
              notifications.map((n) => {
                const content = (
                  <div className="p-3 hover:bg-slate-50 flex gap-2">
                    <span className={`mt-1 h-2 w-2 rounded-full ${n.read_at ? "bg-slate-200" : "bg-brand-500"}`} />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-slate-800">{n.title}</span>
                      {n.body && <span className="block text-xs text-slate-600 mt-0.5">{n.body}</span>}
                      <span className="block text-[11px] text-slate-400 mt-1">{relative(n.created_at)}</span>
                    </span>
                  </div>
                );
                return n.url ? (
                  <Link
                    key={n.id}
                    to={n.url}
                    onClick={() => {
                      void markRead(n.id);
                      setOpen(false);
                    }}
                    className="block"
                  >
                    {content}
                  </Link>
                ) : (
                  <button key={n.id} type="button" className="text-left w-full" onClick={() => void markRead(n.id)}>
                    {content}
                  </button>
                );
              })
            )}
          </div>
          <div className="border-t border-slate-100">
            <Link
              to="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 p-3 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            >
              <Settings size={14} />
              Notification settings
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
