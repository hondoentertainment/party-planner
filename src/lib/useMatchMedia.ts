import { useEffect, useState } from "react";

export function useMatchMedia(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches
  );

  useEffect(() => {
    const m = window.matchMedia(query);
    const onChange = () => setMatches(m.matches);
    m.addEventListener("change", onChange);
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setMatches(m.matches);
    });
    return () => {
      cancelled = true;
      m.removeEventListener("change", onChange);
    };
  }, [query]);

  return matches;
}
