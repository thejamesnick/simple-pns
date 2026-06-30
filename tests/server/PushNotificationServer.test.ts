/**
 * Tests for PushNotificationServer
 * ─────────────────────────────────────
 * Mocks the `web-push` library to test send logic,
 * error handling, and dead-subscription cleanup.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PushSubscription, NotificationPayload, VapidConfig } from '../../src/types';

// Mock web-push before importing the module under test
vi.mock('web-push', () => {
  const mockSetVapidDetails = vi.fn();
  const mockSendNotification = vi.fn();

  return {
    default: {
      setVapidDetails: mockSetVapidDetails,
      sendNotification: mockSendNotification,
    },
    setVapidDetails: mockSetVapidDetails,
    sendNotification: mockSendNotification,
  };
});

// Dynamic import so mocks are applied first
const { PushNotificationServer } = await import('../../src/server/index');
const webpush = await import('web-push');

// ── Fixtures ────────────────────────────────

const validConfig: VapidConfig = {
  contact: 'mailto:test@example.com',
  publicKey: 'test-public-key',
  privateKey: 'test-private-key',
};

const subscription: PushSubscription = {
  endpoint: 'https://push.example.com/subscription/abc123',
  keys: {
    p256dh: 'base64-p256dh-key',
    auth: 'base64-auth-key',
  },
};

const payload: NotificationPayload = {
  title: 'Test Title',
  body: 'Test body content',
  url: '/test',
};

// ── Tests ───────────────────────────────────

describe('PushNotificationServer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should call setVapidDetails with the config values', () => {
      const server = new PushNotificationServer(validConfig);

      expect(webpush.default.setVapidDetails).toHaveBeenCalledWith(
        'mailto:test@example.com',
        'test-public-key',
        'test-private-key',
      );
      expect(server).toBeInstanceOf(PushNotificationServer);
    });
  });

  describe('sendNotification', () => {
    it('should return success when web-push succeeds', async () => {
      const mockResult = { statusCode: 201, body: 'ok' };
      vi.mocked(webpush.default.sendNotification).mockResolvedValueOnce(mockResult);

      const server = new PushNotificationServer(validConfig);
      const result = await server.sendNotification(subscription, payload);

      expect(result.success).toBe(true);
      expect(result.result).toBe(mockResult);
      expect(result.error).toBeUndefined();
      expect(webpush.default.sendNotification).toHaveBeenCalledWith(
        subscription,
        JSON.stringify(payload),
      );
    });

    it('should return GONE when status code is 410', async () => {
      const error = new Error('Subscription is gone');
      (error as any).statusCode = 410;
      vi.mocked(webpush.default.sendNotification).mockRejectedValueOnce(error);

      const server = new PushNotificationServer(validConfig);
      const result = await server.sendNotification(subscription, payload);

      expect(result.success).toBe(false);
      expect(result.error).toBe('GONE');
      expect(result.subscription).toEqual(subscription);
    });

    it('should return GONE when status code is 404', async () => {
      const error = new Error('Subscription not found');
      (error as any).statusCode = 404;
      vi.mocked(webpush.default.sendNotification).mockRejectedValueOnce(error);

      const server = new PushNotificationServer(validConfig);
      const result = await server.sendNotification(subscription, payload);

      expect(result.success).toBe(false);
      expect(result.error).toBe('GONE');
      expect(result.subscription).toEqual(subscription);
    });

    it('should return error for non-410/404 failures', async () => {
      const error = new Error('Network timeout');
      (error as any).statusCode = 500;
      vi.mocked(webpush.default.sendNotification).mockRejectedValueOnce(error);

      const server = new PushNotificationServer(validConfig);
      const result = await server.sendNotification(subscription, payload);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network timeout');
      expect(result.subscription).toBeUndefined();
    });

    it('should handle errors without a statusCode', async () => {
      vi.mocked(webpush.default.sendNotification).mockRejectedValueOnce(
        new Error('Unknown error'),
      );

      const server = new PushNotificationServer(validConfig);
      const result = await server.sendNotification(subscription, payload);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown error');
    });
  });

  describe('sendBulk', () => {
    it('should send to all subscriptions and return settled results', async () => {
      const subB = { ...subscription, endpoint: 'https://push.example.com/subscription/xyz' };
      const mockResult = { statusCode: 201, body: 'ok' };

      vi.mocked(webpush.default.sendNotification).mockResolvedValue(mockResult);

      const server = new PushNotificationServer(validConfig);
      const results = await server.sendBulk([subscription, subB], payload);

      expect(results).toHaveLength(2);
      expect(results[0].status).toBe('fulfilled');
      if (results[0].status === 'fulfilled') {
        expect(results[0].value.success).toBe(true);
      }
      expect(results[1].status).toBe('fulfilled');
      if (results[1].status === 'fulfilled') {
        expect(results[1].value.success).toBe(true);
      }
      expect(webpush.default.sendNotification).toHaveBeenCalledTimes(2);
    });

    it('should handle mixed success and failure', async () => {
      const subA = { ...subscription, endpoint: 'https://push.example.com/sub/good' };
      const subB = { ...subscription, endpoint: 'https://push.example.com/sub/dead' };

      const mockResult = { statusCode: 201, body: 'ok' };
      const error410 = new Error('Gone');
      (error410 as any).statusCode = 410;

      vi.mocked(webpush.default.sendNotification)
        .mockResolvedValueOnce(mockResult)
        .mockRejectedValueOnce(error410);

      const server = new PushNotificationServer(validConfig);
      const results = await server.sendBulk([subA, subB], payload);

      expect(results).toHaveLength(2);
      expect(results[0].status).toBe('fulfilled');
      if (results[0].status === 'fulfilled') {
        expect(results[0].value.success).toBe(true);
      }
      expect(results[1].status).toBe('fulfilled');
      if (results[1].status === 'fulfilled') {
        expect(results[1].value.success).toBe(false);
        expect(results[1].value.error).toBe('GONE');
        expect(results[1].value.subscription).toEqual(subB);
      }
    });

    it('should not throw when web-push throws an unexpected error', async () => {
      vi.mocked(webpush.default.sendNotification).mockRejectedValue(
        new Error('Unexpected server error'),
      );

      const server = new PushNotificationServer(validConfig);
      const results = await server.sendBulk([subscription], payload);

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('fulfilled');
      if (results[0].status === 'fulfilled') {
        expect(results[0].value.success).toBe(false);
        expect(results[0].value.error).toBe('Unexpected server error');
      }
    });

    it('should return empty array for no subscriptions', async () => {
      const server = new PushNotificationServer(validConfig);
      const results = await server.sendBulk([], payload);

      expect(results).toEqual([]);
    });
  });
});
