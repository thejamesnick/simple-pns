# Backlog

> What's next for PNS. Prioritised by impact.

---

## v1.1.0 — Quality & Testing

- [ ] Unit tests for `PushNotificationServer`
  - [ ] `sendNotification()` success path
  - [ ] `sendNotification()` 410/404 handling
  - [ ] `sendBulk()` mixed results
- [ ] Unit tests for `PushNotificationClient` (browser mocking)
- [ ] End-to-end demo smoke test
- [ ] Add `"test"` script to `package.json`
- [ ] Minimum code coverage threshold in CI

## v1.2.0 — Production Patterns

- [ ] Database adapter examples
  - [ ] Postgres adapter (save / list / delete subscriptions)
  - [ ] SQLite adapter for single-server setups
- [ ] Message queue integration example
  - [ ] BullMQ worker that consumes from a queue and calls `sendBulk`
- [ ] Rate limiting middleware example (express-rate-limit)
- [ ] Add logging hooks (optional `logger` config)

## v1.3.0 — Developer Experience

- [ ] Docker Compose (`docker-compose.yml`) for demo with Redis + Postgres
- [ ] `.env.example` — clean template without real values
- [ ] Add `PUBLISH.md` — npm publishing guide
- [ ] GitHub release workflow (auto-tag + publish on version bump)

## v2.0.0 — Stretch

- [ ] Support for silent pushes (no payload, just wake-up)
- [ ] Rich notification actions (buttons in the notification)
- [ ] Notification grouping / tag-based deduplication
- [ ] Expiration / TTL on notifications
- [ ] Webhook-style delivery receipts
- [ ] Optional encryption of payload data (beyond VAPID)

---

## Icebox

- [ ] React hooks wrapper (`usePushNotifications`)
- [ ] Vue composable wrapper
- [ ] Edge runtime support (Cloudflare Workers, Deno)
- [ ] Analytics: opt-in rate, delivery rate, cleanup rate dashboard
