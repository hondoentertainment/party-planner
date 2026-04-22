import { useState } from "react";
import { Loader2, Mail, Trash2, UserPlus } from "lucide-react";
import type { CollabRole, EventRow } from "../lib/database.types";
import { useCollaborators } from "../lib/hooks";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";

export function EventSettings({ event }: { event: EventRow }) {
  const { collabs } = useCollaborators(event.id);
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<CollabRole>("editor");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err" | "info"; text: string } | null>(null);

  const isOwner = user?.id === event.owner_id;

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
    await supabase
      .from("event_collaborators")
      .delete()
      .eq("event_id", event.id)
      .eq("user_id", userId);
  };

  const updateRole = async (userId: string, newRole: CollabRole) => {
    await supabase
      .from("event_collaborators")
      .update({ role: newRole })
      .eq("event_id", event.id)
      .eq("user_id", userId);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="font-display text-2xl font-bold">Settings & Team</h2>
        <p className="text-slate-500 text-sm">Invite collaborators to plan together in real-time.</p>
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
              <Mail
                size={16}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="email"
                className="input pl-8"
                placeholder="friend@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <select
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
        {msg && (
          <div
            className={
              "text-sm mt-2 " +
              (msg.type === "ok"
                ? "text-emerald-600"
                : msg.type === "err"
                ? "text-rose-600"
                : "text-slate-600")
            }
          >
            {msg.text}
          </div>
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
              ★
            </div>
            <div className="flex-1">
              <div className="font-medium">Owner {user?.id === event.owner_id && "(you)"}</div>
              <div className="text-xs text-slate-500">Full access</div>
            </div>
            <span className="chip bg-amber-100 text-amber-700">owner</span>
          </li>
          {collabs.map((c) => (
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
                  aria-label="Remove collaborator"
                  className="btn-ghost text-rose-500 py-1 px-2"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          ))}
          {collabs.length === 0 && (
            <li className="py-3 text-sm text-slate-500">No collaborators yet.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
