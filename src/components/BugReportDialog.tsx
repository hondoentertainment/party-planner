import { type FormEvent, useId, useMemo, useState } from "react";
import { AlertTriangle, Bug, CheckCircle2 } from "lucide-react";
import { Modal } from "./Modal";
import { buildBugReportContext, getCurrentEventId, submitBugReport, submitPublicBugReport } from "../lib/bugReports";
import { useToast } from "../lib/toast";
import type { BugReportSeverity } from "../lib/database.types";

interface BugReportDialogProps {
  open: boolean;
  onClose: () => void;
  /** When set (public share page), submission uses token-guest RPC instead of auth insert. */
  shareToken?: string;
  defaultTitle?: string;
  defaultDescription?: string;
  sentryEventId?: string | null;
  source?: string;
}

export function BugReportDialog({
  open,
  onClose,
  shareToken,
  defaultTitle = "",
  defaultDescription = "",
  sentryEventId,
  source = "manual",
}: BugReportDialogProps) {
  const toast = useToast();
  const titleId = useId();
  const descriptionId = useId();
  const severityId = useId();
  const diagnosticsId = useId();
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState(defaultDescription);
  const [severity, setSeverity] = useState<BugReportSeverity>("medium");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedId, setSubmittedId] = useState<string | null>(null);

  const diagnosticsPreview = useMemo(() => {
    const base = buildBugReportContext({ source, sentryEventId });
    return {
      ...base,
      event_id_from_route: getCurrentEventId(),
      share_token_prefix: shareToken ? `${shareToken.slice(0, 8)}…` : null,
    };
  }, [source, sentryEventId, shareToken]);

  if (!open) return null;

  const close = () => {
    if (submitting) return;
    onClose();
    window.setTimeout(() => {
      setTitle(defaultTitle);
      setDescription(defaultDescription);
      setSeverity("medium");
      setError(null);
      setSubmittedId(null);
    }, 150);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload = { title, description, severity, sentryEventId, source };
      const result = shareToken
        ? await submitPublicBugReport(shareToken, payload)
        : await submitBugReport(payload);
      setSubmittedId(result.id ?? "submitted");
      toast.success("Bug report submitted. Thanks for the details.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not submit the bug report.";
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="Report a bug" onClose={close} maxWidth="max-w-xl">
      {submittedId ? (
        <div className="space-y-4">
          <div
            role="status"
            className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 flex gap-3"
          >
            <CheckCircle2 size={18} className="mt-0.5 shrink-0" aria-hidden />
            <div>
              <p className="font-medium">Report submitted</p>
              <p className="mt-1 text-emerald-700">
                We captured your notes and diagnostics for triage.
              </p>
            </div>
          </div>
          <div className="flex justify-end">
            <button type="button" className="btn-primary" onClick={close}>
              Done
            </button>
          </div>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={(e) => void submit(e)}>
          <div className="rounded-xl border border-brand-100 bg-brand-50/70 p-3 text-sm text-slate-700 flex gap-2">
            <Bug size={16} className="mt-0.5 shrink-0 text-brand-600" aria-hidden />
            <p>
              Tell us what broke. Your description is saved with lightweight diagnostics
              (page URL, browser, screen size, time zone — no passwords).
            </p>
          </div>

          <details className="rounded-lg border border-slate-200 bg-slate-50/80 text-sm">
            <summary className="cursor-pointer select-none px-3 py-2 font-medium text-slate-700">
              What we attach (preview)
            </summary>
            <div className="px-3 pb-3">
              <pre
                id={diagnosticsId}
                className="mt-1 max-h-40 overflow-auto rounded-md bg-white p-2 text-xs text-slate-600 border border-slate-100"
              >
                {JSON.stringify(diagnosticsPreview, null, 2)}
              </pre>
            </div>
          </details>

          {error && (
            <div
              role="alert"
              aria-live="assertive"
              className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 flex gap-2"
            >
              <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label htmlFor={titleId} className="block text-sm font-medium text-slate-700">
              Short title
            </label>
            <input
              id={titleId}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="input mt-1"
              placeholder="Example: Shopping list won't save"
              maxLength={160}
              required
            />
          </div>

          <div>
            <label htmlFor={descriptionId} className="block text-sm font-medium text-slate-700">
              What happened?
            </label>
            <textarea
              id={descriptionId}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="input mt-1 min-h-32 resize-y"
              placeholder="What were you trying to do, what did you expect, and what happened instead?"
              maxLength={5000}
              required
            />
          </div>

          <div>
            <label htmlFor={severityId} className="block text-sm font-medium text-slate-700">
              Severity
            </label>
            <select
              id={severityId}
              value={severity}
              onChange={(event) => setSeverity(event.target.value as BugReportSeverity)}
              className="input mt-1"
            >
              <option value="low">Low - polish or minor annoyance</option>
              <option value="medium">Medium - feature is difficult to use</option>
              <option value="high">High - feature is blocked</option>
              <option value="critical">Critical - app is unusable</option>
            </select>
          </div>

          {sentryEventId ? (
            <p className="text-xs text-slate-500">
              Crash reference: <span className="font-mono">{sentryEventId}</span>
            </p>
          ) : null}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={close} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? "Submitting…" : "Submit report"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
