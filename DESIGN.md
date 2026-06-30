# SimplePNS · Design Document (RFC)

> **Status:** Living Document — v1.0.0  
> **Author:** thejamesnick  
> **Last Updated:** 2026-06-30

---

## 1. Context & Problem Statement

### Business Problem

Applications need to send push notifications to their users' browsers and devices. The Web Push API exists, but it's low-level — it requires developers to manage VAPID cryptography, handle dead subscriptions, implement batching, and write service workers from scratch. Most teams either glue together fragile scripts or avoid push notifications entirely.

### Technical Problem

The naive implementation — a single API endpoint that loops through subscriptions and sends pushes synchronously — works for 10 users but breaks catastrophically at 1,000+. The failure modes are:

- **Timeout:** HTTP request to the push service hangs, blocking the response
- **Cascading failure:** One slow push holds up all others
- **Subscription rot:** Dead subscriptions accumulate, degrading send speed over time
- **No abstraction:** Every team re-implements the same error handling and retry logic

### Goal

Build a drop-in SDK that handles the hard parts so application developers can send push notifications in 5 lines of code, without understanding VAPID, message queues, or service worker internals.

> *"Don't make other devs write queue logic. Give them a clean class."* — PNS.txt

---

## 2. Goals & Non-Goals

### Goals

| Goal | Priority |
|---|---|
| Provide a type-safe Node.js SDK for sending pushes | P0 |
| Provide a type-safe browser SDK for subscribing | P0 |
| Handle dead subscription cleanup (410/404) automatically | P0 |
| Support batch sending without blocking other sends | P0 |
| Document production scaling patterns (queue, DB, rate limiting) | P1 |
| Ship a working demo that validates the full flow | P1 |

### Non-Goals (explicitly out of scope for v1)

| Non-Goal | Rationale |
|---|---|
| Built-in message queue | Creates infrastructure dependency; devs should choose their own queue |
| Built-in database adapter | Storage is app-specific; we provide the interface, not the implementation |
| Real-time delivery analytics | Out of scope for a library — belongs in a monitoring layer |
| iOS/Android native push (APNS/FCM directly) | Web Push only — native push requires separate SDKs per platform |
| Push notification scheduling | Adds complexity; can be built on top by consumers |
| End-to-end encryption of payload | VAPID encrypts the channel; payload-level encryption is app-specific |

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Application Layer                          │
│  ┌─────────────────────┐         ┌─────────────────────────────┐  │
│  │  Your Node.js API   │         │  Browser / PWA Frontend     │  │
│  │  (Express, Fastify) │         │  (React, Vue, Vanilla)      │  │
│  └──────────┬──────────┘         └──────────────┬──────────────┘  │
│             │                                   │                  │
│             ▼                                   ▼                  │
│  ┌─────────────────────┐         ┌─────────────────────────────┐  │
│  │  PNS Server SDK     │         │  PNS Client SDK             │  │
│  │  - sendNotification  │         │  - subscribe()              │  │
│  │  - sendBulk()        │         │  - unsubscribe()            │  │
│  │  - 410/404 cleanup   │         │  - isSupported()            │  │
│  └──────────┬──────────┘         └──────────────┬──────────────┘  │
│             │                                   │                  │
│             │        ┌──────────────────┐       │                  │
│             │        │  Service Worker  │       │                  │
│             │        │  (sw.ts)         │       │                  │
│             │        │  - push event     │       │                  │
│             │        │  - click event    │       │                  │
│             │        └──────────────────┘       │                  │
│             ▼                                   │                  │
│  ┌─────────────────────┐                        │                  │
│  │  Your Database      │◄──── Subscription ─────┘                  │
│  │  (SQLite, Postgres) │      JSON sent via                         │
│  └─────────────────────┘      POST /api/subscribe                  │
│                                                                     │
│  ┌─────────────────────┐                                            │
│  │  [Optional] Queue   │  ← PNS sendBulk() integrates here         │
│  │  (BullMQ, SQS)      │    as the worker building block           │
│  └─────────────────────┘                                            │
└─────────────────────────────────────────────────────────────────────┘
                           │
                           ▼
                  ┌──────────────────┐
                  │  Browser Push    │
                  │  Service         │
                  │  (FCM/APNS/      │
                  │   Mozilla)       │
                  └──────────────────┘
                           │
                           ▼
                  ┌──────────────────┐
                  │  User's Browser  │
                  │  Service Worker  │
                  └──────────────────┘
```

### Data Flow

```
1. SUBSCRIBE:
   Browser → PNS Client → navigator.serviceWorker.register()
                        → Notification.requestPermission()
                        → PushManager.subscribe()
                        → sends PushSubscription JSON to Your API
                        → Your API saves to Database

