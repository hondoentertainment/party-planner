// Lightweight, self-contained onboarding state.
//
// Backed by `window.localStorage` with try/catch fallbacks so it never throws
// in privacy mode, SSR, quota-exceeded, or sandboxed iframes.

export const ONBOARDING_KEY = "onboarding-completed-v1";

function safeStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function isOnboardingCompleted(): boolean {
  const ls = safeStorage();
  if (!ls) return false;
  try {
    return ls.getItem(ONBOARDING_KEY) === "1";
  } catch {
    return false;
  }
}

export function markOnboardingCompleted(): void {
  const ls = safeStorage();
  if (!ls) return;
  try {
    ls.setItem(ONBOARDING_KEY, "1");
  } catch {
    /* swallow quota / privacy mode */
  }
}

export function resetOnboarding(): void {
  const ls = safeStorage();
  if (!ls) return;
  try {
    ls.removeItem(ONBOARDING_KEY);
  } catch {
    /* swallow quota / privacy mode */
  }
}
