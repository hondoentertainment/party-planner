import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Calendar, CalendarPlus, Clock, Copy, Link as LinkIcon, Loader2, LogOut, Mail, Save, Send, Trash2, UserPlus, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { CollabRole, EventRow, PendingEventInvitation } from "../lib/database.types";
import { REMINDER_EMAIL_KIND_META } from "../lib/reminderEmailMeta";
import {
  useAllItems,
  useCollaborators,
  useEventPermissions,
  useEventReminderMutes,
  useShareLinks,
} from "../lib/hooks";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import { logActivity } from "../lib/activity";
import { downloadEventIcs, downloadEventScheduleIcs } from "../lib/exportIcs";
import { useConfirm } from "../lib/useConfirm";

type InviteResult =
  | {
      status: "added";
      user_id?: string;
      display_name?: string | null;
      email?: string | null;
    }
  | {
      status: "pending";
      email: string;
      message?: string;
      invite_token: string;
    };

export function EventSettings({ event }: { event: EventRow }) {
  const { collabs, refresh: refreshCollabs } = useCollaborators(event.id);
  const { items } = useAllItems(event.id);
  const { links, refresh: refreshLinks } = useShareLinks(event.id);
  const {
    mutes: reminderMutes,
    loading: reminderMutesLoading,
    error: reminderMutesError,
    pendingKind: reminderMutePending,
    toggleMute: toggleReminderMute,
  } = useEventReminderMutes(event.id);
  const perms = useEventPermissions(event);
  const { user } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const confirmAction = useConfirm();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<CollabRole>("editor");
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [emailingShare, setEmailingShare] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err" | "info"; text: string } | null>(null);
  const [pending, setPending] = useState<PendingEventInvitation[]>([]);
  const [pendingBusyId, setPendingBusyId] = useState<string | null>(null);

  const isOwner = user?.id === event.owner_id;
  const isCollaborator = !!(user && collabs.some((c) => c.user_id === user.id));
  const canLeave = !isOwner && isCollaborator;
  const activeLink = links.find((link) => link.enabled && !link.revoked_at);
  const publicUrl = activeLink ? `${window.location.origin}/s/${activeLink.token}` : "";
  // Apple/Google/Outlook all recognise `webcal://` as "subscribe to this
  // calendar feed". Reusing the public share token means the feed inherits
  // the same enable/revoke semantics as the public guest page.
  const webcalUrl = activeLink
    ? `webcal://${window.location.host}/api/event.ics?token=${encodeURIComponent(activeLink.token)}`
    : "";

  const askConfirm = useCallback(
    async (opts: {
      title: string;
      description?: string;
      confirmLabel: string;
      destructive?: boolean;
    }): Promise<boolean> => {
      // useConfirm() returns a function that resolves true/false. It already
      // falls back to window.confirm internally when no ConfirmProvider is
      // mounted, so we don't need a second layer of fallback here.
      return await confirmAction(opts);
    },
    [confirmAction]
  );

  const refreshPending = useCallback(async () => {
    if (!isOwner) {
      setPending([]);
      return;
    }
    const { data, error } = await supabase
      .from("pending_event_invitations")
      .select("*")
      .eq("event_id", event.id)
      .is("claimed_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      console.warn("[EventSettings] failed to load pending invites:", error.message);
      return;
    }
    setPending((data ?? []) as PendingEventInvitation[]);
  }, [event.id, isOwner]);

  useEffect(() => {
    void refreshPending();
  }, [refreshPending]);

  const sendInviteEmail = async (params: {
    inviteEmail: string;
    inviteRole: string;
    inviteToken?: string;
    pending: boolean;
  }) => {
    try {
      const { data, error } = await supabase.functions.invoke("notify-invite", {
        body: {
          event_id: event.id,
          email: params.inviteEmail,
          role: params.inviteRole,
          invite_token: params.inviteToken ?? "",
          pending: params.pending,
        },
      });
      if (error) {
        const detail =
          (data as { error?: string } | null)?.error ?? error.message ?? "Could not send the email.";
        toast.error(`Email send failed: ${detail}`);
        return;
      }
      toast.success(`Invitation email sent to ${params.inviteEmail}.`);
    } catch (err) {
      // Email is best-effort; never block the invite flow on it.
      toast.error((err as Error).message ?? "Could not send the invitation email.");
    }
  };

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    const trimmed = email.trim();
    setBusy(true);
    setMsg(null);
    const { data, error } = await supabase.rpc("invite_collaborator", {
      _event_id: event.id,
      _email: trimmed,
      _role: role,
    });
    setBusy(false);
    if (error) {
      setMsg({ type: "err", text: error.message });
      return;
    }
    const result = data as InviteResult;
    if (result.status === "added") {
      setMsg({
        type: "ok",
        text: `Added ${result.display_name ?? trimmed} as ${role}.`,
      });
      if (user) {
        void logActivity(
          event.id,
          user.id,
          `invited ${result.display_name ?? trimmed} as ${role}`
        );
      }
      setEmail("");
      void sendInviteEmail({
        inviteEmail: result.email ?? trimmed,
        inviteRole: role,
        pending: false,
      });
      void refreshPending();
    } else {
      setMsg({
        type: "ok",
        text: `Invitation sent to ${result.email}. They'll get access when they sign up. (Reminder: send them the sign-up link.)`,
      });
      setEmail("");
      void sendInviteEmail({
        inviteEmail: result.email,
        inviteRole: role,
        inviteToken: result.invite_token,
        pending: true,
      });
      if (user) {
        void logActivity(event.id, user.id, `invited ${result.email} (pending sign-up)`);
      }
      void refreshPending();
    }
  };

  const removeCollab = async (userId: string) => {
    const target = collabs.find((c) => c.user_id === userId);
    const display =
      target?.profile?.display_name ?? target?.invited_email ?? "This person";
    const ok = await askConfirm({
      title: "Remove collaborator?",
      description: `${display} will lose access to this event.`,
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;
    setMsg(null);
    const { error } = await supabase
      .from("event_collaborators")
      .delete()
      .eq("event_id", event.id)
      .eq("user_id", userId);
    if (error) {
      setMsg({ type: "err", text: error.message });
      return;
    }
    if (user) void logActivity(event.id, user.id, `removed a collaborator from the team`);
    void refreshCollabs();
  };

  const resendPendingInvite = async (invite: PendingEventInvitation) => {
    setPendingBusyId(invite.id);
    try {
      await sendInviteEmail({
        inviteEmail: invite.email,
        inviteRole: invite.role,
        inviteToken: invite.token,
        pending: true,
      });
    } finally {
      setPendingBusyId(null);
    }
  };

  const cancelPendingInvite = async (invite: PendingEventInvitation) => {
    const ok = await askConfirm({
      title: "Cancel pending invitation?",
      description: `${invite.email} will no longer be able to claim this invite when they sign up.`,
      confirmLabel: "Cancel invite",
      destructive: true,
    });
    if (!ok) return;
    setPendingBusyId(invite.id);
    const { error } = await supabase.rpc("revoke_pending_invitation", { _id: invite.id });
    setPendingBusyId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Cancelled the invite for ${invite.email}.`);
    void refreshPending();
  };

  const updateRole = async (userId: string, newRole: CollabRole) => {
    setMsg(null);
    const { error } = await supabase
      .from("event_collaborators")
      .update({ role: newRole })
      .eq("event_id", event.id)
      .eq("user_id", userId);
    if (error) {
      setMsg({ type: "err", text: error.message });
      return;
    }
    setMsg({ type: "ok", text: "Team member role updated." });
    void refreshCollabs();
  };

  const leaveEvent = async () => {
    if (!user) return;
    const ok = await askConfirm({
      title: "Leave this event?",
      description:
        "You'll be removed from the team and will need a new invite to return.",
      confirmLabel: "Leave event",
      destructive: true,
    });
    if (!ok) return;
    setLeaving(true);
    setMsg(null);
    const { error } = await supabase
      .from("event_collaborators")
      .delete()
      .eq("event_id", event.id)
      .eq("user_id", user.id);
    setLeaving(false);
    if (error) {
      setMsg({ type: "err", text: error.message });
      return;
    }
    await logActivity(event.id, user.id, "left the team");
    nav("/");
  };

  const createShareLink = async () => {
    if (!user || !perms.canEdit) return;
    const { error } = await supabase.rpc("create_event_share_link", {
      _event_id: event.id,
      _label: "Public guest page",
    });
    if (error) {
      setMsg({ type: "err", text: error.message });
      return;
    }
    await logActivity(event.id, user.id, "created a public share link");
    void refreshLinks();
  };

  const revokeShareLink = async () => {
    if (!activeLink || !perms.canEdit) return;
    const ok = await askConfirm({
      title: "Revoke public link?",
      description:
        "Anyone with the current link will lose access. You can create a new link anytime.",
      confirmLabel: "Revoke link",
      destructive: true,
    });
    if (!ok) return;
    const { error } = await supabase
      .from("event_share_links")
      .update({ enabled: false, revoked_at: new Date().toISOString() })
      .eq("id", activeLink.id);
    if (error) {
      setMsg({ type: "err", text: error.message });
      return;
    }
    setMsg({ type: "ok", text: "Public share link revoked." });
    void refreshLinks();
  };

  const copyShareLink = async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setMsg({ type: "ok", text: "Public share link copied." });
    } catch {
      setMsg({ type: "err", text: "Clipboard access failed. Select and copy the link manually." });
    }
  };

  const copyWebcalUrl = async () => {
    if (!webcalUrl) return;
    try {
      await navigator.clipboard.writeText(webcalUrl);
      setMsg({ type: "ok", text: "Calendar subscription URL copied. Paste into your calendar app." });
    } catch {
      setMsg({ type: "err", text: "Clipboard access failed. Select and copy the URL manually." });
    }
  };

  const emailShareLink = async () => {
    if (!activeLink || emailingShare) return;
    setEmailingShare(true);
    try {
      const { data, error } = await supabase.functions.invoke("notify-share", {
        body: { event_id: event.id, share_token: activeLink.token },
      });
      if (error) {
        const detail =
          (data as { error?: string } | null)?.error ?? error.message ?? "Could not send the email.";
        toast.error(detail);
        return;
      }
      toast.success("Sent! Check your inbox for the share link.");
    } catch (err) {
      toast.error((err as Error).message ?? "Could not send the email.");
    } finally {
      setEmailingShare(false);
    }
  };

  const saveTemplate = async () => {
    if (!user || !perms.canEdit) return;
    const name = window.prompt("Template name", `${event.name} template`);
    if (!name) return;
    const templateItems = items.map((item) => ({
      kind: item.kind,
      phase: item.phase,
      title: item.title,
      description: item.description,
      meta: item.meta,
      position: item.position,
    }));
    const { error } = await supabase.from("user_event_templates").insert({
      owner_id: user.id,
      source_event_id: event.id,
      name,
      description: `Saved from ${event.name}`,
      emoji: event.cover_emoji,
      color: event.cover_color,
      items: templateItems,
    });
    if (error) {
      setMsg({ type: "err", text: error.message });
      return;
    }
    setMsg({ type: "ok", text: `Saved "${name}" as a reusable template.` });
    await logActivity(event.id, user.id, "saved this event as a template");
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="font-display text-2xl font-bold">Settings & Team</h2>
        <p className="text-slate-500 text-sm">Invite collaborators to plan together in real-time.</p>
      </div>

      {msg && <SettingsMessage type={msg.type} text={msg.text} />}

      <div className="card p-5">
        <h3 className="font-display font-bold mb-3 flex items-center gap-2">
          <CalendarPlus size={18} className="text-brand-600" /> Calendar
        </h3>
        <p className="text-sm text-slate-600 mb-3">
          Open this event in Google Calendar, Apple Calendar, or Outlook.
        </p>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => downloadEventIcs(event)}
        >
          <CalendarPlus size={16} />
          Download .ics file
        </button>
        <button
          type="button"
          className="btn-ghost ml-2"
          onClick={() => downloadEventScheduleIcs(event, items)}
        >
          Include task due dates
        </button>
      </div>

      <div className="card p-5">
        <h3 className="font-display font-bold mb-3 flex items-center gap-2">
          <LinkIcon size={18} className="text-brand-600" /> Public guest page
        </h3>
        <p className="text-sm text-slate-600 mb-3">
          Share a no-login page with the event details, schedule highlights, menu, and Partiful link.
        </p>
        {activeLink ? (
          <div className="space-y-3">
            <div className="bg-slate-50 rounded-lg p-2 text-xs break-all border border-slate-200">
              {publicUrl}
            </div>
            <div className="flex gap-2 flex-wrap">
              <button type="button" className="btn-secondary" onClick={() => void copyShareLink()}>
                <Copy size={16} /> Copy link
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={emailingShare}
                onClick={() => void emailShareLink()}
              >
                {emailingShare ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                Email me this link
              </button>
              {perms.canEdit && (
                <button type="button" className="btn-ghost text-rose-600 border border-rose-200" onClick={() => void revokeShareLink()}>
                  Revoke
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Active link created{" "}
              {formatDistanceToNow(new Date(activeLink.created_at), { addSuffix: true })}
            </p>

            <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
              <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                <Calendar size={14} className="text-brand-600" aria-hidden />
                Subscribe in your calendar
              </h4>
              <p className="text-xs text-slate-500">
                Paste this <code className="bg-slate-100 rounded-sm px-1">webcal://</code> URL into Apple
                Calendar, Google Calendar, or Outlook to subscribe. The event auto-updates if you change
                the date, name, or location — no need to re-share.
              </p>
              <div className="bg-slate-50 rounded-lg p-2 text-xs break-all border border-slate-200">
                {webcalUrl}
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-secondary" onClick={() => void copyWebcalUrl()}>
                  <Copy size={16} /> Copy subscribe URL
                </button>
                <a
                  href={webcalUrl}
                  className="btn-ghost border border-slate-200"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Calendar size={16} /> Open in calendar app
                </a>
              </div>
            </div>
          </div>
        ) : (
          <button type="button" className="btn-primary" disabled={!perms.canEdit} onClick={() => void createShareLink()}>
            <LinkIcon size={16} /> Create public link
          </button>
        )}
      </div>

      <div className="card p-5">
        <h3 className="font-display font-bold mb-3 flex items-center gap-2">
          <Bell size={18} className="text-brand-600" /> Reminder emails for this event
        </h3>
        <p className="text-sm text-slate-600 mb-3">
          Turn off automated T-7 / T-3 / T-1 and wrap-up emails for this event only. This does not
          change your account defaults in Account → Settings.
        </p>
        {reminderMutesError && (
          <div role="alert" className="text-sm text-rose-600 mb-3 rounded-lg border border-rose-200 bg-rose-50/80 p-2">
            {reminderMutesError}
          </div>
        )}
        {reminderMutesLoading ? (
          <p className="text-sm text-slate-500">Loading preferences…</p>
        ) : (
          <div className="space-y-3">
            {reminderMutes.has("all") && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-3 text-sm text-amber-900 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <span>Every reminder type is muted for this event.</span>
                <button
                  type="button"
                  className="btn-secondary text-xs py-1 px-2 whitespace-nowrap"
                  disabled={reminderMutePending === "all"}
                  onClick={() => void toggleReminderMute("all")}
                >
                  Restore individual toggles
                </button>
              </div>
            )}
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                className="mt-1 rounded-sm border-slate-300 text-brand-600 focus:ring-brand-500"
                checked={reminderMutes.has("all")}
                disabled={reminderMutePending === "all"}
                onChange={() => void toggleReminderMute("all")}
              />
              <span>
                <span className="font-medium text-slate-800">Mute all reminders for this event</span>
                <span className="block text-xs text-slate-500 mt-0.5">
                  One switch for every cadence below.
                </span>
              </span>
            </label>
            <div className="border-t border-slate-100 pt-3 space-y-2">
              {REMINDER_EMAIL_KIND_META.map((meta) => {
                const receiving = !reminderMutes.has(meta.kind) && !reminderMutes.has("all");
                return (
                  <label
                    key={meta.kind}
                    className="flex items-start gap-3 cursor-pointer group has-disabled:cursor-not-allowed"
                  >
                    <input
                      type="checkbox"
                      className="mt-1 rounded-sm border-slate-300 text-brand-600 focus:ring-brand-500 disabled:opacity-50"
                      checked={receiving}
                      disabled={
                        reminderMutes.has("all") ||
                        reminderMutePending === meta.kind ||
                        reminderMutePending === "all"
                      }
                      onChange={() => void toggleReminderMute(meta.kind)}
                    />
                    <span>
                      <span className="font-medium text-slate-800 text-sm">{meta.label}</span>
                      <span className="block text-xs text-slate-500 mt-0.5">{meta.hint}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="card p-5">
        <h3 className="font-display font-bold mb-3 flex items-center gap-2">
          <Save size={18} className="text-brand-600" /> Reusable template
        </h3>
        <p className="text-sm text-slate-600 mb-3">
          Save this event's checklist, menu, shopping, and planning items as a template for future parties.
        </p>
        <button type="button" className="btn-secondary" disabled={!perms.canEdit} onClick={() => void saveTemplate()}>
          <Save size={16} /> Save event as template
        </button>
      </div>

      <div className="card p-5">
        <h3 className="font-display font-bold mb-3 flex items-center gap-2">
          <UserPlus size={18} className="text-brand-600" /> Invite collaborator
        </h3>
        {!isOwner ? (
          <p className="text-sm text-slate-500">Only the event owner can invite collaborators.</p>
        ) : (
          <form onSubmit={invite} className="flex gap-2 flex-wrap items-center">
            <div className="flex-1 min-w-[200px] relative">
              <label htmlFor="invite-email" className="sr-only">
                Collaborator email
              </label>
              <Mail
                size={16}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                aria-hidden
              />
              <input
                id="invite-email"
                type="email"
                className="input pl-8"
                placeholder="friend@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <label htmlFor="invite-role" className="sr-only">
              Default role for invite
            </label>
            <select
              id="invite-role"
              value={role}
              onChange={(e) => setRole(e.target.value as CollabRole)}
              className="input w-32"
            >
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
            <button className="btn-primary" disabled={busy}>
              {busy && <Loader2 size={14} className="animate-spin" />}
              Invite
            </button>
          </form>
        )}
        <p className="text-xs text-slate-500 mt-3">
          If they already have a Party Planner account, they're added instantly. Otherwise we'll save
          a pending invite that auto-claims when they sign up with the same email.
        </p>
      </div>

      <div className="card p-5">
        <h3 className="font-display font-bold mb-3">Team members</h3>
        <ul className="divide-y divide-slate-100">
          <li className="py-2 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-linear-to-br from-brand-500 to-pink-500 text-white grid place-items-center text-sm font-bold">
              <span aria-hidden>★</span>
            </div>
            <div className="flex-1">
              <div className="font-medium">Owner {user?.id === event.owner_id && "(you)"}</div>
              <div className="text-xs text-slate-500">Full access</div>
            </div>
            <span className="chip bg-amber-100 text-amber-700">owner</span>
          </li>
          {collabs.map((c) => {
            const display = c.profile?.display_name ?? c.invited_email ?? "Member";
            return (
            <li key={c.user_id} className="py-2 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-slate-200 text-slate-600 grid place-items-center text-sm font-semibold">
                {(c.profile?.display_name ?? c.invited_email ?? "?").slice(0, 1).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">
                  {c.profile?.display_name ?? c.invited_email}
                </div>
                <div className="text-xs text-slate-500 truncate">{c.profile?.email}</div>
              </div>
              {isOwner ? (
                <select
                  value={c.role}
                  onChange={(e) => updateRole(c.user_id, e.target.value as CollabRole)}
                  className="text-xs bg-slate-100 border-0 rounded-sm px-2 py-1"
                  aria-label={`Role for ${display}`}
                >
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
              ) : (
                <span className="chip bg-slate-100 text-slate-600">{c.role}</span>
              )}
              {isOwner && (
                <button
                  onClick={() => removeCollab(c.user_id)}
                  aria-label={`Remove ${display}`}
                  className="btn-ghost text-rose-500 py-1 px-2"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </li>
            );
          })}
          {collabs.length === 0 && (
            <li className="py-3 text-sm text-slate-500">No collaborators yet.</li>
          )}
        </ul>
      </div>

      {isOwner && pending.length > 0 && (
        <div className="card p-5">
          <h3 className="font-display font-bold mb-3 flex items-center gap-2">
            <Clock size={18} className="text-brand-600" /> Pending invitations
          </h3>
          <p className="text-sm text-slate-600 mb-3">
            These people will join automatically the moment they sign up with their invited email.
          </p>
          <ul className="divide-y divide-slate-100">
            {pending.map((inv) => {
              const expires = new Date(inv.expires_at);
              const expiresLabel = Number.isFinite(expires.getTime())
                ? expires.toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : "soon";
              const busyHere = pendingBusyId === inv.id;
              return (
                <li
                  key={inv.id}
                  className="py-3 flex items-center gap-3 flex-wrap sm:flex-nowrap"
                >
                  <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-700 grid place-items-center text-sm font-semibold shrink-0">
                    <Mail size={16} aria-hidden />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{inv.email}</div>
                    <div className="text-xs text-slate-500 truncate">
                      {inv.role} · expires {expiresLabel}
                    </div>
                  </div>
                  <span className="chip bg-amber-100 text-amber-700">pending</span>
                  <button
                    type="button"
                    className="btn-ghost py-1 px-2 inline-flex items-center gap-1"
                    disabled={busyHere}
                    onClick={() => void resendPendingInvite(inv)}
                    aria-label={`Resend invite email to ${inv.email}`}
                  >
                    {busyHere ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Send size={14} />
                    )}
                    <span className="hidden sm:inline">Resend email</span>
                  </button>
                  <button
                    type="button"
                    className="btn-ghost text-rose-500 py-1 px-2 inline-flex items-center gap-1"
                    disabled={busyHere}
                    onClick={() => void cancelPendingInvite(inv)}
                    aria-label={`Cancel pending invite for ${inv.email}`}
                  >
                    <X size={14} />
                    <span className="hidden sm:inline">Cancel invite</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {canLeave && (
        <div className="card p-5 border-rose-100 bg-rose-50/50">
          <h3 className="font-display font-bold mb-2">Leave this event</h3>
          <p className="text-sm text-slate-600 mb-3">
            You will lose access until the owner invites you again.
          </p>
          <button
            type="button"
            className="btn-ghost text-rose-600 border border-rose-200 inline-flex items-center gap-2"
            disabled={leaving}
            onClick={() => void leaveEvent()}
          >
            {leaving ? <Loader2 size={16} className="animate-spin" /> : <LogOut size={16} />}
            Leave event
          </button>
        </div>
      )}
    </div>
  );
}

function SettingsMessage({ type, text }: { type: "ok" | "err" | "info"; text: string }) {
  const cls =
    type === "ok"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : type === "err"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : "border-slate-200 bg-slate-50 text-slate-700";
  return (
    <div role={type === "err" ? "alert" : "status"} aria-live="polite" className={`card p-3 text-sm border ${cls}`}>
      {text}
    </div>
  );
}

