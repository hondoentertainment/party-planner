import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import clsx from "clsx";

type ToastKind = "success" | "error" | "info";

interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
}

interface ToastCtx {
  show: (message: string, kind?: ToastKind) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastCtx | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      show: (m: string) => console.log("[toast]", m),
      success: (m: string) => console.log("[toast:success]", m),
      error: (m: string) => console.error("[toast:error]", m),
      info: (m: string) => console.log("[toast:info]", m),
    } as ToastCtx;
  }
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timeouts = useRef<Map<string, number>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((arr) => arr.filter((t) => t.id !== id));
    const handle = timeouts.current.get(id);
    if (handle) {
      window.clearTimeout(handle);
      timeouts.current.delete(id);
    }
  }, []);

  const show = useCallback(
    (message: string, kind: ToastKind = "info") => {
      const id = Math.random().toString(36).slice(2);
      setToasts((arr) => [...arr, { id, kind, message }]);
      const handle = window.setTimeout(() => dismiss(id), kind === "error" ? 6000 : 3500);
      timeouts.current.set(id, handle);
    },
    [dismiss]
  );

  useEffect(() => {
    const map = timeouts.current;
    return () => {
      map.forEach((h) => window.clearTimeout(h));
      map.clear();
    };
  }, []);

  const ctx: ToastCtx = {
    show,
    success: (m) => show(m, "success"),
    error: (m) => show(m, "error"),
    info: (m) => show(m, "info"),
  };

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 pointer-events-none w-full px-4 max-w-md"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            className={clsx(
              "pointer-events-auto card flex items-start gap-2 px-3 py-2 shadow-pop animate-[fadeIn_120ms_ease-out] w-full",
              t.kind === "success" && "border-emerald-200 bg-emerald-50",
              t.kind === "error" && "border-rose-200 bg-rose-50",
              t.kind === "info" && "border-slate-200 bg-white"
            )}
          >
            {t.kind === "success" && <CheckCircle2 size={18} className="text-emerald-600 mt-0.5 flex-shrink-0" />}
            {t.kind === "error" && <AlertCircle size={18} className="text-rose-600 mt-0.5 flex-shrink-0" />}
            {t.kind === "info" && <Info size={18} className="text-slate-500 mt-0.5 flex-shrink-0" />}
            <div className="text-sm flex-1 leading-snug">{t.message}</div>
            <button
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="text-slate-400 hover:text-slate-700 mt-0.5"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
