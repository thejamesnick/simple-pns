# Database Adapter — PNS + SQLite

## Install

```bash
npm install better-sqlite3
npm install -D @types/better-sqlite3
```

## Quick Start

```typescript
import { SqliteStore } from './examples/database/SqliteStore';

const store = new SqliteStore('./subscriptions.db');

// Save a subscription from the browser
await store.save({
  endpoint: 'https://...',
  keys: { p256dh: '...', auth: '...' },
});

// Broadcast with cleanup
const all = await store.findAll();
const results = await pns.sendBulk(all, payload);
```

## How It Works

- Table is auto-created on first use
- `INSERT OR REPLACE` — duplicate endpoints are updated
- Dead subscriptions (410 Gone) get deleted automatically in your broadcast loop
- WAL mode enabled for concurrent reads

## Production Tips

- For Postgres, implement `SubscriptionStore` using `pg` or `drizzle-orm`
- Add indexes on `endpoint` (already primary key)
- Archive dead subscriptions instead of hard-deleting if you want analytics
