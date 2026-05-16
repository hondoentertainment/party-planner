import { AlertTriangle, X } from "lucide-react";

interface InvalidRecoveryTokenBannerProps {
  kind: "not_found" | "rpc_error";
  onDismiss: () => void;
}

/**
 * Shows when `?rsvp_token=` fails (expired UUID, typo, revoked row) or the lookup RPC errors.
 */
export function InvalidRecoveryTokenBanner({ kind, onDismiss }: InvalidRecoveryTokenBannerProps) {
  const summary =
    kind === "rpc_error"
      ? "We could not load your saved RSVP link"
      : "This RSVP recovery link no longer works";
  const detail =
    kind === "rpc_error"
      ? "Try again shortly, or RSVP below starting fresh."
      : "Recovery links expire for security. You can RSVP again below—the host sees your latest reply.";

  return (
    <div
      className="rounded-xl border border-amber-200 bg-amber-50/90 p-3 text-sm text-amber-950 flex gap-3"
      role="alert"
      aria-live="polite"
    >
      <AlertTriangle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" aria-hidden />
      <div className="flex-1 min-w-0">
        <p className="font-medium">{summary}</p>
        <p className="text-amber-900/85 mt-0.5">{detail}</p>
      </div>
      <button
        type="button"
        className="self-start inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
        onClick={onDismiss}
        aria-label="Dismiss recovery link notice"
      >
        <X size={18} aria-hidden />
      </button>
    </div>
  );
}
