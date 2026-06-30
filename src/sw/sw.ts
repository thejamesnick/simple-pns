/**
 * PNS Service Worker
 * ─────────────────────────────────────────────
 * Background script that handles incoming push events
 * and user interaction with notifications.
 *
 * This file is compiled to `dist/client/sw/sw.js` by the
 * client tsconfig, and **must be served from the root of
 * your domain** so it can control the full scope of the app.
 *
 * @package PNS
 */

/// <reference lib="webworker" />

// Make this a module so `addEventListener` calls are scoped.
export {};

const ctx = self as unknown as ServiceWorkerGlobalScope;

// ──────────────────────────────────────────────
//  Push Event — Incoming Notification
// ──────────────────────────────────────────────

ctx.addEventListener("push", (event: PushEvent) => {
  // Default payload when the server sends no data (a "silent push")
  let title = "New Notification";
  let body = "You have a new message.";
  let icon: string | undefined;
  let badge: string | undefined;
  let vibrate: number[] = [200, 100, 200];
  let url: string | undefined;
  let data: Record<string, unknown> = {};

  // Attempt to parse the payload sent by the server.
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
      // If JSON parsing fails, use the raw text as the body.
      body = event.data.text() || body;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const options: any = {
    body,
    icon,
    badge,
    vibrate,
    data: { url, ...data },
    requireInteraction: false,
    silent: false,
  };

  event.waitUntil(ctx.registration.showNotification(title, options));
});

// ──────────────────────────────────────────────
//  Notification Click — User Interaction
// ──────────────────────────────────────────────

ctx.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();

  const clickUrl =
    ((event.notification.data as Record<string, unknown>)?.url as
      | string
      | undefined) ?? "/";

  event.waitUntil(
    (async () => {
      const windowClients = await ctx.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of windowClients) {
        if (client.url === clickUrl && "focus" in client) {
          await client.focus();
          return;
        }
      }

      await ctx.clients.openWindow(clickUrl);
    })(),
  );
});
