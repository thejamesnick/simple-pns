/**
 * PNS Client SDK
 * ─────────────────────────────────────────────
 * Browser-side SDK for subscribing to push notifications.
 * Handles permission prompts, service worker registration,
 * and VAPID-based subscription in a clean, type-safe API.
 *
 * @package PNS
 */

import type { PushSubscription } from "../types";

/**
 * Result returned from a subscribe or unsubscribe action.
 */
export interface SubscriptionResult {
  /** Whether the operation succeeded. */
  success: boolean;
  /** The subscription object (present on success). */
  subscription?: PushSubscription;
  /** Human-readable error message (present on failure). */
  error?: string;
}

/**
 * Browser-side push notification client.
 *
 * @example
 * ```ts
 * const client = new PushNotificationClient({
 *   publicVapidKey: 'YOUR_PUBLIC_VAPID_KEY',
 * });
 *
 * const { success, subscription } = await client.subscribe();
 * if (success && subscription) {
 *   await fetch('/api/subscribe', {
 *     method: 'POST',
 *     body: JSON.stringify(subscription),
 *     headers: { 'Content-Type': 'application/json' },
 *   });
 * }
 * ```
 */
export class PushNotificationClient {
  private readonly publicVapidKey: string;
  private readonly serviceWorkerPath: string;
  private registration: ServiceWorkerRegistration | null = null;

  /**
   * @param config            Configuration object.
   * @param config.publicVapidKey  The application's public VAPID key (URL-safe base64).
   * @param config.serviceWorkerPath  Path to the service worker script (default: `/sw.js`).
   */
  constructor(config: { publicVapidKey: string; serviceWorkerPath?: string }) {
    this.publicVapidKey = config.publicVapidKey;
    this.serviceWorkerPath = config.serviceWorkerPath ?? "/sw.js";
  }

  // ──────────────────────────────────────────────
  //  Feature Detection
  // ──────────────────────────────────────────────

  /**
   * Checks whether the current browser supports push notifications.
   * Does *not* throw — use this to gate UI (e.g. hide the "Enable" button).
   */
  isSupported(): boolean {
    return (
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window
    );
  }

  /**
   * Returns the current permission state:
   *   - `'granted'`   → user has allowed notifications
   *   - `'denied'`    → user has blocked notifications (can't prompt again)
   *   - `'default'`   → user hasn't decided yet (prompt will show)
   */
  getPermissionState(): NotificationPermission {
    return Notification.permission;
  }

  /**
   * Whether the browser's push notification API surfaced a permission
   * that is `'denied'` — meaning the user has permanently blocked it
   * and no `.subscribe()` call will ever succeed.
   */
  isPermissionDenied(): boolean {
    return Notification.permission === "denied";
  }

  // ──────────────────────────────────────────────
  //  Subscribe / Unsubscribe
  // ──────────────────────────────────────────────

  /**
   * Subscribes the current browser to push notifications.
   *
   * Flow:
   *   1. Registers (or reuses) the service worker.
   *   2. Requests notification permission from the user.
   *   3. Subscribes via the browser's `PushManager`.
   *
   * @returns A `SubscriptionResult` — always inspect `.success` first.
   */
  async subscribe(): Promise<SubscriptionResult> {
    try {
      // 1. Feature check — fail fast with a clear message
      if (!this.isSupported()) {
        return {
          success: false,
          error:
            "Push notifications are not supported in this browser. " +
            "Ensure you are on HTTPS or localhost, and using a modern browser.",
        };
      }

      // 2. Register the service worker (idempotent if already registered)
      this.registration = await navigator.serviceWorker.register(
        this.serviceWorkerPath,
      );
      await this.registration.update();

      // 3. Wait for the service worker to be fully active
      if (
        this.registration.active &&
        this.registration.active.state !== "activated"
      ) {
        await new Promise<void>((resolve) => {
          const sw = this.registration!.active!;
          sw.addEventListener("statechange", () => {
            if (sw.state === "activated") resolve();
          });
        });
      }

      // 4. Request permission
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        return {
          success: false,
          error:
            permission === "denied"
              ? "Notification permission was denied. Update your browser settings to enable it."
              : "Notification permission was dismissed or blocked.",
        };
      }

      // 5. Subscribe to push
      const applicationServerKey = this.#urlBase64ToUint8Array(
        this.publicVapidKey,
      ) as BufferSource;
      const subscription = await this.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });

      return {
        success: true,
        subscription: subscription.toJSON() as PushSubscription,
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "An unknown error occurred during subscription.",
      };
    }
  }

  /**
   * Unsubscribes the current browser from push notifications.
   * Safe to call even if no subscription exists.
   */
  async unsubscribe(): Promise<SubscriptionResult> {
    try {
      if (!this.registration) {
        this.registration = await navigator.serviceWorker.ready;
      }

      const subscription =
        await this.registration.pushManager.getSubscription();
      if (!subscription) {
        return { success: true }; // Already unsubscribed
      }

      const ok = await subscription.unsubscribe();
      return {
        success: ok,
        error: ok ? undefined : "Failed to unsubscribe.",
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "An unknown error occurred during unsubscription.",
      };
    }
  }

  /**
   * Returns the current `PushSubscription` if one exists, or `null`.
   */
  async getSubscription(): Promise<PushSubscription | null> {
    try {
      const reg = this.registration ?? (await navigator.serviceWorker.ready);
      const sub = await reg.pushManager.getSubscription();
      return sub ? (sub.toJSON() as PushSubscription) : null;
    } catch {
      return null;
    }
  }

  // ──────────────────────────────────────────────
  //  Private Helpers
  // ──────────────────────────────────────────────

  /**
   * Converts a URL-safe base64 string to a `Uint8Array`.
   * Required by the Push API's `applicationServerKey` parameter.
   */
  #urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, "+")
      .replace(/_/g, "/");
    const rawData = atob(base64);
    const output = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; i++) {
      output[i] = rawData.charCodeAt(i);
    }
    return output;
  }
}

export default PushNotificationClient;
