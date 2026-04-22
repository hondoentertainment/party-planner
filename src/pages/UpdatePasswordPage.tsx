import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, KeyRound, ArrowLeft } from "lucide-react";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";

/**
 * Shown when the user lands from a password reset link (Supabase appends
 * #access_token=...&type=recovery). Not inside AppShell.
 */
export function UpdatePasswordPage() {
  const { updatePassword, signOut } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (pw.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (pw !== pw2) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    const { error: err } = await updatePassword(pw);
    setLoading(false);
    if (err) {
      setError(err);
      toast.error(err);
      return;
    }
    toast.success("Password updated. You are signed in.");
    nav("/", { replace: true });
  };

  return (
    <div className="min-h-full bg-gradient-to-br from-brand-50 via-white to-amber-50 flex items-center justify-center p-6">
      <div className="card max-w-md w-full p-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-xl bg-brand-600 text-white grid place-items-center shadow-pop">
            <KeyRound size={24} />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold">Set a new password</h1>
            <p className="text-slate-500 text-sm">Choose a strong password for your account.</p>
          </div>
        </div>

        <p className="text-sm text-slate-600 mb-6">
          This link is one-time. After you save, you can use the new password to sign in on any
          device.
        </p>

        <form className="space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="label" htmlFor="new-pw">
              New password
            </label>
            <input
              id="new-pw"
              type="password"
              className="input"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              minLength={6}
              required
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="label" htmlFor="new-pw2">
              Confirm password
            </label>
            <input
              id="new-pw2"
              type="password"
              className="input"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              minLength={6}
              required
              autoComplete="new-password"
            />
          </div>
          {error && <div className="text-sm text-rose-600">{error}</div>}
          <button className="btn-primary w-full" disabled={loading} type="submit">
            {loading && <Loader2 size={16} className="animate-spin" />}
            Update password
          </button>
        </form>

        <div className="mt-6 flex flex-col gap-2 text-sm text-center text-slate-500">
          <button
            type="button"
            onClick={async () => {
              await signOut();
              nav("/", { replace: true });
            }}
            className="text-brand-600 hover:underline inline-flex items-center justify-center gap-1"
          >
            <ArrowLeft size={14} /> Back to sign in
          </button>
          <button
            type="button"
            onClick={async () => {
              await signOut();
              nav("/");
            }}
            className="text-slate-500 hover:text-slate-800 underline"
          >
            Cancel and use a different account
          </button>
        </div>
      </div>
    </div>
  );
}
