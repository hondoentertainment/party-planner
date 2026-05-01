import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  Bell,
  BellOff,
  CalendarClock,
  CheckCircle2,
  Inbox,
  LogOut,
  Mail,
  ShieldAlert,
  UserCircle,
} from "lucide-react";
import clsx from "clsx";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import type {
  NotificationOptOut,
  NotificationOptOutKind,
} from "../lib/database.types";
import {
  hasActivePushSubscription,
  subscribeToPush,
  unsubscribePush,
} from "../lib/push";
import { useToast } from "../lib/toast";

type NotificationPrefs = {
  assignment_email: boolean;
  activity_digest: boolean;
};

const DEFAULT_PREFS: NotificationPrefs = {
  assignment_email: true,
  activity_digest: false,
};

function readPrefs(metadata: unknown): NotificationPrefs {
  const raw = (
    metadata as { notification_prefs?: Partial<NotificationPrefs> } | null | undefined
  )?.notification_prefs;
  return {
    assignment_email: raw?.assignment_email ?? DEFAULT_PREFS.assignment_email,
    activity_digest: raw?.activity_digest ?? DEFAULT_PREFS.activity_digest,
  };
}

// User-facing labels for each scheduled-reminder kind (migration 0013).
// Order matches the cadence guests experience.
type ReminderKind = Exclude<NotificationOptOutKind, "all">;

const REMINDER_KIND_META: Array<{
  kind: ReminderKind;
  label: string;
  hint: string;
}> = [
  {
    kind: "pre_7d",
    label: "T-7 days reminder",
    hint: "Quick checklist a week out — unassigned tasks, missing RSVPs.",
  },
  {
    kind: "pre_3d",
    label: "T-3 days reminder",
    hint: "Lock-it-in nudge with what still needs attention.",
  },
  {
    kind: "pre_1d",
    label: "T-1 day reminder",
    hint: "Final day-before pulse with the run-of-show link.",
  },
  {
    kind: "wrap_up_1d",
    label: "Post-party wrap-up",
    hint: "One day after the event: capture lessons learned and final spend.",
  },
];

