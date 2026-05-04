import { Link } from "react-router-dom";
import clsx from "clsx";

export function LegalFooter({ className }: { className?: string }) {
  return (
    <nav
      aria-label="Legal"
      className={clsx(
        "flex flex-wrap gap-x-4 gap-y-1 justify-center text-xs text-slate-500",
        className,
      )}
    >
      <Link to="/privacy" className="hover:text-slate-800 underline decoration-slate-300">
        Privacy
      </Link>
      <Link to="/terms" className="hover:text-slate-800 underline decoration-slate-300">
        Terms
      </Link>
    </nav>
  );
}