2. NOTIFY:
   Your Server → PNS Server.sendBulk(subscriptions, payload)
               → web-push encrypts + sends via VAPID
               → Browser Push Service delivers to browser
               → Service Worker 'push' event fires
               → showNotification() displays to user

3. CLEANUP:
   PNS Server receives 410 Gone / 404 Not Found
   → returns { success: false, error: 'GONE', subscription }
   → Your code deletes subscription from Database
```

---

## 4. Component Design

### 4.1 Server SDK (`src/server/`)

**Responsibility:** Encrypt and deliver push notifications to browser push services.

**Public API:**

```typescript
class PushNotificationServer {
  constructor(config: VapidConfig);
  sendNotification(subscription, payload): Promise<SendResult>;
  sendBulk(subscriptions, payload): Promise<PromiseSettledResult<SendResult>[]>;
}
```

**Key decisions:**

- Constructor injection for VAPID config instead of environment variables. This allows the consumer to pass keys from any source (env vars, secret manager, config file) and instantiate multiple servers with different keys.
- `sendNotification` never throws. It returns `{ success, error, subscription }` so the consumer can always handle the result, even for unexpected errors.
- `sendBulk` uses `Promise.allSettled` (not `all`). This guarantees that a single dead subscription never prevents other sends from completing.

### 4.2 Client SDK (`src/client/`)

**Responsibility:** Abstract the browser's push subscription flow behind a clean, error-safe API.

**Public API:**

```typescript
class PushNotificationClient {
  constructor(config: { publicVapidKey, serviceWorkerPath? });
  isSupported(): boolean;
  getPermissionState(): NotificationPermission;
  isPermissionDenied(): boolean;
  subscribe(): Promise<SubscriptionResult>;
  unsubscribe(): Promise<SubscriptionResult>;
  getSubscription(): Promise<PushSubscription | null>;
}
```

**Key decisions:**

- Feature detection (`isSupported`) is separated from the subscription flow so developers can conditionally render UI (e.g., hide the "Enable Notifications" button on unsupported browsers).
- `subscribe()` returns `SubscriptionResult` instead of throwing. This is intentional — permission denial is an expected user action, not an error, and should be handled gracefully.
- The service worker path is configurable because some bundlers (Vite, Webpack) require specific output paths.

### 4.3 Service Worker (`src/sw/`)

**Responsibility:** Handle incoming push events and user interaction with notifications.

**Events handled:**

| Event | Action |
|---|---|
| `push` | Parse JSON payload → show notification with title, body, icon, badge, vibration |
| `notificationclick` | Close notification → focus existing window or open new tab to the target URL |

**Key decisions:**

- The service worker is compiled from TypeScript (not written in raw JS) so it benefits from type checking. The `tsconfig.client.json` includes `lib: ["WebWorker"]` to provide proper ServiceWorker types.
- The service worker is intentionally minimal. Complex logic (fetching data, caching) belongs in the application's own service worker, which can be composed with PNS's.

### 4.4 Demo App (`demo/`)

**Responsibility:** Provide a working end-to-end test rig that validates the entire flow.

**Endpoints:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/config` | Exposes public VAPID key to client |
| POST | `/api/subscribe` | Saves a subscription (validates required fields) |
| POST | `/api/unsubscribe` | Removes a subscription |
| POST | `/api/notify` | Broadcasts to all subscribers, cleans dead ones |

---

## 5. Key Decisions & Trade-offs

### 5.1 VAPID for server identification

**Chosen:** VAPID (Voluntary Application Server Identification) via the `web-push` npm package.

**Why:** VAPID is required by Chrome, Firefox, and Safari for web push. Without it, push requests are rejected. It also allows the push service to contact you if there's abuse.

**Trade-off:** We depend on a third-party npm package (`web-push`). If the package becomes unmaintained, we'd need to fork it or implement the VAPID/HTTP encryption logic ourselves.

**What we gave up:** Implementing VAPID from scratch would give us full control but at significant cost — the Web Push encryption scheme uses elliptic curve Diffie-Hellman (ECDH) and AES-GCM, which is complex and easy to get wrong. The library is battle-tested (3.6k+ stars, maintained since 2016).

### 5.2 Separate Server and Client SDKs

**Chosen:** Two independent entry points — one for Node.js (CommonJS), one for the browser (ESM).

**Why:** The server and client run in fundamentally different environments with different module systems, APIs, and concerns. The server handles HTTP encryption and bulk delivery; the browser handles permission prompts and service worker registration. Bundling them together would force consumers to install irrelevant dependencies.

