/**
 * Rate Limiting — Protect PNS Endpoints
 * ─────────────────────────────────────
 * Prevents abuse of subscribe/notify endpoints.
 * Uses express-rate-limit (battle-tested, zero-config).
 *
 * Install:
 *   npm install express-rate-limit
 *
 * Run:
 *   npx ts-node examples/rate-limiting.ts
 */

import express from 'express';
import rateLimit from 'express-rate-limit';

const app = express();
app.use(express.json());

// ── Rate Limiters ──────────────────────────

/**
 * Subscribe: max 10 requests per minute per IP.
 * Preents bots from filling your DB with garbage subscriptions.
 */
const subscribeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many subscribe attempts. Try again later.' },
});

/**
 * Notify: max 5 requests per minute per IP.
 * Prevents someone from spamming your users.
 */
const notifyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many notification requests. Slow down.' },
});

// ── Apply to routes ────────────────────────

app.post('/api/subscribe', subscribeLimiter, (req, res) => {
  // Your subscribe logic
  res.json({ success: true });
});

app.post('/api/notify', notifyLimiter, async (req, res) => {
  // Your notify logic
  res.json({ success: true, sent: 0 });
});

// ── Start ──────────────────────────────────

app.listen(3002, () => {
  console.log('  Rate-limited server on http://localhost:3002');
  console.log('  Subscribe: 10 req/min | Notify: 5 req/min');
});
