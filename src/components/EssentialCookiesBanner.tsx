import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";

const STORAGE_KEY = "party-planner-essential-privacy-ack";

/**
 * Dismissible notice about essential auth storage — not a blocking cookie wall.
 * Optional analytics (Plausible) is documented on the Privacy page.
 */
export function EssentialCookiesBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  const dismiss = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore quota / private mode */
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Privacy notice"
      className="fixed bottom-0 inset-x-0 z-[90] p-3 sm:p-4 pointer-events-none"
    >
      <div className="max-w-3xl mx-auto pointer-events-auto rounded-xl border border-slate-200 bg-white shadow-pop px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
        <p className="text-sm text-slate-700 flex-1 leading-snug">
          We use essential storage so you can stay signed in and load the app. See our{" "}
          <Link to="/privacy" className="text-brand-700 font-medium underline decoration-brand-200">
            Privacy
          </Link>{" "}
          policy for details.
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="btn-secondary shrink-0 inline-flex items-center justify-center gap-1.5 text-sm self-end sm:self-auto"
        >
          <X size={16} aria-hidden />
          OK
        </button>
      </div>
    </div>
  );
}
