/**
 * CryptoProvider — Abstraction for push crypto operations
 * ───────────────────────────────────────────────────────
 * Allows PNS to work in any runtime by swapping the crypto backend:
 *
 *   - Node.js  → NodeCryptoProvider (wraps `web-push`)
 *   - Edge      → WebCryptoProvider (uses Web Crypto API)
 *   - Custom    → Implement this interface
 *
 * The PushNotificationServer constructor accepts an optional provider.
 * If omitted, it defaults to NodeCryptoProvider.
 */

import type {
  PushSubscription,
  VapidConfig,
  SendResult,
  NotificationPayload,
} from "../types";

export interface CryptoProvider {
  /** Send a single push notification. Config was provided at construction time. */
  sendNotification(
    subscription: PushSubscription,
    payload: NotificationPayload,
  ): Promise<SendResult>;
}