**Trade-off:** Developers install two separate packages conceptually, even though they're in the same npm package. The `browser` field in `package.json` handles the routing automatically for bundlers.

**What we gave up:** A single `import everything from 'pns'` experience. Instead, consumers do:
```typescript
// Server
import { PushNotificationServer } from 'simple-pns';
// Browser
import { PushNotificationClient } from 'simple-pns/client';
```

### 5.3 `Promise.allSettled` for bulk sending

**Chosen:** Use `Promise.allSettled` instead of `Promise.all`.

**Why:** When sending to 10,000 subscribers, some will inevitably fail (dead subscriptions, network errors). `Promise.all` would reject on the first failure, discarding all other results. `allSettled` guarantees we get results for every send and can clean up failed ones individually.

**Trade-off:** Slightly more verbose result handling (consumers must check `.status === 'fulfilled'` before accessing `.value`).

**What we gave up:** The simplicity of a single `try/catch`. But at this scale, granular error handling is a feature, not a bug.

### 5.4 No built-in queue

**Chosen:** Provide `sendBulk` as the building block, but don't ship a queue implementation.

**Why:** Every team has different infrastructure. Some use BullMQ with Redis, some use SQS, some use RabbitMQ, some use Google Pub/Sub. Forcing a queue dependency would make PNS unusable for teams that don't run Redis.

**Trade-off:** Teams at very small scale (< 1,000 subscribers) don't need a queue, and `sendBulk` serves them well. Teams at larger scale must add a queue themselves — but we document exactly how to do it (see `examples/queue/`).

**What we gave up:** The "batteries included" experience. The PNS philosophy is: *provide the right building block, document the production pattern, let the team own the infrastructure.*

### 5.5 In-memory store for demo, interface for production

**Chosen:** The demo server uses an in-memory `Map<string, PushSubscription>`. The production examples provide a `SubscriptionStore` interface with a SQLite implementation.

**Why:** The demo is for testing the push flow, not for persistence. Using SQLite (or any database) in the demo would add setup friction. The interface pattern lets each team plug in their own database without changing PNS.

**Trade-off:** Teams new to PNS might not realize they need to swap out the in-memory store for production. We mitigate this with the production checklist in the README and the `examples/database/` docs.

### 5.6 Dual TypeScript build (CJS + ESM)

**Chosen:** Two tsconfigs — `tsconfig.server.json` (CommonJS) and `tsconfig.client.json` (ES2022).

**Why:** Node.js still predominantly uses CommonJS (especially with `require()`), while browsers and bundlers expect ES modules. Shipping both ensures compatibility with any consumer setup.

**Trade-off:** More build complexity. Two configs to maintain, two output directories. The `package.json` uses `"main"` for CJS and `"browser"` for ESM, which most bundlers respect.

### 5.7 TypeScript strict mode

**Chosen:** `"strict": true` in all tsconfigs.

**Why:** Push notifications involve cryptographic keys, optional payload fields, and network error handling — all domains where type errors cause silent production failures. Strict TypeScript catches null references, missing fields, and type mismatches at compile time.

**Trade-off:** More verbose code (explicit null checks, type assertions where necessary). The cost is paid during development; the benefit is realized in production.

---

## 6. Scaling Analysis

### 1,000 Subscribers

| Concern | Assessment |
|---|---|
| Send time | ~1 second (1,000 pushes × 1ms each) |
| Queue needed? | No — synchronous is fine |
| Dead subs | ~5-10% annual churn — cleanup is trivial |
| Memory | ~500KB for subscriptions in memory |

**Verdict:** Direct `sendBulk` is sufficient. No queue needed.

### 10,000 Subscribers

| Concern | Assessment |
|---|---|
| Send time | ~10-30 seconds (network latency dominates) |
| Queue needed? | Borderline — depends on latency tolerance |
| Dead subs | ~10-15% churn — cleanup loop adds ~5% overhead |
| Memory | ~5MB for subscriptions |

**Verdict:** `sendBulk` works but you'll notice the delay. Consider adding a queue if the API endpoint needs to respond quickly. **Rate limiting on subscribe becomes important** — without it, a bot can fill your database with garbage subscriptions.

### 100,000 Subscribers

| Concern | Assessment |
|---|---|
| Send time | ~2-5 minutes (batch of 100 parallel sends) |
| Queue needed? | **Yes** — API will timeout without one |
| Strategy | Queue → worker processes 100/batch → `sendBulk` per batch |
| Dead subs | 15-20% churn — cleanup must be batched |
| Database | Need indexed queries, connection pooling |
| Monitoring | Delivery rate, opt-in rate, cleanup rate become essential |

