/**
 * WebCryptoProvider — Edge/runtime-agnostic push delivery
 * ──────────────────────────────────────────────────────
 * Uses Web Crypto API (available in Cloudflare Workers,
 * Vercel Edge, Deno, modern browsers) to sign VAPID JWTs
 * and encrypt notification payloads.
 *
 * No dependency on Node.js `crypto` or the `web-push` package.
 */

import type {
  PushSubscription,
  VapidConfig,
  SendResult,
  NotificationPayload,
} from "../types";
import type { CryptoProvider } from "./crypto-provider";
import { buildVapidHeader } from "./vapid";
import { encryptPayload } from "./encrypt";

export class WebCryptoProvider implements CryptoProvider {
  private config!: VapidConfig;

  constructor(config: VapidConfig) {
    if (!config.contact || !config.publicKey || !config.privateKey) {
      throw new Error(
        "WebCryptoProvider requires a valid VapidConfig with contact, publicKey, and privateKey.",
      );
    }
    this.config = config;
  }

  async sendNotification(
    subscription: PushSubscription,
    payload: NotificationPayload,
  ): Promise<SendResult> {
    try {
      // ── Validate the endpoint ──
      let endpointUrl: URL;
      try {
        endpointUrl = new URL(subscription.endpoint);
      } catch {
        return {
          success: false,
          error: "Invalid subscription endpoint URL.",
        };
      }

      // ── Extract the push service origin for the VAPID audience ──
      const audience = `${endpointUrl.protocol}//${endpointUrl.hostname}`;

      // ── Build VAPID authorization headers ──
      const { authorization, cryptoKey } = await buildVapidHeader(
        audience,
        this.config.contact,
        this.config.publicKey,
        this.config.privateKey,
      );

      // ── Encrypt the payload ──
      const payloadString = JSON.stringify(payload);
      const { body } = await encryptPayload(
        payloadString,
        subscription.keys.p256dh,
      );

      // ── Send the HTTP request ──
      // Use the runtime's global `fetch` (available in all edge runtimes).
      const response = await fetch(subscription.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Encoding": "aes128gcm",
          TTL: "2419200", // 28 days (max)
          Authorization: authorization,
          "Crypto-Key": cryptoKey,
        },
        body: body,
      });

      if (response.ok) {
        return {
          success: true,
          result: {
            statusCode: response.status,
            statusText: response.statusText,
          },
        };
      }

      // ── Handle errors ──
      if (response.status === 410 || response.status === 404) {
        return {
          success: false,
          error: "GONE",
          subscription,
          result: {
            statusCode: response.status,
            statusText: response.statusText,
          },
        };
      }

      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
        result: {
          statusCode: response.status,
          statusText: response.statusText,
        },
      };
    } catch (error: any) {
      // Detect network errors or crypto failures
      const message = error?.message ?? "Unknown error during push delivery.";
      return {
        success: false,
        error: message,
        result: error,
      };
    }
  }
}
