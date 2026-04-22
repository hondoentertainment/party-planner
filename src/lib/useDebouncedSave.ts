import { useCallback, useEffect, useRef, useState } from "react";

/**
 * useDebouncedSave: locally manages an editable value that syncs to a remote
 * sink after a debounce window. Avoids hammering Supabase on every keystroke
 * and gives instantaneous typing feedback (the input is bound to local state,
 * not the round-tripped server value).
 *
 *   const [title, setTitle] = useDebouncedSave(item.title, (v) => update({ title: v }));
 *
 * If `value` changes externally (e.g. realtime echo from another collaborator)
 * it will overwrite local state UNLESS we have a pending pending save.
 */
export function useDebouncedSave<T>(
  remoteValue: T,
  save: (next: T) => Promise<void> | void,
  delayMs = 500
): [T, (v: T) => void, () => Promise<void>] {
  const [local, setLocal] = useState<T>(remoteValue);
  const dirty = useRef(false);
  const timer = useRef<number | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;

  // If remote value changes and we are not editing, sync.
  useEffect(() => {
    if (!dirty.current) {
      setLocal(remoteValue);
    }
  }, [remoteValue]);

  const flush = useCallback(async () => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    if (!dirty.current) return;
    dirty.current = false;
    await saveRef.current(local);
  }, [local]);

  const setValue = useCallback(
    (next: T) => {
      setLocal(next);
      dirty.current = true;
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        dirty.current = false;
        saveRef.current(next);
        timer.current = null;
      }, delayMs);
    },
    [delayMs]
  );

  // Flush on unmount so in-flight edits aren't lost
  useEffect(() => {
    return () => {
      if (timer.current && dirty.current) {
        dirty.current = false;
        // Fire-and-forget; we're unmounting.
        void saveRef.current(local);
        window.clearTimeout(timer.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return [local, setValue, flush];
}
