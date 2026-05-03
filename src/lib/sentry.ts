import * as Sentry from "@sentry/react";

let initialized = false;
let globalHandlersInstalled = false;

export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn || initialized) return;
  initialized = true;
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    sendDefaultPii: false,
    tracesSampleRate: import.meta.env.PROD ? 0.15 : 1.0,
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
