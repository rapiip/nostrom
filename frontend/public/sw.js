/*
 * Nostrom service worker: notifications only.
 *
 * Registered only after a visitor turns on browser alerts. It has no fetch
 * handler and caches nothing, so it never intercepts a request or serves a
 * stale copy of the app. It exists because Android Chrome only shows
 * notifications through a service worker, and so that clicking one brings the
 * vault page back into view.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw = event.notification.data && event.notification.data.url;

  // Only ever navigate within this origin.
  let target = "/app";
  try {
    const url = new URL(raw, self.location.origin);
    if (url.origin === self.location.origin) target = url.href;
  } catch {
    // Keep the default.
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (client.url === target && "focus" in client) return client.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});
