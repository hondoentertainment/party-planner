/// <reference lib="webworker" />
import { clientsClaim } from "workbox-core";
import { precacheAndRoute } from "workbox-precaching";

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (string | { url: string; revision: string })[] };

self.skipWaiting();
clientsClaim();
precacheAndRoute(self.__WB_MANIFEST);

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