**Verdict:** Must implement the queued pattern. The worker should batch sends (100 at a time), clean dead subs after each batch, and report metrics.

### Breaking points

| Threshold | What breaks | Mitigation |
|---|---|---|
| ~50k | Direct `sendBulk` blocks the event loop too long | Add queue |
| ~100k | In-memory store exceeds reasonable memory | Move to database |
| ~500k | Single worker can't keep up | Scale workers horizontally |
| ~1M | Push service rate limits (FCM/APNS) | Distributed rate limiting, sharding |

---

## 7. Alternatives Considered

### Alternative 1: Firebase Cloud Messaging (FCM) direct integration

**What:** Skip the Web Push API entirely and use FCM's native protocol.

**Why we didn't:** FCM direct integration requires a Google account, a Firebase project, and ties you to Google's ecosystem. The Web Push API is vendor-neutral — it works with Google FCM, Apple APNS, and Mozilla's push service transparently. PNS works everywhere.

### Alternative 2: `web-push` as optional peer dependency

**What:** Make `web-push` a peer dependency so consumers can choose their own version.

**Why we didn't:** The `web-push` API surface is small and stable. Making it a peer dependency adds installation friction with minimal benefit. We pin it as a regular dependency and bump it with SemVer.

### Alternative 3: Observable-based streaming for `sendBulk`

**What:** Return an Observable (RxJS) that emits results as each send completes, instead of waiting for all.

**Why we didn't:** This would add RxJS as a dependency and force consumers to learn reactive programming. `Promise.allSettled` is universally understood and sufficient for the batch sizes we target. For truly real-time streaming, consumers can call `sendNotification` individually from their own loop.

### Alternative 4: Execute `sendBulk` on a child process / thread

**What:** Offload bulk sending to a worker thread to avoid blocking the main thread.

**Why we didn't:** Node.js single-threaded performance is adequate for 1,000-10,000 sends with async I/O. For larger scales, the queue pattern (separate process) is the standard approach and doesn't require worker threads.

### Alternative 5: Single Universal SDK (no server/client split)

**What:** One file that works in both Node.js and the browser by runtime-detecting the environment.

**Why we didn't:** Runtime detection is fragile and prevents tree-shaking. A browser importing the server SDK would include `web-push` unnecessarily. Separate builds are the standard pattern in the ecosystem (React, Vue, Express).

---

## 8. Operational Considerations

### Monitoring (recommended metrics)

| Metric | What it tells you |
|---|---|
| Opt-in rate | % of users who click "Allow" — if < 30%, your prompt UX needs work |
| Delivery rate | % of sends that return 200 — dropping rate indicates push service issues |
| Cleanup rate | Number of 410 Gone per send — rising rate suggests stale data |
| Send latency | Time to send a batch — spikes indicate network issues |

### Deployment checklist (see also README production checklist)

- [ ] VAPID keys in environment variables (never in code)
- [ ] HTTPS configured (Web Push requires it)
- [ ] Dead subscription cleanup wired into your database layer
- [ ] Rate limiting on subscribe + notify endpoints
- [ ] Database connection pooling configured
- [ ] Queue infrastructure (if > 10k subscribers)
- [ ] Monitoring dashboards for delivery metrics

### Failure modes

| Failure | Impact | Recovery |
|---|---|---|
| Push service down | Sends fail with 5xx | Retry with exponential backoff |
| VAPID keys expire | All sends rejected | Rotate keys, redeploy |
| Database full | New subscribes fail | Monitor disk, archive old data |
| Service worker not at root | Subscribe succeeds but pushes don't arrive | Ensure SW is served from root (`/sw.js`) |

---

## 9. Future Work

| Feature | Priority | Notes |
|---|---|---|
| Payload encryption (beyond VAPID) | P2 | End-to-end encrypt payload so push services can't read it |
| Silent pushes (no payload, just wake-up) | P2 | Useful for triggering data fetch from service worker |
| Rich notification actions | P2 | Buttons in notifications for quick actions |
| Notification grouping | P3 | Tag-based deduplication |
| Delivery receipts | P3 | Webhook-style confirmation when notification is shown |
| React/Vue integration | P3 | Composition wrappers for framework users |
| Edge runtime support (CF Workers, Deno) | P4 | Non-Node.js runtimes have different crypto APIs |

---

## 10. Serverless Considerations

PNS v1.0 ships with full serverless support via the `EdgePushNotificationServer`
class and its pluggable `CryptoProvider` architecture:

```
EdgePushNotificationServer
├── NodeCryptoProvider    (default in Node.js — wraps `web-push`)
├── WebCryptoProvider     (auto-detected on edge — uses `crypto.subtle` + `fetch`)
└── Custom provider       (inject anything, e.g. for testing)
```

