/**
 * Tests for EdgePushNotificationServer
 * ─────────────────────────────────────
 * Validates provider delegation, error handling,
 * and the send/sendBulk contract.
 */

import { describe, it, expect, vi } from "vitest";
import type { PushSubscription, NotificationPayload } from "../../src/types";

// ── Fixtures ────────────────────────────────

const subscription: PushSubscription = {
  endpoint: "https://push.example.com/sub/abc",
  keys: { p256dh: "base64-key", auth: "base64-auth" },
};

const payload: NotificationPayload = {
  title: "Test",
  body: "Test body",
};

// ── Tests ───────────────────────────────────

describe("EdgePushNotificationServer", () => {
  describe("constructor", () => {
    it("should accept a custom CryptoProvider", async () => {
      const { EdgePushNotificationServer } =
        await import("../../src/edge/server");

      const mockSend = vi.fn().mockResolvedValue({ success: true });
      const provider = { sendNotification: mockSend };

      const server = new EdgePushNotificationServer(
        {
          contact: "mailto:test@example.com",
          publicKey: "test",
          privateKey: "test",
        },
        provider,
      );

      const result = await server.sendNotification(subscription, payload);

      expect(result.success).toBe(true);
      expect(mockSend).toHaveBeenCalledWith(subscription, payload);
    });

    it("should detect and use NodeCryptoProvider with valid keys in Node.js", async () => {
      const { EdgePushNotificationServer } =
        await import("../../src/edge/server");

      // Uses real VAPID keys so web-push validation passes
      const server = new EdgePushNotificationServer({
        contact: "mailto:test@example.com",
        publicKey:
          "BFZ-xIwU8_dZzO61K5O9xY3dSa5J2ovl5dO07ul_tyQtplkGrHA6gukUqlainMD6bUGKcEoEEMG8hlPo-7iPxCQ",
        privateKey: "Kgj68-IcoZm_cdE4iUPMCKO9hio_wQRzJ8VFMV3GAuo",
      });

      expect(server).toBeInstanceOf(EdgePushNotificationServer);
    });
  });

  describe("sendNotification", () => {
    it("should return success when provider succeeds", async () => {
      const { EdgePushNotificationServer } =
        await import("../../src/edge/server");

      const provider = {
        sendNotification: vi
          .fn()
          .mockResolvedValue({ success: true, result: { statusCode: 201 } }),
      };

      const server = new EdgePushNotificationServer(
        { contact: "mailto:t@t.com", publicKey: "test", privateKey: "test" },
        provider,
      );

      const result = await server.sendNotification(subscription, payload);
      expect(result.success).toBe(true);
    });

    it("should return GONE when provider returns GONE", async () => {
      const { EdgePushNotificationServer } =
        await import("../../src/edge/server");

      const provider = {
        sendNotification: vi.fn().mockResolvedValue({
          success: false,
          error: "GONE",
          subscription,
        }),
      };

      const server = new EdgePushNotificationServer(
        { contact: "mailto:t@t.com", publicKey: "test", privateKey: "test" },
        provider,
      );

      const result = await server.sendNotification(subscription, payload);
      expect(result.success).toBe(false);
      expect(result.error).toBe("GONE");
      expect(result.subscription).toEqual(subscription);
    });
  });

  describe("sendBulk", () => {
    it("should send to multiple subscriptions", async () => {
      const { EdgePushNotificationServer } =
        await import("../../src/edge/server");

      const mockSend = vi.fn().mockResolvedValue({ success: true });
      const provider = { sendNotification: mockSend };

      const server = new EdgePushNotificationServer(
        { contact: "mailto:t@t.com", publicKey: "test", privateKey: "test" },
        provider,
      );

      const subB = {
        ...subscription,
        endpoint: "https://push.example.com/sub/xyz",
      };
      const results = await server.sendBulk([subscription, subB], payload);

      expect(results).toHaveLength(2);
      expect(results[0].status).toBe("fulfilled");
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it("should return empty array for no subscriptions", async () => {
      const { EdgePushNotificationServer } =
        await import("../../src/edge/server");

      const server = new EdgePushNotificationServer(
        { contact: "mailto:t@t.com", publicKey: "test", privateKey: "test" },
        { sendNotification: vi.fn() },
      );

      const results = await server.sendBulk([], payload);
      expect(results).toEqual([]);
    });
  });
});
