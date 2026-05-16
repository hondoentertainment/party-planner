/// <reference lib="webworker" />
import { clientsClaim } from "workbox-core";
import { precacheAndRoute } from "workbox-precaching";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: (string | { url: string; revision: string })[];
};

self.skipWaiting();
clientsClaim();
precacheAndRoute(self.__WB_MANIFEST);

const APP_SHELL_URL = "/index.html";
const NAVIGATION_ALLOWLIST = [
  /^\/$/,
  /^\/calendar(?:\/.*)?$/,
  /^\/settings(?:\/.*)?$/,
  /^\/events\/[^/]+(?:\/.*)?$/,
  /^\/s\/[^/]+(?:\/.*)?$/,
  /^\/email\/unsubscribe(?:\/.*)?$/,
  /^\/privacy$/,
  /^\/terms$/,
  /^\/forgot$/,
  /^\/update-password$/,
];

self.addEventListener("fetch", (event: FetchEvent) => {
  const request = event.request;
  if (request.mode !== "navigate") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!NAVIGATION_ALLOWLIST.some((pattern) => pattern.test(url.pathname))) return;

  event.respondWith(
    fetch(request).catch(async () => {
      const cachedShell = await caches.match(APP_SHELL_URL);
      return cachedShell ?? Response.error();
    }),
  );
});

self.addEventListener("push", (event: PushEvent) => {
  let data: { title?: string; body?: string; url?: string } = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data?.text() };
  }
  const title = data.title ?? "Party Planner";
  const body = data.body ?? "You have a new update.";
  const url = data.url ?? "/";
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/party.svg",
      badge: "/party.svg",
      data: { url },
      tag: "party-planner",
    })
  );
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const path = (event.notification.data as { url?: string } | undefined)?.url ?? "/";
  const fullUrl = new URL(path, self.location.origin).href;
  event.waitUntil(
    self.clients.openWindow ? self.clients.openWindow(fullUrl) : Promise.resolve()
  );
});
