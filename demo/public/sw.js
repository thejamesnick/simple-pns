/**
 * PNS Demo Service Worker
 * ────────────────────────────
 * Compiled from src/sw/sw.ts for demo purposes.
 * Must be served from root scope (/sw.js).
 */

self.addEventListener('push', (event) => {
  let title = 'New Notification';
  let body = 'You have a new message.';
  let icon;
  let badge;
  let vibrate = [200, 100, 200];
  let url;
  let data = {};

  if (event.data) {
    try {
      const payload = event.data.json();
      title = payload.title ?? title;
      body = payload.body ?? body;
      icon = payload.icon;
      badge = payload.badge;
      vibrate = payload.vibrate ?? vibrate;
      url = payload.url;
      data = payload.data ?? {};
    } catch {
      body = event.data.text() || body;
    }
  }

  const options = {
    body,
    icon,
    badge,
    vibrate,
    data: { url, ...data },
    requireInteraction: false,
    silent: false,
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const clickUrl =
    (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url === clickUrl && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(clickUrl);
    })
  );
});
