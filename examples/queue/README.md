# Queue Pattern — Scale PNS Beyond 10k Subscribers

When you send push notifications synchronously in an HTTP request handler,
your server blocks until every push finishes. At 10k+ subscribers, that
causes timeouts, memory spikes, and crashed servers.

**Solution:** Decouple the *trigger* from the *execution* using a message queue.

```
Admin clicks "Send"
       │
       ▼
┌──────────────┐     ┌──────────────────┐
│  API Route   │────▶│  Message Queue   │  ← Responds immediately (200ms)
└──────────────┘     │  (Redis/BullMQ)  │
                     └────────┬─────────┘
                              │
                    ┌─────────▼─────────┐
                    │  Background       │
                    │  Worker Process   │  ← Reads queue, sends pushes
                    │                   │     in batches of 100
                    └───────────────────┘
```

## BullMQ Example

### Install

```bash
npm install bullmq ioredis
```

### Producer (API route)

```typescript
// producer.ts
import { Queue } from 'bullmq';

const notificationQueue = new Queue('notifications', {
  connection: { host: 'localhost', port: 6379 },
});

export async function enqueueBroadcast(payload: {
  title: string;
  body: string;
  url?: string;
}) {
  const job = await notificationQueue.add('broadcast', payload, {
    // Don't retry dead subscriptions — we'll clean them in the worker
    attempts: 1,
  });

  console.log(`📦 Enqueued job ${job.id}`);
  return { queued: true, jobId: job.id };
}
```

### Worker (background process)

```typescript
// worker.ts
import { Worker } from 'bullmq';
import { PushNotificationServer } from 'simple-pns';
import { SqliteStore } from './SqliteStore';

const pns = new PushNotificationServer({ /* VAPID config */ });
const store = new SqliteStore('./subscriptions.db');

const worker = new Worker(
  'notifications',
  async (job) => {
    const { title, body, url } = job.data;

    // Fetch subscribers in batches of 100
    const all = await store.findAll();
    console.log(`📨 Processing job ${job.id}: ${all.length} subscribers`);

    for (let i = 0; i < all.length; i += 100) {
      const batch = all.slice(i, i + 100);
      const results = await pns.sendBulk(batch, { title, body, url });

      // Clean dead subs after each batch
      for (const result of results) {
        if (
          result.status === 'fulfilled' &&
          !result.value.success &&
          result.value.error === 'GONE'
        ) {
          await store.deleteByEndpoint(result.value.subscription!.endpoint);
        }
      }
    }
  },
  { connection: { host: 'localhost', port: 6379 } },
);

worker.on('completed', (job) => console.log(`✅ Job ${job.id} done`));
worker.on('failed', (job, err) => console.error(`❌ Job ${job?.id} failed:`, err));

console.log('👷 Worker listening for notification jobs...');
```

### Run it

```bash
# Terminal 1: Redis must be running
docker run -d -p 6379:6379 redis:7

# Terminal 2: Start the worker
npx ts-node worker.ts

# Terminal 3: Enqueue a notification
npx ts-node -e "
  import { enqueueBroadcast } from './producer';
  enqueueBroadcast({ title: 'Hello', body: 'Queue test' }).then(console.log);
"
```

## Without Redis/BullMQ

Lighter alternative: use `better-queue` or a simple in-memory array + setInterval.

```typescript
const queue: NotificationPayload[] = [];

// API route just pushes
app.post('/api/notify', (req, res) => {
  queue.push(req.body);
  res.json({ queued: true, size: queue.length });
});

// Background worker drains the queue
setInterval(async () => {
  const batch = queue.splice(0, 100);
  if (batch.length === 0) return;

  const subs = await store.findAll();
  await pns.sendBulk(subs, batch[0]);  // Process oldest
}, 1000);
```