export function SettingsPage() {
  const { user, profile, signOut } = useAuth();
  const toast = useToast();

  const [prefs, setPrefs] = useState<NotificationPrefs>(() =>
    readPrefs(user?.user_metadata)
  );
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const fadeTimer = useRef<number | null>(null);

  // Reminder opt-out state. `optOuts` is the set of kinds the user is
  // unsubscribed from; "checked" in the UI means they want the email, so the
  // checkbox is `!optOuts.has(kind)`. We treat `all` as a meta-opt-out:
  // when present, every kind reads as muted but we keep the row intact so
  // re-enabling individual kinds doesn't accidentally re-subscribe to all.
  const [optOuts, setOptOuts] = useState<Set<NotificationOptOutKind>>(
    () => new Set()
  );
  const [optOutsLoading, setOptOutsLoading] = useState(true);
  const [optOutsError, setOptOutsError] = useState<string | null>(null);
  const [pendingKind, setPendingKind] = useState<ReminderKind | null>(null);

  useEffect(() => {
    setPrefs(readPrefs(user?.user_metadata));
  }, [user?.user_metadata]);

  useEffect(
    () => () => {
      if (fadeTimer.current) window.clearTimeout(fadeTimer.current);
    },
    []
  );

  // Load the current opt-out rows once we know who the user is. RLS scopes
  // the select to the caller's own rows, so no `.eq('user_id', ...)` needed.
  useEffect(() => {
    if (!user) {
      setOptOuts(new Set());
      setOptOutsLoading(false);
      return;
    }
    let active = true;
    setOptOutsLoading(true);
    void (async () => {
      const { data, error } = await supabase
        .from("notification_opt_outs")
        .select("kind");
      if (!active) return;
      if (error) {
        setOptOutsError(error.message);
        setOptOutsLoading(false);
        return;
      }
      const next = new Set<NotificationOptOutKind>();
      for (const row of (data ?? []) as Pick<NotificationOptOut, "kind">[]) {
        next.add(row.kind);
      }
      setOptOuts(next);
      setOptOutsError(null);
      setOptOutsLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [user]);

  // Smooth-scroll to the email-prefs section when arriving via
  // `/settings#notifications` (the link in every reminder email footer).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash !== "#notifications") return;
    if (optOutsLoading) return;
    const el = document.getElementById("notifications");
    if (!el) return;
    const handle = window.setTimeout(() => {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
    return () => window.clearTimeout(handle);
  }, [optOutsLoading]);

  const toggleReminder = useCallback(
    async (kind: ReminderKind) => {
      if (!user) return;
      const previous = optOuts;
      const wasOptedOut = previous.has(kind) || previous.has("all");
      // Optimistic update first. Build a fresh Set so React re-renders.
      const next = new Set(previous);
      if (wasOptedOut) {
        next.delete(kind);
      } else {
        next.add(kind);
      }
      setOptOuts(next);
      setPendingKind(kind);
      setOptOutsError(null);

      const { error } = wasOptedOut
        ? await supabase
            .from("notification_opt_outs")
            .delete()
            .eq("user_id", user.id)
            .eq("kind", kind)
        : await supabase
            .from("notification_opt_outs")
            .insert({ user_id: user.id, kind });

      setPendingKind(null);
      if (error) {
        setOptOuts(previous);
        setOptOutsError(error.message);
        toast.error(`Couldn't update preferences: ${error.message}`);
        return;
      }
      setSavedAt(Date.now());
      if (fadeTimer.current) window.clearTimeout(fadeTimer.current);
      fadeTimer.current = window.setTimeout(() => setSavedAt(null), 1500);
    },
    [optOuts, toast, user]
  );

  const clearGlobalMute = useCallback(async () => {
    if (!user) return;
    const previous = optOuts;
    const next = new Set(previous);
    next.delete("all");
    setOptOuts(next);
    setOptOutsError(null);

    const { error } = await supabase
      .from("notification_opt_outs")
      .delete()
      .eq("user_id", user.id)
      .eq("kind", "all");
    if (error) {
      setOptOuts(previous);
      setOptOutsError(error.message);
      toast.error(`Couldn't update preferences: ${error.message}`);
      return;
    }
    setSavedAt(Date.now());
    if (fadeTimer.current) window.clearTimeout(fadeTimer.current);
    fadeTimer.current = window.setTimeout(() => setSavedAt(null), 1500);
  }, [optOuts, toast, user]);

  const persistPrefs = async (
    next: NotificationPrefs,
    previous: NotificationPrefs
  ) => {
    setSaveError(null);
    const existing =
      (user?.user_metadata as Record<string, unknown> | undefined) ?? {};
    const { error } = await supabase.auth.updateUser({
      data: { ...existing, notification_prefs: next },
    });
    if (error) {
      setPrefs(previous);
      setSaveError(error.message);
      return;
    }
    setSavedAt(Date.now());
    if (fadeTimer.current) window.clearTimeout(fadeTimer.current);
    fadeTimer.current = window.setTimeout(() => setSavedAt(null), 1500);
  };

  const togglePref = (key: keyof NotificationPrefs) => {
    const previous = prefs;
    const next: NotificationPrefs = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    void persistPrefs(next, previous);
  };

  const vapidConfigured = Boolean(import.meta.env.VITE_VAPID_PUBLIC_KEY);
  const pushSupported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window;
  const notificationApiAvailable = typeof Notification !== "undefined";

  const [pushSubscribed, setPushSubscribed] = useState<boolean | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushPermission, setPushPermission] = useState<
    NotificationPermission | "unsupported"
  >(notificationApiAvailable ? Notification.permission : "unsupported");

  useEffect(() => {
    if (!pushSupported || !vapidConfigured) {
      setPushSubscribed(false);
      return;
    }
    let active = true;
    void hasActivePushSubscription().then((s) => {
      if (active) setPushSubscribed(s);
    });
    return () => {
      active = false;
    };
  }, [pushSupported, vapidConfigured]);

  const enablePush = async () => {
    setPushBusy(true);
    const r = await subscribeToPush();
    setPushBusy(false);
    if (r.ok) {
      setPushSubscribed(true);
      if (notificationApiAvailable) setPushPermission(Notification.permission);
      toast.success("Browser notifications enabled.");
    } else {
      if (notificationApiAvailable) setPushPermission(Notification.permission);
      toast.error(r.error ?? "Could not enable notifications.");
    }
  };

  const disablePush = async () => {
    setPushBusy(true);
    try {
      await unsubscribePush();
      setPushSubscribed(false);
      toast.success("Browser notifications disabled.");
    } catch {
      toast.error("Could not disable notifications.");
    } finally {
      setPushBusy(false);
    }
  };

  const email = profile?.email ?? user?.email ?? "";
  const displayName = profile?.display_name ?? "";

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Settings</h1>
          <p className="text-slate-500 text-sm mt-1">
            Manage your account and how Party Planner notifies you.
          </p>
        </div>
        <SavedPill visible={savedAt != null} />
      </header>

      {saveError && (
        <div
          role="alert"
          aria-live="assertive"
          className="card p-3 border border-rose-200 bg-rose-50 text-rose-700 text-sm flex items-start gap-2"
        >
          <ShieldAlert size={16} className="mt-0.5 flex-shrink-0" />
          <span>Could not save preferences: {saveError}</span>
        </div>
      )}

      <SectionCard
        icon={<UserCircle size={18} className="text-brand-600" />}
        title="Account"
        description="Your sign-in details."
      >
        <dl className="text-sm grid sm:grid-cols-3 gap-y-2 gap-x-4 mb-4">
          <dt className="text-slate-500">Email</dt>
          <dd className="sm:col-span-2 font-medium break-all">
            {email || <span className="text-slate-400">No email on file</span>}
          </dd>
          {displayName && (
            <>
              <dt className="text-slate-500">Display name</dt>
              <dd className="sm:col-span-2 font-medium">{displayName}</dd>
            </>
          )}
        </dl>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => void signOut()}
        >
          <LogOut size={16} /> Sign out
        </button>
      </SectionCard>

      <SectionCard
        icon={<Mail size={18} className="text-brand-600" />}
        title="Email notifications"
        description="Choose which emails Party Planner can send you."
      >
        <ToggleRow
          label="Assignment notifications"
          hint="Email me when a teammate assigns me to a task."
          checked={prefs.assignment_email}
          onChange={() => togglePref("assignment_email")}
        />
        <Divider />
        <ToggleRow
          label="Activity digests"
          hint="Weekly recap of activity across your events."
          checked={prefs.activity_digest}
          onChange={() => togglePref("activity_digest")}
          disabled
          comingSoon
        />
      </SectionCard>

      <SectionCard
        icon={<Bell size={18} className="text-brand-600" />}
        title="Push notifications"
        description="Get a browser notification on this device when you are assigned a new task."
      >
        <PushControls
          configured={vapidConfigured}
          supported={pushSupported}
          permission={pushPermission}
          subscribed={pushSubscribed}
          busy={pushBusy}
          onEnable={() => void enablePush()}
          onDisable={() => void disablePush()}
        />
      </SectionCard>

      <section
        id="notifications"
        data-testid="email-prefs-section"
        className="card p-5 scroll-mt-20"
      >
        <header className="mb-4">
          <h2 className="font-display font-bold text-lg flex items-center gap-2">
            <Inbox size={18} className="text-brand-600" />
            Email reminder preferences
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Choose which scheduled reminder digests we email you about your
            events. Unchecking a row is the same as clicking{" "}
            <span className="whitespace-nowrap">"Unsubscribe"</span> in the
            footer of one of those emails.
          </p>
        </header>

        {optOuts.has("all") && (
          <div
            role="status"
            aria-live="polite"
            className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
          >
            <BellOff size={16} className="mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-medium">All reminder emails are muted.</p>
              <p className="text-amber-700/90 mt-0.5">
                You used a one-click unsubscribe link covering every reminder
                kind. Re-enable everything below, or toggle individual kinds
                after lifting the global mute.
              </p>
              <button
                type="button"
                className="mt-2 inline-flex items-center gap-1 rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100"
                onClick={() => void clearGlobalMute()}
              >
                Lift global mute
              </button>
            </div>
          </div>
        )}

        {optOutsError && (
          <div
            role="alert"
            aria-live="assertive"
            className="mb-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-sm text-rose-700"
          >
            <ShieldAlert size={14} className="mt-0.5 flex-shrink-0" />
            <span>Could not update preferences: {optOutsError}</span>
          </div>
        )}

        {optOutsLoading ? (
          <p className="text-sm text-slate-500">Loading preferences…</p>
        ) : (
          <div>
            {REMINDER_KIND_META.map((meta, idx) => {
              const muted = optOuts.has(meta.kind) || optOuts.has("all");
              return (
                <div key={meta.kind}>
                  {idx > 0 && <Divider />}
                  <ToggleRow
                    label={meta.label}
                    hint={meta.hint}
                    checked={!muted}
                    onChange={() => void toggleReminder(meta.kind)}
                    disabled={pendingKind === meta.kind || optOuts.has("all")}
                  />
                </div>
              );
            })}
          </div>
        )}
      </section>

      <SectionCard
        icon={<CalendarClock size={18} className="text-brand-600" />}
        title="Per-event email overrides"
        description="Mute or customize email notifications for specific events."
      >
        <div className="flex items-center gap-2">
          <span className="chip bg-slate-100 text-slate-600">Coming soon</span>
          <p className="text-sm text-slate-500">
            We're working on per-event overrides so you can mute a single event without
            affecting the rest.
          </p>
        </div>
      </SectionCard>
    </div>
  );
}

