/**
 * NodeCryptoProvider — Uses the `web-push` library (Node.js only)
 * ──────────────────────────────────────────────────────────────
 * Default provider. Works in any Node.js environment (serverless
 * functions, Lambda, long-running servers).
 */

import webpush from "web-push";
import type {
  PushSubscription,
  VapidConfig,
  SendResult,
  NotificationPayload,
} from "../types";
import type { CryptoProvider } from "./crypto-provider";

export class NodeCryptoProvider implements CryptoProvider {
  private initialized = false;
  private config!: VapidConfig;

  constructor(config: VapidConfig) {
    this.configure(config);
  }

  private configure(config: VapidConfig): void {
    webpush.setVapidDetails(
      config.contact,
      config.publicKey,
      config.privateKey,
    );
    this.config = config;
    this.initialized = true;
  }

  async sendNotification(
    subscription: PushSubscription,
    payload: NotificationPayload,
  ): Promise<SendResult> {
    if (!this.initialized) {
      throw new Error(
        "NodeCryptoProvider not initialized. Call constructor with VapidConfig.",
      );
    }

    try {
      const result = await webpush.sendNotification(
        subscription as any,
        JSON.stringify(payload),
      );
      return { success: true, result };
    } catch (error: any) {
      if (error.statusCode === 410 || error.statusCode === 404) {
        return {
          success: false,
          error: "GONE",
          subscription,
          result: error,
        };
      }
      return {
        success: false,
        error: error.message || "ERROR",
        result: error,
      };
    }
  }
}
