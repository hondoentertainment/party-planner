import { useRef, useState, type ReactNode } from "react";
import { Trash2 } from "lucide-react";
import clsx from "clsx";
import { useMatchMedia } from "../lib/useMatchMedia";

const REVEAL = 72;
const HALF = REVEAL * 0.55;

/**
 * On narrow viewports, swipe left to reveal a delete action. Wider: inert (no extra DOM).
 */
export function SwipeableRow({
  children,
  onDelete,
  deleteLabel = "Delete",
  disabled,
}: {
  children: ReactNode;
  onDelete: () => void;
  deleteLabel?: string;
  disabled?: boolean;
}) {
  const narrow = useMatchMedia("(max-width: 639px)");
  const startX = useRef(0);
  const [dx, setDx] = useState(0);
  const dragging = useRef(false);

  const onStart = (clientX: number) => {
    if (disabled || !narrow) return;
    dragging.current = true;
    startX.current = clientX - dx;
  };
  const onMove = (clientX: number) => {
    if (!dragging.current || disabled || !narrow) return;
    const next = Math.min(0, Math.max(-REVEAL, clientX - startX.current));
    setDx(next);
  };
  const onEnd = () => {
    if (!dragging.current) return;
    dragging.current = false;
    if (dx < -HALF) {
      setDx(-REVEAL);
    } else {
      setDx(0);
    }
  };

  const commitDelete = () => {
    setDx(0);
    onDelete();
  };

  return (
    <div
      className={clsx("relative overflow-hidden rounded-xl", !narrow && "overflow-visible")}
    >
      <div
        className={clsx("absolute right-0 top-0 bottom-0 w-[72px] z-0 bg-rose-600", narrow ? "flex" : "hidden")}
        aria-hidden={!narrow}
      >
        <button
          type="button"
          onClick={commitDelete}
          disabled={disabled}
          className="w-full h-full min-h-[44px] grid place-items-center text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white"
          aria-label={deleteLabel}
        >
          <Trash2 size={20} />
        </button>
      </div>
      <div
        className="relative z-10 max-sm:transition-transform max-sm:duration-200 max-sm:ease-out max-sm:motion-reduce:transition-none"
        style={narrow ? { transform: `translateX(${dx}px)` } : undefined}
        onTouchStart={(e) => onStart(e.touches[0].clientX)}
        onTouchMove={(e) => onMove(e.touches[0].clientX)}
        onTouchEnd={onEnd}
        onTouchCancel={onEnd}
      >
        {children}
      </div>
    </div>
  );
}