function SectionCard({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-5">
      <header className="mb-4">
        <h2 className="font-display font-bold text-lg flex items-center gap-2">
          {icon}
          {title}
        </h2>
        {description && (
          <p className="text-sm text-slate-500 mt-1">{description}</p>
        )}
      </header>
      {children}
    </section>
  );
}

function Divider() {
  return <div className="border-t border-slate-100 my-1" aria-hidden />;
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
  disabled,
  comingSoon,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  comingSoon?: boolean;
}) {
  const id = useId();
  const labelId = `${id}-label`;
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <label
            id={labelId}
            htmlFor={id}
            className="font-medium text-sm text-slate-800"
          >
            {label}
          </label>
          {comingSoon && (
            <span className="chip bg-slate-100 text-slate-600">
              Coming soon
            </span>
          )}
        </div>
        {hint && (
          <p id={hintId} className="text-xs text-slate-500 mt-0.5">
            {hint}
          </p>
        )}
      </div>
      <Switch
        id={id}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        labelledBy={labelId}
        describedBy={hintId}
      />
    </div>
  );
}

function Switch({
  id,
  checked,
  onChange,
  disabled,
  labelledBy,
  describedBy,
}: {
  id: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  labelledBy?: string;
  describedBy?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={onChange}
      className={clsx(
        "relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed",
        checked ? "bg-brand-600" : "bg-slate-300"
      )}
    >
      <span
        aria-hidden
        className={clsx(
          "absolute top-0.5 left-0.5 inline-block h-5 w-5 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-5" : "translate-x-0"
        )}
      />
    </button>
  );
}