The `WebCryptoProvider` implements the entire Web Push protocol — VAPID JWT
signing and RFC 8188 payload encryption — using the Web Crypto API
(`crypto.subtle`). It has zero dependency on Node.js `crypto` or the
`web-push` package, meaning it works in Cloudflare Workers, Vercel Edge
Functions, and Deno Deploy.

Serverless/edge runtimes introduce constraints
that the current architecture does not fully address.

### Compatibility matrix

| Runtime | PNS Server SDK | Edge SDK (`pns/edge`) | Database | Queue | Notes |
|---|---|---|---|---|---|
| AWS Lambda (Node) | ✅ `PushNotificationServer` | ✅ `EdgePushNotificationServer` | ✅ SQLite ❌ DynamoDB | ✅ SQS | Both SDKs work; use `sendBulk` with queue for scale |
| Vercel Serverless | ✅ Works (60s timeout) | ✅ Auto-detects NodeCryptoProvider | ❌ SQLite (no fs) | ❌ | ~500 subs per invocation |
| Vercel Edge | ❌ `web-push` fails | ✅ **WebCryptoProvider** | ❌ KV needed | ❌ | First-class support via `pns/edge` |
| Cloudflare Workers | ❌ `web-push` fails | ✅ **WebCryptoProvider** | ❌ KV needed | ❌ Queues | First-class support via `pns/edge` |
| Deno Deploy | ❌ `web-push` fails | ✅ **WebCryptoProvider** | ❌ KV needed | ❌ | First-class support via `pns/edge` |

### What was built

| Item | Status | Files |
|---|---|---|
| Web Crypto VAPID signing | ✅ Done | `src/edge/vapid.ts` |
| Web Crypto payload encryption (RFC 8188) | ✅ Done | `src/edge/encrypt.ts` |
| `WebCryptoProvider` — full edge provider | ✅ Done | `src/edge/web-provider.ts` |
| `NodeCryptoProvider` — wraps `web-push` | ✅ Done | `src/edge/node-provider.ts` |
| `CryptoProvider` interface | ✅ Done | `src/edge/crypto-provider.ts` |
| `EdgePushNotificationServer` — drop-in replacement | ✅ Done | `src/edge/server.ts` |
| Auto-detection (Node vs edge) | ✅ Done | `src/edge/server.ts` |
| Tests (13, with mock fetch) | ✅ Done | `tests/edge/` |

### What remains

1. **Filesystem dependency** — The SQLite adapter won't run on edge runtimes.
   Teams should implement `SubscriptionStore` against Cloudflare KV, DynamoDB,
   or Neon (serverless Postgres).

2. **Batch with timeout** — `sendBulk` doesn't yet accept a `timeoutMs` for
   runtime execution limits. Useful for Vercel (60s) and Lambda (15min).

3. **Queue integration** — Serverless functions that send pushes directly
   (without a queue) risk hitting timeouts. The worker pattern from
   `examples/queue/` is recommended for any moderate scale.

### Recommended architecture (edge)

```
Browser subscribe ──▶ Edge API ──▶ Cloudflare KV / DynamoDB
  (pns/client)         (pns/edge)     │
                                      │
               ┌──────────────────────┘
               ▼
         EdgePushNotificationServer.sendBulk()
           │
           ▼
      Push Service (FCM/APNS/Mozilla)
```

> **Verdict:** PNS v1.0 ships with full serverless support.
> `import { EdgePushNotificationServer } from 'pns/edge'` works on
> Cloudflare Workers, Vercel Edge, Deno Deploy, and Node.js out of the box.
> Auto-detection picks the right crypto backend for each runtime.

---

## 11. Appendix: Trade-off Summary

| Decision | Chosen | Alternative | Why |
|---|---|---|---|
| Encryption | `web-push` library | Custom VAPID | Battle-tested, correct crypto |
| Module format | CJS (server) + ESM (browser) | Single format | Ecosystem compatibility |
| Error handling | Return `{ success, error }` | Throw exceptions | Graceful failure recovery |
| Bulk sending | `Promise.allSettled` | `Promise.all` | One failure never blocks others |
| Queue | Documented pattern | Built-in | Avoid infrastructure lock-in |
| Database | Interface + SQLite example | Built-in ORM | App-specific storage needs |
| Build | TypeScript strict | JavaScript | Type safety for crypto/network code |
| Contact field | `mailto:` or `https:` | Email only | Flexibility for different setups |

---

> *"If you can build the thing, and then articulate the trade-offs you made while building it, you aren't just a coder anymore. You're a software engineer."*
