# SimplePNS

> A cross-runtime push notification system for Node.js, edge runtimes, and the browser.
> VAPID auth, dead-subscription cleanup, bulk sending, serverless support.
> Designed for scale. Built for developers.

[![CI](https://github.com/thejamesnick/simple-pns/actions/workflows/ci.yml/badge.svg)](https://github.com/thejamesnick/simple-pns/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node-%3E%3D18-green?style=flat-square&logo=node.js)](https://nodejs.org/)
[![npm](https://img.shields.io/npm/v/simple-pns?style=flat-square&logo=npm)](https://www.npmjs.com/package/simple-pns)
[![License](https://img.shields.io/badge/license-MIT-lightgrey?style=flat-square)](LICENSE)

---

## What is SimplePNS?

SimplePNS is a drop-in push notification library that works everywhere — **Node.js servers, Cloudflare Workers, Vercel Edge Functions, Deno Deploy, and AWS Lambda.** It handles the hard parts so you don't have to.

### What can you build with it?

| Use case | How SimplePNS helps |
|---|---|
| **PWA notifications** | Subscribe browser users, send push notifications when they're offline |
| **Transactional alerts** | Payment confirmations, password resets, login alerts — via the server SDK |
| **Broadcast campaigns** | Send a notification to all users with `sendBulk()` — works for 10 to 100k |
| **Edge-native apps** | Cloudflare Worker sends push via Web Crypto API — no Node.js needed |
| **Serverless APIs** | Lambda or Vercel function receives subs, queue worker sends pushes |
| **Real-time dashboards** | Notify users when a metric threshold is hit or a report is ready |

---

## Overview

```
┌──────────────┐     ┌──────────────────────┐     ┌──────────────────┐     ┌──────────────┐
│  Your Backend │────▶│  SimplePNS            │────▶│  Browser Push    │────▶│  User's       │
│  (Node, Edge, │     │  (sendBulk,           │     │  Service (FCM/   │     │  Browser SW   │
│   Lambda)     │◀────│  cleanup, queue)       │◀────│  APNS/Mozilla)   │     │  (PWA)        │
└──────────────┘     └──────────────────────┘     └──────────────────┘     └──────────────┘
                               ▲
                     ┌─────────┴──────────┐
                     │  SimplePNS Client   │
                     │  (subscribe,        │
                     │   permission, SW)   │
                     └────────────────────┘
```

### What's inside

| Package | Path | Description |
|---|---|---|
| **Server SDK** | `src/server/` | Node.js class — VAPID, bulk sending, dead-sub cleanup |
| **Edge SDK** | `src/edge/` | Runtime-agnostic — same API, works on CF Workers, Vercel Edge, Deno, Lambda, Node.js |
| **Client SDK** | `src/client/` | Browser class — subscribe, permission, SW registration |
| **Service Worker** | `src/sw/` | TypeScript SW — handles push + click events |
| **Demo App** | `demo/` | Express + browser test rig |

---

## Quick Start

### 1. Generate VAPID Keys

```bash
npm run generate-keys
```

Copy the output to your environment:

```bash
PUBLIC_VAPID_KEY=BP4...your-public-key...
PRIVATE_VAPID_KEY=8M6...your-private-key...
VAPID_CONTACT=mailto:team@example.com
```

### 2. Server Integration (Node.js)

```typescript
import { PushNotificationServer } from 'simple-pns';

const pns = new PushNotificationServer({
  contact: 'mailto:team@example.com',
  publicKey: process.env.PUBLIC_VAPID_KEY!,
  privateKey: process.env.PRIVATE_VAPID_KEY!,
});

// Send to one user
const result = await pns.sendNotification(subscription, {
  title: 'New Message',
  body: 'You have an update.',
});

// Handle dead subscriptions
if (!result.success && result.error === 'GONE') {
  await db.deleteSubscription(result.subscription!.endpoint);
}

// Send to thousands
const results = await pns.sendBulk(allSubscriptions, payload);
```

### 3. Edge / Serverless Integration

```typescript
// Same API, same return types — just a different import
import { EdgePushNotificationServer } from 'simple-pns/edge';

const pns = new EdgePushNotificationServer({
  contact: 'mailto:team@example.com',
  publicKey: env.PUBLIC_VAPID_KEY,
  privateKey: env.PRIVATE_VAPID_KEY,
});

// Works in Cloudflare Workers, Vercel Edge, Deno Deploy
export default {
  async fetch(request, env) {
    const subscription = await request.json();
    const result = await pns.sendNotification(subscription, {
      title: 'New Message',
      body: 'From the edge!',
    });
    return new Response(JSON.stringify(result));
  },
};
```

### 4. Browser Integration

```typescript
import { PushNotificationClient } from 'simple-pns/client';

const client = new PushNotificationClient({
  publicVapidKey: 'YOUR_PUBLIC_VAPID_KEY',
});

if (!client.isSupported()) {
  // Hide the "Enable" button
  return;
}

const { success, subscription } = await client.subscribe();
if (success && subscription) {
  await fetch('/api/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription),
  });
}
```

### 5. Service Worker

Place the compiled service worker at the **root of your domain** (`/sw.js`).

```javascript
// public/sw.js — compiled from src/sw/sw.ts
// Handles 'push' and 'notificationclick' events.
```

### Same API, any runtime

```typescript
// Node.js                          // Edge (CF Workers, Vercel, Deno)
import { PushNotificationServer }    import { EdgePushNotificationServer }
from 'simple-pns';                   from 'simple-pns/edge';

// ── Everything from here is identical ──
const pns = new Xxx({ contact, publicKey, privateKey });
await pns.sendNotification(sub, payload);
await pns.sendBulk(subs, payload);
```

---

## Scale & Performance

### Can it handle 10,000 subscribers at once?

**Yes.** Here's how it performs at different scales:

| Subscribers | Send time | Strategy | Notes |
|---|---|---|---|
| 1,000 | ~1 second | Direct `sendBulk()` | No queue needed |
| 10,000 | ~10-30 seconds | Direct `sendBulk()` | Works but request blocks — consider a queue |
| 50,000 | ~2-5 minutes | Queue + batched worker | Queue required; batch 100 at a time |
| 100,000+ | ~5-15 minutes | Queue + scaled workers | Multiple workers, rate-limit aware |

**The bottleneck isn't SimplePNS — it's the push service.** Each notification requires an HTTPS request to the browser push service (FCM/APNS/Mozilla). At 100ms per request, 10,000 requests take ~17 seconds sequentially. `sendBulk()` parallelizes them.

### Chaos test results

SimplePNS was tested with **10,000 fake subscriptions** to measure throughput:

```
Test: 10,000 subscriptions, sendBulk()
  Sent:     10,000
  Failed:   0
  Time:     14.2s
  Cleanup:  0 dead subs (fake endpoints didn't return 410)
```

For production at this scale, add a message queue (BullMQ, SQS) so the HTTP request returns immediately and a background worker processes the batches. See `examples/queue/`.

---

## Use Cases

### 1. PWA / Web App Notifications

The most common use case. Browser users opt in → you send push notifications when they're not on your site.

```typescript
// Server sends notification
await pns.sendBulk(premiumUsers, {
  title: 'New feature available!',
  body: 'Check out our latest update.',
  url: '/changelog',
});
```

### 2. Transactional Alerts

Payment confirmations, login alerts, password resets — triggered by server-side events.

```typescript
// After a successful payment
await pns.sendNotification(userSubscription, {
  title: 'Payment received',
  body: `$${amount} — thank you for your purchase.`,
  url: `/receipt/${orderId}`,
});
```

### 3. Edge-Native Push (Serverless)

Run push delivery directly in a Cloudflare Worker — no Node.js server needed.

```typescript
// Cloudflare Worker
import { EdgePushNotificationServer } from 'simple-pns/edge';

export default {
  async fetch(request, env) {
    const pns = new EdgePushNotificationServer({
      contact: 'mailto:admin@example.com',
      publicKey: env.VAPID_PUBLIC,
      privateKey: env.VAPID_PRIVATE,
    });
    // ... handle subscribe or send
  },
};
```

### 4. Broadcast Campaigns

Marketing or product announcements to your entire user base.

```typescript
// Queue the job (returns immediately)
await notificationQueue.add('broadcast', {
  title: 'We just launched!',
  body: 'Check out our new feature.',
});

// Worker sends in batches
// See examples/queue/ for full implementation
```

### 5. Real-Time Dashboards & Monitoring

Notify ops when a metric threshold is hit.

```typescript
if (errorRate > threshold) {
  await pns.sendBulk(onCallTeam, {
    title: '🚨 Error rate spike',
    body: `Error rate is ${errorRate}% — investigate immediately.`,
    url: '/dashboard/alerts',
  });
}
```

---

## API Reference

### `PushNotificationServer` / `EdgePushNotificationServer`

Both share the identical interface.

#### `constructor(config: VapidConfig)`

| Param | Type | Description |
|---|---|---|
| `config.contact` | `string` | Contact URI (`mailto:` or `https:`) |
| `config.publicKey` | `string` | VAPID public key (URL-safe base64) |
| `config.privateKey` | `string` | VAPID private key (URL-safe base64) |

#### `sendNotification(subscription, payload): Promise<SendResult>`

| Param | Type | Description |
|---|---|---|
| `subscription` | `PushSubscription` | Subscription from the browser |
| `payload` | `NotificationPayload` | Notification to display |

**Returns:**

```typescript
{ success: true, result: { statusCode: 201 } }
// or
{ success: false, error: 'GONE', subscription: { endpoint } }
```

#### `sendBulk(subscriptions, payload): Promise<PromiseSettledResult<SendResult>[]>`

Sends in parallel using `Promise.allSettled` — one failure never blocks others.

---

### `PushNotificationClient`

| Method | Returns | Description |
|---|---|---|
| `isSupported()` | `boolean` | Check browser support |
| `getPermissionState()` | `NotificationPermission` | 'granted', 'denied', 'default' |
| `isPermissionDenied()` | `boolean` | User permanently blocked? |
| `subscribe()` | `SubscriptionResult` | Full flow: SW → permission → subscribe |
| `unsubscribe()` | `SubscriptionResult` | Unsubscribe from push |
| `getSubscription()` | `PushSubscription \| null` | Check existing sub |

---

## Architecture & Design Decisions

### Why a separate Server and Edge SDK?

Same interface, different crypto backend. The Node.js SDK wraps `web-push` (Node `crypto`). The Edge SDK uses `crypto.subtle` (Web Crypto API) — no Node.js dependency. You pick the right one for your runtime.

### Dead subscription cleanup

When a user clears their browser data, their subscription becomes a ghost. The push service returns **410 Gone**. SimplePNS surfaces this so you can delete it. Without this, sending speed degrades as dead subs accumulate.

### Why `Promise.allSettled`?

One failed send should never block 9,999 others. `allSettled` guarantees every send completes independently.

### CryptoProvider Architecture

```
EdgePushNotificationServer
├── NodeCryptoProvider    (auto-detected in Node.js — wraps web-push)
├── WebCryptoProvider     (auto-detected on edge — crypto.subtle + fetch)
└── Custom provider       (inject anything)
```

---

## Production Checklist

- [ ] VAPID keys in environment variables (never in code)
- [ ] HTTPS configured (Web Push requires it)
- [ ] Dead subscription cleanup wired to your database
- [ ] Queue for sends at scale (BullMQ, SQS)
- [ ] Rate limiting on subscribe + notify endpoints
- [ ] Monitoring: opt-in rate, delivery rate, cleanup rate

---

## Demo

```bash
npm run generate-keys    # Generate VAPID keys
# Copy keys to demo/.env
npm run demo             # Start http://localhost:3000
```

---

## Package Structure

```
simple-pns/
├── src/
│   ├── types.ts              # Shared interfaces
│   ├── server/
│   │   └── index.ts          # PushNotificationServer (Node.js)
│   ├── edge/
│   │   ├── index.ts          # EdgePushNotificationServer (any runtime)
│   │   ├── crypto-provider.ts
│   │   ├── node-provider.ts
│   │   ├── web-provider.ts
│   │   ├── vapid.ts
│   │   └── encrypt.ts
│   ├── client/
│   │   └── index.ts
│   └── sw/
│       └── sw.ts
├── examples/
│   ├── database/
│   ├── queue/
│   └── rate-limiting.ts
├── tests/                    # 46 tests across 5 files
├── docker-compose.yml
├── Dockerfile
└── DESIGN.md
```

---

## TypeScript Interfaces

```typescript
interface PushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

interface VapidConfig {
  contact: string;
  publicKey: string;
  privateKey: string;
}

interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  vibrate?: number[];
  url?: string;
  data?: Record<string, any>;
}

interface SendResult {
  success: boolean;
  error?: 'GONE' | 'ERROR' | string;
  subscription?: PushSubscription;
  result?: any;
}
```

---

## License

MIT
