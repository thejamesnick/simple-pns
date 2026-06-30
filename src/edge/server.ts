/**
 * EdgePushNotificationServer
 * ──────────────────────────
 * Runtime-agnostic push notification server that works in:
 *   - Cloudflare Workers
 *   - Vercel Edge Functions
 *   - Deno Deploy
 *   - AWS Lambda (Node.js)
 *   - Anywhere with `fetch` + Web Crypto API
 *
 * Same API as `PushNotificationServer` — drop-in replacement.
 *
 * @example
 * ```ts
 * // Cloudflare Worker
 * import { EdgePushNotificationServer } from 'pns/edge';
 *
 * const pns = new EdgePushNotificationServer({
 *   contact: 'mailto:admin@example.com',
 *   publicKey: env.VAPID_PUBLIC_KEY,
 *   privateKey: env.VAPID_PRIVATE_KEY,
 * });
 *
 * export default {
 *   async fetch(request, env) {
 *     // ... receive subscription from client, save to KV ...
 *     const result = await pns.sendNotification(subscription, {
 *       title: 'Hello',
 *       body: 'From the edge!',
 *     });
 *     return new Response(JSON.stringify(result));
 *   }
 * }
 * ```
 */

import type {
  PushSubscription,
  VapidConfig,
  SendResult,
  NotificationPayload,
} from "../types";
import type { CryptoProvider } from "./crypto-provider";
import { NodeCryptoProvider } from "./node-provider";
import { WebCryptoProvider } from "./web-provider";

/**
 * Determines which crypto provider to use based on runtime capabilities.
 * - If `crypto.subtle` is available and `process?.versions?.node` is not (edge runtime),
 *   use WebCryptoProvider.
 * - Otherwise, fall back to NodeCryptoProvider (which uses `web-push`).
 */
function detectProvider(config: VapidConfig): CryptoProvider {
  // Check if we're in a Node.js environment
  const isNode = typeof process !== "undefined" && process.versions?.node;

  // Check if Web Crypto is available
  const hasWebCrypto =
    typeof crypto !== "undefined" && typeof crypto.subtle !== "undefined";

  if (hasWebCrypto && !isNode) {
    // Edge runtime (CF Workers, Vercel Edge, Deno)
    return new WebCryptoProvider(config);
  }

  // Node.js (Lambda, server, serverless function)
  return new NodeCryptoProvider(config);
}

export class EdgePushNotificationServer {
  private provider: CryptoProvider;

  /**
   * @param config        VAPID configuration.
   * @param cryptoProvider Optional — inject a custom CryptoProvider.
   *                       If omitted, auto-detects the best provider for
   *                       the current runtime.
   */
  constructor(config: VapidConfig, cryptoProvider?: CryptoProvider) {
    this.provider = cryptoProvider ?? detectProvider(config);
  }

  /**
   * Sends a push notification to a single subscriber.
   * Same contract as `PushNotificationServer.sendNotification`.
   */
  async sendNotification(
    subscription: PushSubscription,
    payload: NotificationPayload,
  ): Promise<SendResult> {
    return this.provider.sendNotification(subscription, payload);
  }

  /**
   * Sends push notifications to multiple subscribers in parallel.
   * Uses `Promise.allSettled` — one failure never blocks others.
   */
  async sendBulk(
    subscriptions: PushSubscription[],
    payload: NotificationPayload,
  ): Promise<PromiseSettledResult<SendResult>[]> {
    if (subscriptions.length === 0) {
      return [];
    }

    const promises = subscriptions.map((sub) =>
      this.sendNotification(sub, payload),
    );
    return Promise.allSettled(promises);
  }
}

export default EdgePushNotificationServer;
