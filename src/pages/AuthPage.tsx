import { useState } from "react";
import { PartyPopper, Loader2 } from "lucide-react";
import { useAuth } from "../lib/auth";

type Mode = "signin" | "signup" | "magic";

export function AuthPage() {
  const { signInWithPassword, signUp, signInWithMagicLink } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      if (mode === "signin") {
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

        <div className="flex gap-1 p-1 bg-slate-100 rounded-lg mb-6 text-sm">
          {(["signin", "signup", "magic"] as Mode[]).map((m) => (
            <button
              key={m}
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

        <form className="space-y-4" onSubmit={onSubmit}>
          {mode === "signup" && (
            <div>
              <label className="label">Your name</label>
              <input
                className="input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Alex Party"
                required
              />
            </div>
          )}
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>
          {mode !== "magic" && (
            <div>
              <label className="label">Password</label>
              <input
                type="password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                minLength={6}
                required
              />
            </div>
          )}

          {error && <div className="text-sm text-rose-600">{error}</div>}
          {info && <div className="text-sm text-emerald-600">{info}</div>}

          <button className="btn-primary w-full" disabled={loading}>
            {loading && <Loader2 size={16} className="animate-spin" />}
            {mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send link"}
          </button>
        </form>
      </div>
    </div>
  );
}
