import { useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import {
  PartyPopper,
  Loader2,
  ArrowLeft,
  Mail,
  ExternalLink,
  LayoutTemplate,
  Users,
  Link2,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import { LegalFooter } from "../components/LegalFooter";

type Mode = "signin" | "signup" | "magic" | "forgot";
type StartMode = "signin" | "signup" | "forgot";

interface MailProvider {
  name: string;
  url: string;
}

function getMailProvider(email: string): MailProvider | null {
  const domain = email.trim().toLowerCase().split("@")[1];
  if (!domain) return null;
  if (domain === "gmail.com" || domain === "googlemail.com") {
    return { name: "Gmail", url: "https://mail.google.com/" };
  }
  if (
    domain === "outlook.com" ||
    domain === "hotmail.com" ||
    domain === "live.com" ||
    domain === "msn.com"
  ) {
    return { name: "Outlook", url: "https://outlook.live.com/mail/" };
  }
  if (domain === "yahoo.com" || domain.endsWith(".yahoo.com")) {
    return { name: "Yahoo", url: "https://mail.yahoo.com/" };
  }
  if (domain === "icloud.com" || domain === "me.com" || domain === "mac.com") {
    return { name: "iCloud", url: "https://www.icloud.com/mail/" };
  }
  return null;
}

const FEATURES = [
  {
    Icon: LayoutTemplate,
    title: "Templates that pre-fill everything",
    blurb: "BBQ, birthday, cocktail party. Don't start from blank.",
  },
  {
    Icon: Users,
    title: "Co-plan in real-time",
    blurb: "Invite friends. Edits sync instantly. Activity feed shows who did what.",
  },
  {
    Icon: Link2,
    title: "A guest page that works",
    blurb: "Share one link. Guests RSVP, see the menu, add to their calendar.",
  },
] as const;

const RESEND_COOLDOWN_SECONDS = 60;
const SPAM_HINT_DELAY_MS = 5 * 60 * 1000;

export function AuthPage({ startMode = "signup" }: { startMode?: StartMode }) {
  const { signInWithPassword, signUp, signInWithMagicLink, sendPasswordResetEmail } = useAuth();
  const toast = useToast();
  const [mode, setMode] = useState<Mode>(startMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [signupSent, setSignupSent] = useState<{
    email: string;
    displayName: string;
    password: string;
  } | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendBusy, setResendBusy] = useState(false);
  const [showSpamHint, setShowSpamHint] = useState(false);
  const nameId = useId();
  const emailId = useId();
  const passwordId = useId();

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = window.setTimeout(() => {
      setResendCooldown((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearTimeout(t);
  }, [resendCooldown]);

  useEffect(() => {
    if (!signupSent) {
      setShowSpamHint(false);
      return;
    }
    const t = window.setTimeout(() => setShowSpamHint(true), SPAM_HINT_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [signupSent]);

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
    setInfo(null);
  };

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
        const name = displayName || email.split("@")[0];
        const { error } = await signUp(email, password, name);
        if (error) setError(error);
        else {
          setSignupSent({ email, displayName: name, password });
          setResendCooldown(RESEND_COOLDOWN_SECONDS);
        }
      } else {
        const { error } = await signInWithMagicLink(email);
        if (error) setError(error);
        else setInfo("Check your email for a sign-in link.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!signupSent || resendCooldown > 0 || resendBusy) return;
    setResendBusy(true);
    setError(null);
    try {
      const { error } = await signUp(
        signupSent.email,
        signupSent.password,
        signupSent.displayName
      );
      if (error) {
        setError(error);
      } else {
        toast.success("Resent — check your inbox");
        setResendCooldown(RESEND_COOLDOWN_SECONDS);
      }
    } finally {
      setResendBusy(false);
    }
  };

  const useDifferentEmail = () => {
    setSignupSent(null);
    setResendCooldown(0);
    setResendBusy(false);
    setShowSpamHint(false);
    setError(null);
    setInfo(null);
    setEmail("");
    setPassword("");
    setDisplayName("");
    setMode("signup");
  };

  const provider = signupSent ? getMailProvider(signupSent.email) : null;
  const ctaLabel =
    mode === "forgot"
      ? "Send reset link"
      : mode === "signin"
        ? "Sign in"
        : mode === "signup"
          ? "Start planning — it's free"
          : "Email me a sign-in link";

  return (
    <div className="min-h-full bg-linear-to-br from-brand-50 via-white to-amber-50 flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-5xl grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8 lg:gap-12 items-center">
        <div className="card w-full max-w-md mx-auto sm:max-w-none p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-12 h-12 rounded-xl bg-brand-600 text-white grid place-items-center shadow-pop">
              <PartyPopper size={24} aria-hidden />
            </div>
            <h2 className="font-display text-xl font-bold text-slate-900">Party Planner</h2>
          </div>

          {signupSent ? (
            <SignupSentPanel
              email={signupSent.email}
              provider={provider}
              resendCooldown={resendCooldown}
              resendBusy={resendBusy}
              showSpamHint={showSpamHint}
              error={error}
              onResend={handleResend}
              onUseDifferentEmail={useDifferentEmail}
            />
          ) : (
            <>
              {mode === "forgot" ? (
                <div className="mb-5">
                  <Link
                    to="/"
                    className="inline-flex items-center gap-1 text-sm text-brand-600 hover:underline"
                  >
                    <ArrowLeft size={14} aria-hidden /> Back to sign in
                  </Link>
                  <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 leading-tight mt-3">
                    Reset your password
                  </h1>
                  <p className="text-slate-600 text-sm mt-2">
                    We will email you a one-time link to set a new password. It expires after a
                    while for security.
                  </p>
                </div>
              ) : mode === "magic" ? (
                <div className="mb-5">
                  <button
                    type="button"
                    onClick={() => switchMode(startMode === "forgot" ? "signin" : startMode)}
                    className="inline-flex items-center gap-1 text-sm text-brand-600 hover:underline"
                  >
                    <ArrowLeft size={14} aria-hidden /> Back
                  </button>
                  <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 leading-tight mt-3">
                    Get a magic link
                  </h1>
                  <p className="text-slate-600 text-sm mt-2">
                    We'll email you a one-tap link to sign in — no password required.
                  </p>
                </div>
              ) : (
                <div className="mb-5">
                  <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 leading-tight">
                    {mode === "signup" ? "Create your account" : "Welcome back"}
                  </h1>
                  <p className="text-slate-600 text-sm mt-2">
                    {mode === "signup"
                      ? "Start planning your next party in seconds."
                      : "Sign in to keep planning with your crew."}
                  </p>
                </div>
              )}

              {(mode === "signin" || mode === "signup") && (
                <div
                  className="flex gap-1 p-1 bg-slate-100 rounded-lg mb-5 text-sm"
                  role="tablist"
                  aria-label="Account options"
                >
                  {(["signup", "signin"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="tab"
                      aria-selected={mode === m}
                      onClick={() => switchMode(m)}
                      data-testid={`auth-tab-${m}`}
                      className={
                        "flex-1 py-1.5 rounded-md font-medium focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-400 " +
                        (mode === m ? "bg-white shadow-xs text-slate-900" : "text-slate-600")
                      }
                    >
                      {m === "signup" ? "Sign up" : "Sign in"}
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

                <div>
                  <button
                    className="btn-primary w-full"
                    disabled={loading}
                    aria-busy={loading}
                    type="submit"
                    data-testid="auth-submit"
                    data-auth-mode={mode}
                  >
                    {loading && <Loader2 size={16} className="animate-spin" aria-hidden />}
                    {ctaLabel}
                  </button>
                  {mode === "signup" && (
                    <p className="text-center text-xs text-slate-500 mt-2">
                      No credit card. Takes about 30 seconds.
                    </p>
                  )}
                </div>

                {mode === "signin" && (
                  <p className="text-center text-sm text-slate-500">
                    <Link to="/forgot" className="text-brand-600 hover:underline">
                      Forgot password?
                    </Link>
                  </p>
                )}
              </form>

              {(mode === "signin" || mode === "signup") && (
                <details className="mt-5 pt-4 border-t border-slate-100 group">
                  <summary className="list-none cursor-pointer text-center text-sm font-medium text-slate-500 hover:text-slate-700 select-none [&::-webkit-details-marker]:hidden">
                    More sign-in options
                  </summary>
                  <div className="mt-3 text-center">
                    <button
                      type="button"
                      onClick={() => switchMode("magic")}
                      className="text-sm text-brand-600 hover:underline font-medium"
                    >
                      Use magic link instead
                    </button>
                  </div>
                </details>
              )}
            </>
          )}
        </div>

        <ValueProp />
      </div>
      <LegalFooter className="mt-8 pb-4" />
    </div>
  );
}

function ValueProp() {
  return (
    <aside
      className="hidden sm:flex flex-col"
      aria-label="Why Party Planner"
    >
      <div className="rounded-3xl bg-linear-to-br from-brand-50 via-white to-amber-50 border border-white/60 shadow-soft p-6 lg:p-8">
        <h2 className="font-display text-xl sm:text-2xl lg:text-3xl font-bold text-slate-900 leading-tight">
          Stop juggling spreadsheets, group chats, and sticky notes.
        </h2>
        <p className="text-slate-600 text-sm sm:text-base mt-2">
          Plan your next party with friends — in one place.
        </p>
        <ul className="space-y-3 mt-5 sm:mt-6">
          {FEATURES.map(({ Icon, title, blurb }) => (
            <li
              key={title}
              className="card p-4 flex items-start gap-3 bg-white/80 backdrop-blur-xs border-l-4 border-l-brand-500"
            >
              <div className="w-10 h-10 shrink-0 rounded-lg bg-brand-50 text-brand-600 grid place-items-center">
                <Icon size={20} aria-hidden />
              </div>
              <div>
                <p className="font-display font-semibold text-slate-900 text-sm">{title}</p>
                <p className="text-slate-600 text-sm mt-0.5">{blurb}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

interface SignupSentPanelProps {
  email: string;
  provider: MailProvider | null;
  resendCooldown: number;
  resendBusy: boolean;
  showSpamHint: boolean;
  error: string | null;
  onResend: () => void;
  onUseDifferentEmail: () => void;
}

function SignupSentPanel({
  email,
  provider,
  resendCooldown,
  resendBusy,
  showSpamHint,
  error,
  onResend,
  onUseDifferentEmail,
}: SignupSentPanelProps) {
  return (
    <div>
      <div className="flex flex-col items-center text-center">
        <div className="w-16 h-16 rounded-2xl bg-brand-50 text-brand-600 grid place-items-center mb-4">
          <Mail size={32} aria-hidden />
        </div>
        <h1 className="font-display text-2xl font-bold text-slate-900">Check your inbox</h1>
        <p className="text-slate-600 text-sm mt-2" role="status" aria-live="polite">
          We sent a confirmation link to{" "}
          <strong className="font-semibold text-slate-900 break-all">{email}</strong>. Click it to
          finish creating your account.
        </p>
      </div>

      <div className="mt-6 space-y-2">
        {provider && (
          <a
            className="btn-primary w-full"
            href={provider.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink size={16} aria-hidden />
            Open {provider.name}
          </a>
        )}
        <a
          className={
            provider ? "btn-secondary w-full justify-center" : "btn-primary w-full"
          }
          href="mailto:"
        >
          <Mail size={16} aria-hidden />
          Open my email app
        </a>
      </div>

      <div className="mt-5 border-t border-slate-100 pt-5 space-y-3">
        <button
          type="button"
          className="btn-secondary w-full justify-center"
          onClick={onResend}
          disabled={resendCooldown > 0 || resendBusy}
          aria-busy={resendBusy}
        >
          {resendBusy ? (
            <Loader2 size={16} className="animate-spin" aria-hidden />
          ) : (
            <Mail size={16} aria-hidden />
          )}
          {resendCooldown > 0
            ? `Resend confirmation email (${resendCooldown}s)`
            : "Resend confirmation email"}
        </button>
        {error && (
          <div className="text-xs text-rose-600 text-center" role="alert">
            {error}
          </div>
        )}
        <p className="text-center text-sm text-slate-500">
          Wrong address?{" "}
          <button
            type="button"
            className="text-brand-600 hover:underline font-medium"
            onClick={onUseDifferentEmail}
          >
            Use a different email
          </button>
        </p>
        {showSpamHint && (
          <p
            className="text-center text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2"
            role="status"
            aria-live="polite"
          >
            Still nothing? Check your spam folder, or try again.
          </p>
        )}
      </div>
    </div>
  );
}
