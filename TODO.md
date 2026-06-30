# PNS — Project Roadmap

## Legend
- `[x]` Done
- `[ ]` Not started yet
- `[~]` Partial / needs review

---

## Phase 1: Core SDK (`src/`)

### Types & Interfaces
- [x] `src/types.ts` — Shared TypeScript interfaces (`PushSubscription`, `VapidConfig`, `NotificationPayload`, `SendResult`)

### Server SDK (Node.js)
- [x] `src/server/index.ts` — `PushNotificationServer` class
  - [x] Constructor with VAPID config injection
  - [x] `sendNotification()` — single send with 410/404 handling
  - [x] `sendBulk()` — parallel sends with `Promise.allSettled`

### Client SDK (Browser)
- [x] `src/client/index.ts` — `PushNotificationClient` class
  - [x] `isSupported()` — feature detection
  - [x] `getPermissionState()` / `isPermissionDenied()` — permission queries
  - [x] `subscribe()` — full flow (SW registration → permission → PushManager)
  - [x] `unsubscribe()` — clean unsubscribe
  - [x] `getSubscription()` — check existing subscription

### Service Worker
- [x] `src/sw/sw.ts` — TypeScript source
  - [x] `push` event — parse payload, display notification
  - [x] `notificationclick` event — focus window or open new tab

---

## Phase 2: Build & Package Config

- [x] `package.json` — dependencies, scripts, entry points
- [x] `tsconfig.json` — base TypeScript config (strict, ES2022)
- [x] `tsconfig.server.json` — CommonJS build for Node
- [x] `tsconfig.client.json` — ES2022 build for browser + WebWorker
- [x] `bin/generate-keys.ts` — VAPID key generator

---

## Phase 3: Demo App (`demo/`)

- [x] `demo/server.ts` — Express server
  - [x] `GET /api/config` — exposes public VAPID key
  - [x] `POST /api/subscribe` — saves subscription
  - [x] `POST /api/unsubscribe` — removes subscription
  - [x] `POST /api/notify` — sends to all, cleans dead subs
  - [x] `uncaughtException` / `unhandledRejection` handlers
  - [x] Graceful shutdown on `SIGTERM` / `SIGINT`
- [x] `demo/public/index.html` — Frontend UI (dark, native-style, live log)
- [x] `demo/public/sw.js` — Compiled service worker for demo
- [x] `demo/.env` — Environment template

---

## Phase 4: Documentation

- [x] `README.md` — Full documentation
  - [x] Quick start (server + browser)
  - [x] API reference (Server SDK, Client SDK, Payload)
  - [x] Architecture explanation
  - [x] Production checklist
  - [x] TypeScript interface definitions
- [x] `CHANGELOG.md` — v1.0.0 release notes + planned items
- [x] `BACKLOG.md` — Prioritised roadmap (v1.1, v1.2, v2.0, icebox)
- [x] `TODO.md` — This file (full project breakdown)
- [x] `implementation_plan.md` — Original build plan
- [x] `PNS.txt` — Architecture thinking doc
- [x] `What to build.txt` — Original spec

---

## Phase 5: Project Hygiene ✅

- [x] `.gitignore` — Ignore `node_modules/`, `dist/`, `.env`
- [x] `LICENSE` — MIT license file
- [x] `SECURITY.md` — Vulnerability reporting policy
- [x] `CONTRIBUTING.md` — Contribution guide
- [x] `package.json` — GitHub metadata (repository, bugs, homepage, keywords, author)
- [x] `.github/ISSUE_TEMPLATE/bug_report.md` — Bug report template
- [x] `.github/ISSUE_TEMPLATE/feature_request.md` — Feature request template
- [x] `.github/workflows/ci.yml` — GitHub Actions CI (builds on Node 18, 20, 22)

---

## Phase 6: Testing ✅

- [x] Server SDK unit tests — 10 tests
  - [x] `sendNotification` — success path
  - [x] `sendNotification` — 410/404 handling
  - [x] `sendBulk` — mixed success/failure results
- [x] Client SDK tests — 14 tests (browser API mocking)
  - [x] `isSupported`, `getPermissionState`, `isPermissionDenied`
  - [x] `subscribe` — success, denied, unsupported, custom path
  - [x] `unsubscribe` — success, no subscription
  - [x] `getSubscription` — found, not found
- [x] End-to-end demo test — 9 tests (all API endpoints)
- [x] Vitest configured (coverage thresholds at 80%)
- [x] `npm test`, `npm run test:watch`, `npm run test:coverage` scripts

---

## Phase 7: Production Hardening ✅

- [x] `.env.example` — Clean env template (no real values)
- [x] Database adapter — `SubscriptionStore` interface + `SqliteStore` implementation + usage example
- [x] Message queue pattern — BullMQ producer + worker example with batch processing
- [x] Rate limiting — `express-rate-limit` middleware example (subscribe: 10/min, notify: 5/min)
- [x] Docker Compose — demo server + Redis + PostgreSQL + background worker

---

## Phase 8: Publishing

- [ ] npm publish dry-run
- [ ] Publish to npm (`npm publish`)
- [ ] GitHub release with tags

---

## Summary

| Phase | Status |
|---|---|
| 1. Core SDK | ✅ Complete (Node.js + Edge) |
| 2. Build & Config | ✅ Complete |
| 3. Demo App | ✅ Complete |
| 4. Documentation | ✅ Complete |
| 5. Project Hygiene | ✅ Complete |
| 6. Testing | ✅ Complete (46 tests) |
| 7. Production Hardening | ✅ Complete |
| 8. Publishing | 📖 Guide written (PUBLISH.md) |
