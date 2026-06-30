import webpush from "web-push";
import {
  VapidConfig,
  PushSubscription,
  NotificationPayload,
  SendResult,
} from "../types";

export class PushNotificationServer {
  /**
   * Initializes the Web Push server wrapper using VAPID keys.
   * @param config The VAPID contact URI and keys.
   */
  constructor(config: VapidConfig) {
    webpush.setVapidDetails(
      config.contact,
      config.publicKey,
      config.privateKey,
    );
  }

  /**
   * Sends a push notification to a single subscriber.
   * Handles 410 Gone and 404 Not Found to signal dead subscriptions.
   *
   * @param subscription The subscription details from the client browser.
   * @param payload The structured message payload to transmit.
   */
  async sendNotification(
    subscription: PushSubscription,
    payload: NotificationPayload,
  ): Promise<SendResult> {
    try {
      const result = await webpush.sendNotification(
        subscription as any, // Cast as any because web-push expects its own internal typing, which matches our interface.
        JSON.stringify(payload),
      );
      return { success: true, result };
    } catch (error: any) {
      // HTTP 410 (Gone) or 404 (Not Found) signifies the subscription is no longer valid.
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

  /**
   * Sends push notifications in batch to multiple subscriptions.
   * Uses Promise.allSettled to guarantee that failures do not block other sends.
   *
   * @param subscriptions Array of push subscriptions.
   * @param payload The message payload.
   */
  async sendBulk(
    subscriptions: PushSubscription[],
    payload: NotificationPayload,
  ): Promise<PromiseSettledResult<SendResult>[]> {
    const promises = subscriptions.map((sub) =>
      this.sendNotification(sub, payload),
    );
    return Promise.allSettled(promises);
  }
}
export default PushNotificationServer;
