import { createContext, useCallback, useContext, useRef, useState } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog";

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    // Fallback for tests/storybook so consumers don't crash without the
    // provider mounted; falls back to the native confirm dialog.
    return async (options: ConfirmOptions) => {
      const message = options.description
        ? `${options.title}\n\n${options.description}`
        : options.title;
      return window.confirm(message);
    };
  }
  return ctx;
}

interface PendingConfirm {
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  // Track the active resolver via ref so back-to-back calls can't leak the
  // previous pending promise (we resolve(false) the prior one if any).
  const activeRef = useRef<PendingConfirm | null>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    return new Promise<boolean>((resolve) => {
      // Cancel any pre-existing pending confirm so only one is ever shown.
      if (activeRef.current) {
        activeRef.current.resolve(false);
        activeRef.current = null;
      }
      const next: PendingConfirm = { options, resolve };
      activeRef.current = next;
      setPending(next);
    });
  }, []);

  const finish = useCallback((value: boolean) => {
    const current = activeRef.current;
    if (current) {
      current.resolve(value);
      activeRef.current = null;
    }
    setPending(null);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog
        open={pending !== null}
        title={pending?.options.title ?? ""}
        description={pending?.options.description}
        confirmLabel={pending?.options.confirmLabel}
        cancelLabel={pending?.options.cancelLabel}
        destructive={pending?.options.destructive}
        onConfirm={() => finish(true)}
        onCancel={() => finish(false)}
      />
    </ConfirmContext.Provider>
  );
}
