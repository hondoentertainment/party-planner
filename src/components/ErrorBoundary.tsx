import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertCircle, RefreshCcw } from "lucide-react";

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info);
  }

  reset = () => this.setState({ error: null });

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
            <div className="flex gap-2 justify-center">
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
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
