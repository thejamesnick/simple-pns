# Changelog

All notable changes to SimplePNS will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] — 2026-06-30

### Added

**Server SDK** (`src/server/`)
- `PushNotificationServer` class with VAPID config injection
- `sendNotification()` — single push with 410 Gone / 404 Not Found handling
- `sendBulk()` — parallel sends using `Promise.allSettled` so one failure never blocks others

**Client SDK** (`src/client/`)
- `PushNotificationClient` class for browser-side push subscription
- `isSupported()` — feature detection for push API availability
- `getPermissionState()` / `isPermissionDenied()` — permission query helpers
- `subscribe()` — full flow: service worker registration → permission prompt → PushManager subscription
- `unsubscribe()` — clean unsubscribe from push
- `getSubscription()` — check for an existing subscription

**Service Worker** (`src/sw/`)
- `push` event handler — parses JSON payload and displays notification
- `notificationclick` event handler — focuses existing window or opens new tab

**Demo App** (`demo/`)
- Express server with `/api/config`, `/api/subscribe`, `/api/unsubscribe`, `/api/notify` endpoints
- In-memory subscription store with automatic dead-subscription cleanup
- Dark-themed browser UI with live status, action buttons, and event log

**Infrastructure**
- Dual-build TypeScript config (CommonJS for Node, ES2022 for browser)
- VAPID key generation script (`bin/generate-keys.ts`)
- CI pipeline (GitHub Actions) — builds on Node 18, 20, 22

**Documentation**
- README with quick start, full API reference, architecture guide, and production checklist
- CONTRIBUTING.md with setup guide, PR checklist, and design principles
- SECURITY.md with vulnerability reporting policy
- Issue templates (bug report + feature request)
- Project roadmap (TODO.md)

---

## [Unreleased]

### v1.0.0 shipped

- [x] Unit tests: Server SDK (10), Client SDK (14), E2E (9), Edge (13) — 46 total ✅
- [x] `.env.example` — clean template without real values
- [x] `PUBLISH.md` — GitHub + npm publishing guide
- [x] Database adapter — `SubscriptionStore` interface + SQLite implementation
- [x] Message queue pattern — BullMQ producer/worker examples
- [x] Rate limiting — express-rate-limit middleware example
- [x] Docker Compose — demo + Redis + Postgres + worker
- [x] Dockerfile — production container image
- [x] **Serverless support** — `EdgePushNotificationServer` with Web Crypto VAPID + encryption
  - `WebCryptoProvider` — Web Push protocol using `crypto.subtle` (no Node.js deps)
  - `NodeCryptoProvider` — wraps existing `web-push` for Node.js
  - `CryptoProvider` interface — swapable backend for any runtime
  - Auto-detection — picks the right provider for the runtime
