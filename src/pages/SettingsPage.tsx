import { useEffect, useId, useRef, useState } from "react";
import {
  Bell,
  BellOff,
  CalendarClock,
  CheckCircle2,
  LogOut,
  Mail,
  ShieldAlert,
  UserCircle,
} from "lucide-react";
import clsx from "clsx";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
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

export function SettingsPage() {
  const { user, profile, signOut } = useAuth();
  const toast = useToast();

  const [prefs, setPrefs] = useState<NotificationPrefs>(() =>
    readPrefs(user?.user_metadata)
  );
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const fadeTimer = useRef<number | null>(null);

  useEffect(() => {
    setPrefs(readPrefs(user?.user_metadata));
  }, [user?.user_metadata]);

  useEffect(
    () => () => {
      if (fadeTimer.current) window.clearTimeout(fadeTimer.current);
    },
    []
  );

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
