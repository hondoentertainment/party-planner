import { Component, type ErrorInfo, type ReactNode } from "react";
import { captureException } from "@sentry/react";
import { AlertCircle, Bug, RefreshCcw } from "lucide-react";
import { BugReportDialog } from "./BugReportDialog";

interface State {
  error: Error | null;
  sentryEventId: string | null;
  reporting: boolean;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, sentryEventId: null, reporting: false };

  static getDerivedStateFromError(error: Error): State {
    return { error, sentryEventId: null, reporting: false };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info);
    if (import.meta.env.VITE_SENTRY_DSN) {
      const sentryEventId = captureException(error, {
        extra: { componentStack: info.componentStack },
      });
      this.setState({ sentryEventId: sentryEventId ?? null });
    }
  }

  reset = () => this.setState({ error: null, sentryEventId: null, reporting: false });

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="card max-w-md w-full p-6 text-center">
            <div className="w-12 h-12 mx-auto rounded-full bg-rose-100 grid place-items-center text-rose-600 mb-3">
              <AlertCircle size={24} />
            </div>
            <h1 className="font-display text-xl font-bold mb-1">Something went wrong</h1>
            <p className="text-sm text-slate-600 mb-4">
              The app hit an unexpected error. Try reloading the page — your data is safe in
              Supabase.
            </p>
            <pre className="text-xs text-left bg-slate-100 rounded p-2 mb-4 overflow-auto max-h-40 text-slate-600">
              {this.state.error.message}
            </pre>
            {this.state.sentryEventId ? (
              <p className="text-xs text-slate-500 mb-4">
                Error reference:{" "}
                <span className="font-mono">{this.state.sentryEventId}</span>
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2 justify-center">
              <button
                onClick={() => {
                  this.reset();
                  window.location.reload();
                }}
                className="btn-primary"
              >
                <RefreshCcw size={14} /> Reload
              </button>
              <button onClick={this.reset} className="btn-secondary">
                Try again
              </button>
              <button
                onClick={() => this.setState({ reporting: true })}
                className="btn-secondary"
              >
                <Bug size={14} /> Report this crash
              </button>
            </div>
            <BugReportDialog
              open={this.state.reporting}
              onClose={() => this.setState({ reporting: false })}
              defaultTitle="Unexpected app crash"
              defaultDescription={`The app crashed with this message:\n\n${this.state.error.message}`}
              sentryEventId={this.state.sentryEventId}
              source="error-boundary"
            />
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
