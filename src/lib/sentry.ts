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

/**
 * Network identifiers v10 scrubbed while `sendDefaultPii` was false.
 * v11 removed that flag; an unset `dataCollection` now collects these.
 */
const NETWORK_PII_DENY = ["forwarded", "-ip", "remote-", "via", "-user"];

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
    // Preserve the v10 `sendDefaultPii: false` baseline. v11 defaults collect
    // user info, cookies, and HTTP bodies unless these categories are set.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: {
        request: { deny: NETWORK_PII_DENY },
        response: { deny: NETWORK_PII_DENY },
      },
      httpBodies: [],
      urlQueryParams: { deny: NETWORK_PII_DENY },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      graphQL: { document: false, variables: false },
    },
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