function SavedPill({ visible }: { visible: boolean }) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={clsx(
        "chip bg-emerald-50 text-emerald-700 border border-emerald-200 transition-opacity duration-300",
        visible ? "opacity-100" : "opacity-0 pointer-events-none"
      )}
    >
      <CheckCircle2 size={12} aria-hidden /> Saved
    </span>
  );
}

function PushControls({
  configured,
  supported,
  permission,
  subscribed,
  busy,
  onEnable,
  onDisable,
}: {
  configured: boolean;
  supported: boolean;
  permission: NotificationPermission | "unsupported";
  subscribed: boolean | null;
  busy: boolean;
  onEnable: () => void;
  onDisable: () => void;
}) {
  if (!supported) {
    return (
      <p className="text-sm text-slate-500">
        Push notifications aren't supported in this browser.
      </p>
    );
  }
  if (!configured) {
    return (
      <p className="text-sm text-slate-500">
        Push notifications aren't configured for this app yet. Set the
        <code className="mx-1 px-1 rounded bg-slate-100 text-slate-700">
          VITE_VAPID_PUBLIC_KEY
        </code>
        env var to enable them.
      </p>
    );
  }
  if (permission === "denied") {
    return (
      <div className="space-y-2">
        <StatusRow tone="warn" label="Blocked by browser" />
        <p className="text-sm text-slate-500">
          You've blocked notifications for this site. Update the site permission
          in your browser settings, then reload.
        </p>
      </div>
    );
  }

  const isSubscribed = subscribed === true;
  const isLoading = subscribed === null;

  return (
    <div className="space-y-3">
      <StatusRow
        tone={isSubscribed ? "ok" : "muted"}
        label={
          isLoading
            ? "Checking subscription…"
            : isSubscribed
              ? "Enabled on this device"
              : "Not enabled on this device"
        }
      />
      <div className="flex flex-wrap gap-2">
        {isSubscribed ? (
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={onDisable}
          >
            <BellOff size={16} />
            {busy ? "Disabling…" : "Disable on this device"}
          </button>
        ) : (
          <button
            type="button"
            className="btn-primary"
            disabled={busy || isLoading}
            onClick={onEnable}
          >
            <Bell size={16} />
            {busy ? "Enabling…" : "Enable browser notifications"}
          </button>
        )}
      </div>
    </div>
  );
}

function StatusRow({
  tone,
  label,
}: {
  tone: "ok" | "muted" | "warn";
  label: string;
}) {
  const dot =
    tone === "ok"
      ? "bg-emerald-500"
      : tone === "warn"
        ? "bg-amber-500"
        : "bg-slate-300";
  return (
    <div className="flex items-center gap-2 text-sm text-slate-700">
      <span className={clsx("h-2 w-2 rounded-full", dot)} aria-hidden />
      <span>{label}</span>
    </div>
  );
}
