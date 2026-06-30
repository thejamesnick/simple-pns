/**
 * PNS Demo Server
 * ─────────────────────────────────────────────
 * Express application that demonstrates the PNS Server SDK.
 *
 * Endpoints:
 *   GET  /          — Serves the demo frontend (index.html)
 *   POST /api/subscribe    — Saves a push subscription
 *   POST /api/unsubscribe  — Removes a push subscription
 *   POST /api/notify       — Sends a test notification to all subscribers
 *
 * Run with:
 *   npm run demo
 *
 * @package PNS
 */

import * as dotenv from "dotenv";
import * as path from "path";
import express from "express";
import { PushNotificationServer } from "../src/server/index";
import type { PushSubscription, NotificationPayload } from "../src/types";

// ──────────────────────────────────────────────
//  Configuration
// ──────────────────────────────────────────────

dotenv.config({ path: path.resolve(__dirname, ".env") });

const PORT = parseInt(process.env.DEMO_PORT ?? "3000", 10);
const PUBLIC_VAPID_KEY = process.env.PUBLIC_VAPID_KEY ?? "";
const PRIVATE_VAPID_KEY = process.env.PRIVATE_VAPID_KEY ?? "";
const VAPID_CONTACT = process.env.VAPID_CONTACT ?? "mailto:demo@example.com";

if (!PUBLIC_VAPID_KEY || !PRIVATE_VAPID_KEY) {
  console.error("");
  console.error("  ❌ Missing VAPID keys.");
  console.error(
    "     Run `npm run generate-keys` and copy the output to demo/.env",
  );
  console.error("");
  process.exit(1);
}

// ──────────────────────────────────────────────
//  In-Memory Subscription Store
// ──────────────────────────────────────────────

/**
 * Simple in-memory store for demo purposes.
 * In production, replace this with a database.
 */
const subscriptions: Map<string, PushSubscription> = new Map();

// ──────────────────────────────────────────────
//  Server Setup
// ──────────────────────────────────────────────

const app = express();
const pns = new PushNotificationServer({
  contact: VAPID_CONTACT,
  publicKey: PUBLIC_VAPID_KEY,
  privateKey: PRIVATE_VAPID_KEY,
});

app.use(express.json());

// Serve the demo frontend
app.use(express.static(path.resolve(__dirname, "public")));

// ─────────────────────────────────────────────
//  Routes
// ─────────────────────────────────────────────

/**
 * GET /api/config
 * Exposes the public VAPID key to the client so it can subscribe.
 */
app.get("/api/config", (_req, res) => {
  res.json({ publicVapidKey: PUBLIC_VAPID_KEY });
});

/**
 * POST /api/subscribe
 * Saves a push subscription from the browser.
 */
app.post("/api/subscribe", (req, res) => {
  const sub = req.body as PushSubscription;

  // Validate required fields
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    res.status(400).json({
      success: false,
      error:
        "Invalid subscription object. " +
        "Expected { endpoint, keys: { p256dh, auth } }.",
    });
    return;
  }

  // Use the endpoint as a unique key to avoid duplicates
  const id = sub.endpoint;
  subscriptions.set(id, sub);

  console.log(`  📋 Subscriber registered  →  ${subscriptions.size} total`);

  res.json({ success: true, total: subscriptions.size });
});

/**
 * POST /api/unsubscribe
 * Removes a push subscription.
 */
app.post("/api/unsubscribe", (req, res) => {
  const { endpoint } = req.body ?? {};

  if (!endpoint) {
    res.status(400).json({
      success: false,
      error: 'Missing "endpoint" in request body.',
    });
    return;
  }

  const removed = subscriptions.delete(endpoint);
  console.log(
    `  🗑️  Subscriber removed${removed ? "" : " (not found)"}  →  ${subscriptions.size} total`,
  );

  res.json({ success: true, removed });
});

/**
 * POST /api/notify
 * Sends a test notification to all registered subscribers.
 * Cleans up dead subscriptions (410 Gone / 404 Not Found).
 */
app.post("/api/notify", async (req, res) => {
  const { title, body } = req.body ?? {};

  const payload: NotificationPayload = {
    title: title ?? "Hello from PNS!",
    body: body ?? "Your push notification system is working.",
    url: "/",
    vibrate: [200, 100, 200],
  };

  const allSubs = Array.from(subscriptions.values());

  if (allSubs.length === 0) {
    res.json({
      success: true,
      sent: 0,
      failed: 0,
      cleaned: 0,
      message: "No subscribers to notify.",
    });
    return;
  }

  console.log(`  📨 Sending to ${allSubs.length} subscriber(s)...`);

  const results = await pns.sendBulk(allSubs, payload);

  // Clean up dead subscriptions
  let cleaned = 0;
  for (const result of results) {
    if (result.status === "fulfilled" && result.value.success === false) {
      const sub = result.value.subscription;
      if (sub && result.value.error === "GONE") {
        subscriptions.delete(sub.endpoint);
        cleaned++;
      }
    }
  }

  const sent = results.filter(
    (r) => r.status === "fulfilled" && r.value.success === true,
  ).length;
  const failed = results.length - sent;

  console.log(
    `  ✅ ${sent} sent  |  ❌ ${failed} failed  |  🧹 ${cleaned} cleaned`,
  );

  res.json({
    success: true,
    sent,
    failed,
    cleaned,
    total: subscriptions.size,
  });
});

// Catch uncaught errors so the server doesn't silently die.
process.on("uncaughtException", (err) => {
  console.error("\n  ❌ UNCAUGHT EXCEPTION:", err);
  console.error(err.stack);
});

process.on("unhandledRejection", (reason) => {
  console.error("\n  ❌ UNHANDLED REJECTION:", reason);
});

// ──────────────────────────────────────────────
//  Start
// ──────────────────────────────────────────────

const server = app.listen(PORT, () => {
  console.log("");
  console.log("  ┌────────────────────────────────────────────┐");
  console.log("  │  🔔  PNS Demo Server                       │");
  console.log("  │                                            │");
  console.log(
    `  │  Open → http://localhost:${PORT.toString().padEnd(5)}               │`,
  );
  console.log("  │  Subscribers: 0                            │");
  console.log("  └────────────────────────────────────────────┘");
  console.log("");
});

// Graceful shutdown
process.on("SIGTERM", () => server.close(() => process.exit(0)));
process.on("SIGINT", () => server.close(() => process.exit(0)));
