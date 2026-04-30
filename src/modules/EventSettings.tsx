import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarPlus, Copy, Link as LinkIcon, Loader2, LogOut, Mail, Save, Send, Trash2, UserPlus } from "lucide-react";
import type { CollabRole, EventRow } from "../lib/database.types";
import { useAllItems, useCollaborators, useEventPermissions, useShareLinks } from "../lib/hooks";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import { logActivity } from "../lib/activity";
import { downloadEventIcs, downloadEventScheduleIcs } from "../lib/exportIcs";

export function EventSettings({ event }: { event: EventRow }) {
  const { collabs, refresh: refreshCollabs } = useCollaborators(event.id);
  const { items } = useAllItems(event.id);
  const { links, refresh: refreshLinks } = useShareLinks(event.id);
  const perms = useEventPermissions(event);
  const { user } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<CollabRole>("editor");
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [emailingShare, setEmailingShare] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err" | "info"; text: string } | null>(null);

  const isOwner = user?.id === event.owner_id;
  const isCollaborator = !!(user && collabs.some((c) => c.user_id === user.id));
  const canLeave = !isOwner && isCollaborator;
  const activeLink = links.find((link) => link.enabled && !link.revoked_at);
  const publicUrl = activeLink ? `${window.location.origin}/s/${activeLink.token}` : "";

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setMsg(null);
    const { data, error } = await supabase.rpc("invite_collaborator", {
      _event_id: event.id,
      _email: email.trim(),
      _role: role,
    });
    setBusy(false);
    if (error) {
      setMsg({ type: "err", text: error.message });
      return;
    }
    const result = data as { status: string; message?: string; display_name?: string };
    if (result.status === "added") {
      setMsg({
        type: "ok",
        text: `Added ${result.display_name ?? email} as ${role}.`,
      });
      if (user) {
        void logActivity(
          event.id,
          user.id,
          `invited ${result.display_name ?? email} as ${role}`
        );
      }
      setEmail("");
    } else {
      setMsg({
        type: "info",
        text:
          result.message ??
          "No user with that email. Ask them to sign up, then invite again.",
      });
    }
  };

  const removeCollab = async (userId: string) => {
    if (!confirm("Remove this collaborator?")) return;
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
    if (
      !confirm(
        "Leave this event? You will be removed from the team and will need a new invite to return."
      )
    ) {
      return;
    }
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
    if (!confirm("Revoke this public share link? Anyone with the link will lose access.")) return;
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
          </div>
        ) : (
          <button type="button" className="btn-primary" disabled={!perms.canEdit} onClick={() => void createShareLink()}>
            <LinkIcon size={16} /> Create public link
          </button>
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
          The user must already have a Party Planner account. Once added, they can edit (or view)
          this event in real-time.
        </p>
      </div>

      <div className="card p-5">
        <h3 className="font-display font-bold mb-3">Team members</h3>
        <ul className="divide-y divide-slate-100">
          <li className="py-2 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-500 to-pink-500 text-white grid place-items-center text-sm font-bold">
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
                  className="text-xs bg-slate-100 border-0 rounded px-2 py-1"
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

