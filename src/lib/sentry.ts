import * as Sentry from "@sentry/react";

let initialized = false;
let globalHandlersInstalled = false;

/** Browser extensions and benign browser quirks — not actionable in Sentry. */
const IGNORE_ERROR_MESSAGES = [
  /ResizeObserver loop/i,
  /Non-Error promise rejection captured/i,
  /Loading chunk [\d]+ failed/i,
  /Failed to fetch dynamically imported module/i,
];

export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn || initialized) return;
  initialized = true;

  const environment =
    import.meta.env.VITE_SENTRY_ENVIRONMENT?.trim() ||
    (import.meta.env.PROD ? "production" : "development");

  Sentry.init({
    dsn,
    environment,
    sendDefaultPii: false,
    initialScope: {
      tags: { app: "party-planner" },
    },
    tracesSampleRate: import.meta.env.PROD ? 0.15 : 1.0,
    release: import.meta.env.VITE_APP_RELEASE || undefined,
    ignoreErrors: IGNORE_ERROR_MESSAGES,
    denyUrls: [/extensions\//i, /^chrome:\/\//i, /^moz-extension:\/\//i],
    maxBreadcrumbs: 40,
    beforeSend(event) {
      const msg = event.exception?.values?.[0]?.value ?? "";
      if (
        /Failed to fetch dynamically imported module|Loading chunk [\d]+ failed|Load failed \(404/i.test(
          msg,
        )
      ) {
        return null;
      }
      return event;
    },
  });
}

export function installGlobalErrorHandlers() {
  if (globalHandlersInstalled) return;
  globalHandlersInstalled = true;

  window.addEventListener("error", (event) => {
    console.error("[window:error]", event.error ?? event.message);
    if (!initialized) return;
    Sentry.captureException(event.error ?? new Error(event.message), {
      extra: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    console.error("[window:unhandledrejection]", event.reason);
    if (!initialized) return;
    Sentry.captureException(
      event.reason instanceof Error ? event.reason : new Error(String(event.reason)),
      { extra: { reason: event.reason } }
    );
  });
}

export { Sentry };
