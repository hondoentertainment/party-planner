import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import { hasActivePushSubscription, subscribeToPush } from "../lib/push";

const DISMISS_KEY = "pp-push-prompt-dismissed";

export function PushPrompt() {
  const { user } = useAuth();
  const toast = useToast();
  const vapid = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  const [dismissed, setDismissed] = useState(
    () => typeof sessionStorage !== "undefined" && sessionStorage.getItem(DISMISS_KEY) === "1"
  );
  const [ready, setReady] = useState(false);
  const [subscribed, setSubscribed] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user || !vapid) return;
    void hasActivePushSubscription().then((s) => {
      setSubscribed(s);
      setReady(true);
    });
  }, [user, vapid]);

  if (!user || !vapid || !ready || dismissed || subscribed) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 border-b border-brand-100/80 bg-brand-50/90 text-sm flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-slate-800">
        <Bell size={16} className="text-brand-600 flex-shrink-0" />
        <span>Enable browser notifications when you are assigned a task (works with your existing assignment emails).</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn-primary text-xs py-1.5 px-3"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = await subscribeToPush();
            setBusy(false);
            if (r.ok) {
              setSubscribed(true);
              toast.success("You will get notified for new assignments.");
            } else {
              toast.error(r.error ?? "Could not enable notifications.");
            }
          }}
        >
          Enable
        </button>
        <button
          type="button"
          className="btn-ghost text-xs"
          onClick={() => {
            sessionStorage.setItem(DISMISS_KEY, "1");
            setDismissed(true);
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
