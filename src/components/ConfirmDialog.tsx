import { useEffect, useRef } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Modal } from "./Modal";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Modal auto-focuses the first focusable on a 0ms timeout. We want the
  // safer "Cancel" focused for destructive prompts and the action button for
  // non-destructive ones. Focus on the next tick so we win that race.
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      const target = destructive ? cancelRef.current : confirmRef.current;
      target?.focus();
    }, 1);
    return () => window.clearTimeout(t);
  }, [open, destructive]);

  if (!open) return null;

  const confirmClass = destructive ? "btn-danger" : "btn-primary";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    void onConfirm();
  };

  return (
    <Modal
      title={title}
      onClose={busy ? () => {} : onCancel}
      maxWidth="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {description !== undefined && (
          <div className="flex items-start gap-3">
            {destructive && (
              <AlertTriangle
                size={20}
                aria-hidden="true"
                className="text-rose-500 shrink-0 mt-0.5"
              />
            )}
            <div className="text-sm text-slate-600 leading-relaxed">
              {description}
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="btn-secondary"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="submit"
            disabled={busy}
            aria-busy={busy}
            className={confirmClass}
          >
            {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            {confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
