import { useState } from "react";
import { Check, Mail, Send } from "lucide-react";
import { supabase } from "../../lib/supabase";

export interface RecoveryLinkBannerProps {
  shareToken: string;
  email: string;
}

export default function RecoveryLinkBanner({
  shareToken,
  email,
}: RecoveryLinkBannerProps) {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSend = async () => {
    setStatus("sending");
    setErrorMsg(null);
    try {
      const { error } = await supabase.rpc("request_rsvp_recovery", {
        _share_token: shareToken,
        _email: email,
      });
      if (error) {
        // Fail silently in the UI to preserve the anti-enumeration guarantee
        // for casually-snooping observers, but log for debugging.
        console.warn("[rsvp recovery] request error:", error);
      }

      const { error: fnError } = await supabase.functions.invoke(
        "notify-rsvp-recovery",
        {
          body: { share_token: shareToken, email },
        },
      );
      if (fnError) {
        // Even on a function failure, don't reveal whether the email matched.
        console.warn("[rsvp recovery] notify error:", fnError);
      }
      setStatus("sent");
    } catch (err) {
      console.warn("[rsvp recovery]", err);
      setErrorMsg("We couldn't send the recovery link. Please try again later.");
      setStatus("error");
    }
  };

  return (
    <div
      className="rounded-xl border border-brand-100 bg-brand-50/60 p-3 text-sm text-slate-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
      role="region"
      aria-label="Cross-device RSVP recovery"
    >
      <p className="flex items-start gap-2">
        <Mail size={16} className="text-brand-600 mt-0.5" aria-hidden />
        <span>
          We saved your RSVP. To update it from any device later, email yourself a
          recovery link.
        </span>
      </p>
      <div className="flex items-center gap-2 text-xs">
        {status === "sent" ? (
          <span
            className="inline-flex items-center gap-1 text-emerald-700 font-medium"
            aria-live="polite"
          >
            <Check size={14} aria-hidden /> Check {email} for the link.
          </span>
        ) : (
          <button
            type="button"
            onClick={handleSend}
            disabled={status === "sending"}
            className="btn-secondary text-xs"
          >
            <Send size={12} aria-hidden />{" "}
            {status === "sending" ? "Sending…" : "Email me a recovery link"}
          </button>
        )}
      </div>
      {errorMsg && (
        <p className="text-xs text-rose-700 sm:basis-full" role="alert">
          {errorMsg}
        </p>
      )}
    </div>
  );
}
