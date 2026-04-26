import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { PartyPopper, Loader2, ArrowLeft } from "lucide-react";
import { useAuth } from "../lib/auth";

type Mode = "signin" | "signup" | "magic" | "forgot";

export function AuthPage({ startMode = "signin" }: { startMode?: "signin" | "forgot" }) {
  const { signInWithPassword, signUp, signInWithMagicLink, sendPasswordResetEmail } = useAuth();
  const [mode, setMode] = useState<Mode>(startMode === "forgot" ? "forgot" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const nameId = useId();
  const emailId = useId();
  const passwordId = useId();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      if (mode === "forgot") {
        const { error } = await sendPasswordResetEmail(email);
        if (error) setError(error);
        else
          setInfo(
            "If an account exists for that email, you will receive a reset link shortly. Check your spam folder too."
          );
      } else if (mode === "signin") {
        const { error } = await signInWithPassword(email, password);
        if (error) setError(error);
      } else if (mode === "signup") {
        const { error } = await signUp(email, password, displayName || email.split("@")[0]);
        if (error) setError(error);
        else setInfo("Account created! Check your email to confirm, then sign in.");
      } else {
        const { error } = await signInWithMagicLink(email);
        if (error) setError(error);
        else setInfo("Check your email for a sign-in link.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-full bg-gradient-to-br from-brand-50 via-white to-amber-50 flex items-center justify-center p-6">
      <div className="card max-w-md w-full p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-brand-600 text-white grid place-items-center shadow-pop">
            <PartyPopper size={24} />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold">Party Planner</h1>
            <p className="text-slate-500 text-sm">Plan parties together.</p>
          </div>
        </div>

        {mode === "forgot" ? (
          <div className="mb-6">
            <Link
              to="/"
              className="inline-flex items-center gap-1 text-sm text-brand-600 hover:underline"
            >
              <ArrowLeft size={14} /> Back to sign in
            </Link>
            <h2 className="font-display text-lg font-bold text-slate-900 mt-3">Reset your password</h2>
            <p className="text-slate-500 text-sm mt-1">
              We will email you a one-time link to set a new password. It expires after a while for
              security.
            </p>
          </div>
        ) : (
          <div
            className="flex gap-1 p-1 bg-slate-100 rounded-lg mb-6 text-sm"
            role="tablist"
            aria-label="Account options"
          >
            {(["signin", "signup", "magic"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => {
                  setMode(m);
                  setError(null);
                  setInfo(null);
                }}
                className={
                  "flex-1 py-1.5 rounded-md font-medium " +
                  (mode === m ? "bg-white shadow-sm text-slate-900" : "text-slate-600")
                }
              >
                {m === "signin" ? "Sign in" : m === "signup" ? "Sign up" : "Magic link"}
              </button>
            ))}
          </div>
        )}

        <form className="space-y-4" onSubmit={onSubmit}>
          {mode === "signup" && (
            <div>
              <label className="label" htmlFor={nameId}>
                Your name
              </label>
              <input
                id={nameId}
                className="input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Alex Party"
                required
                autoComplete="name"
              />
            </div>
          )}
          <div>
            <label className="label" htmlFor={emailId}>
              Email
            </label>
            <input
              id={emailId}
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
          </div>
          {mode !== "magic" && mode !== "forgot" && (
            <div>
              <label className="label" htmlFor={passwordId}>
                Password
              </label>
              <input
                id={passwordId}
                type="password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                minLength={6}
                required
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
              />
            </div>
          )}

          {error && (
            <div className="text-sm text-rose-600" role="alert">
              {error}
            </div>
          )}
          {info && (
            <div className="text-sm text-emerald-600" role="status" aria-live="polite">
              {info}
            </div>
          )}

          <button
            className="btn-primary w-full"
            disabled={loading}
            aria-busy={loading}
            type="submit"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            {mode === "forgot"
              ? "Send reset link"
              : mode === "signin"
                ? "Sign in"
                : mode === "signup"
                  ? "Create account"
                  : "Send link"}
          </button>
          {mode === "signin" && (
            <p className="text-center text-sm text-slate-500">
              <Link to="/forgot" className="text-brand-600 hover:underline">
                Forgot password?
              </Link>
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
