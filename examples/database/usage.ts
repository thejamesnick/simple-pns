/**
 * Database Adapter — Usage Example
 * ─────────────────────────────────
 * Shows how to wire SqliteStore into a real server,
 * including dead-subscription cleanup on 410 Gone.
 *
 * Run:
 *   npx ts-node examples/database/usage.ts
 */

import { PushNotificationServer } from '../../src/server';
import { SqliteStore } from './SqliteStore';
import type { NotificationPayload } from '../../src/types';

// ── Setup ────────────────────────────────

const pns = new PushNotificationServer({
  contact: 'mailto:admin@example.com',
  publicKey: process.env.PUBLIC_VAPID_KEY!,
  privateKey: process.env.PRIVATE_VAPID_KEY!,
});

const store = new SqliteStore('./pns-subscriptions.db');

// ── Save a subscription ──────────────────

async function saveSubscription(endpoint: string, p256dh: string, auth: string) {
  await store.save({
    endpoint,
    keys: { p256dh, auth },
  });
  console.log(`💾 Saved: ${endpoint}`);
  console.log(`   Total: ${await store.count()}`);
}

// ── Broadcast with Cleanup ──────────────

async function broadcast(payload: NotificationPayload) {
  const all = await store.findAll();
  console.log(`📨 Broadcasting to ${all.length} subscribers...`);

  const results = await pns.sendBulk(all, payload);

  // Clean up dead subscriptions
  let cleaned = 0;
  for (const result of results) {
    if (
      result.status === 'fulfilled' &&
      !result.value.success &&
      result.value.error === 'GONE'
    ) {
      const dead = result.value.subscription;
      if (dead) {
        await store.deleteByEndpoint(dead.endpoint);
        cleaned++;
      }
    }
  }

  console.log(`   ✅ Sent | ❌ Failed | 🧹 ${cleaned} cleaned`);
  console.log(`   Remaining: ${await store.count()}`);
}

// ── Run ──────────────────────────────────

async function main() {
  // Simulate saving subscriptions from browser clients
  await saveSubscription(
    'https://fcm.googleapis.com/fcm/send/demo1',
    'base64-p256dh-key-1',
    'base64-auth-key-1',
  );

  await saveSubscription(
    'https://updates.push.services.mozilla.com/wpush/v1/demo2',
    'base64-p256dh-key-2',
    'base64-auth-key-2',
  );

  // Broadcast a notification
  await broadcast({
    title: 'Hello from PNS!',
    body: 'This notification was sent using the SQLite adapter.',
    url: '/notifications',
    vibrate: [200, 100, 200],
  });

  store.close();
}

main().catch(console.error);
