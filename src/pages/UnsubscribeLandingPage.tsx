import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { LegalFooter } from "../components/LegalFooter";
import { CheckCircle2, Mail, PartyPopper, TriangleAlert } from "lucide-react";

const KIND_LABEL: Record<string, string> = {
  pre_7d: "the 7-days-out reminder",
  pre_3d: "the 3-days-out reminder",
  pre_1d: "the day-before reminder",
  wrap_up_1d: "the post-party wrap-up nudge",
  all: "every Party Planner reminder",
};

function isKind(v: string | null): v is keyof typeof KIND_LABEL {
  return v !== null && v in KIND_LABEL;
}

/**
 * Target for email one-click unsubscribe: the edge function redirects here so
 * browsers always render HTML (some gateways rewrite non-2xx HTML bodies).
 */
export function UnsubscribeLandingPage() {
  const [params] = useSearchParams();
  const outcome = params.get("outcome");
  const kind = params.get("kind");
  const reason = params.get("reason");

  let emoji: ReactNode = <PartyPopper className="text-brand-600" size={28} aria-hidden />;
  let heading = "Email preferences";
  let body =
    "Manage reminder emails from your Party Planner account. Sign in and open Settings → Email reminder preferences.";

  if (outcome === "success" && isKind(kind)) {
    emoji = <CheckCircle2 className="text-emerald-600" size={28} aria-hidden />;
    heading = "You’re unsubscribed";
    const label = KIND_LABEL[kind];
    body = `You won’t get ${label} from Party Planner anymore. You can turn these back on anytime from your account settings.`;
  } else if (outcome === "invalid") {
    emoji = <TriangleAlert className="text-amber-600" size={28} aria-hidden />;
    heading = "We couldn’t finish that link";
    body =
      "This unsubscribe link is invalid or has expired. You can still change your email preferences by signing in to Party Planner.";
  } else if (outcome === "error" && reason === "config") {
    emoji = <TriangleAlert className="text-rose-600" size={28} aria-hidden />;
    heading = "Service unavailable";
    body =
      "Email preferences can’t be updated right now because the app isn’t fully configured. Please try again later.";
  } else if (outcome === "error") {
    emoji = <TriangleAlert className="text-rose-600" size={28} aria-hidden />;
    heading = "Something went wrong";
    body =
      "We couldn’t save your preference right now. Please try again later, or update reminders after you sign in.";
  }

  return (
    <div className="min-h-full bg-linear-to-br from-brand-50 via-white to-amber-50 flex items-center justify-center p-6">
      <div className="card max-w-lg w-full p-8 shadow-soft">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-white border border-brand-100 grid place-items-center shrink-0 shadow-xs">
            {emoji}
          </div>
          <div>
            <h1 className="font-display text-xl font-bold text-slate-900">{heading}</h1>
            <p className="text-slate-600 text-sm mt-1 leading-relaxed">{body}</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mt-6">
          <Link
            to="/settings#notifications"
            className="btn-primary text-center text-sm justify-center inline-flex items-center gap-2"
          >
            <Mail size={16} aria-hidden />
            Email reminder preferences
          </Link>
          <Link to="/" className="btn-secondary text-center text-sm justify-center">
            Back to Party Planner
          </Link>
        </div>
        <LegalFooter className="mt-6" />
      </div>
    </div>
  );
}
