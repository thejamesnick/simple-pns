/**
 * Tests for PushNotificationClient
 * ─────────────────────────────────────
 * Mocks browser APIs (ServiceWorker, PushManager, Notification)
 * to verify subscribe / unsubscribe / permission flows.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { PushNotificationClient } from "../../src/client/index";

// ── Mock browser APIs ─────────────────────

const mockSubscribe = vi.fn();
const mockGetSubscription = vi.fn();
const mockUnsubscribe = vi.fn();
const mockRegister = vi.fn();
const mockRequestPermission = vi.fn();

let mockPermissionState: NotificationPermission = "default";

function buildRegistration() {
  return {
    update: vi.fn(),
    active: { state: "activated", addEventListener: vi.fn() },
    pushManager: {
      subscribe: mockSubscribe,
      getSubscription: mockGetSubscription,
    },
  };
}

function setupBrowserMocks() {
  const registration = buildRegistration();

  Object.defineProperty(globalThis, "navigator", {
    writable: true,
    configurable: true,
    value: {
      serviceWorker: {
        register: mockRegister,
        ready: Promise.resolve(registration),
      },
    },
  });

  Object.defineProperty(globalThis, "Notification", {
    writable: true,
    configurable: true,
    value: {
      permission: mockPermissionState,
      requestPermission: mockRequestPermission,
    },
  });

  (globalThis as any).window = globalThis;
  (globalThis as any).PushManager = {};
  (globalThis as any).atob = (str: string) =>
    Buffer.from(str, "base64").toString("binary");
}

function createClient(opts?: { serviceWorkerPath?: string }) {
  return new PushNotificationClient({
    publicVapidKey: "test-vapid-key",
    ...opts,
  });
}

// ── Tests ───────────────────────────────────

describe("PushNotificationClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPermissionState = "default";

    mockRegister.mockResolvedValue(buildRegistration());
    mockSubscribe.mockResolvedValue({
      toJSON: () => ({
        endpoint: "https://push.example.com/sub/test",
        keys: { p256dh: "key123", auth: "auth456" },
      }),
    });
    mockGetSubscription.mockResolvedValue(null);
    mockRequestPermission.mockResolvedValue("granted");

    setupBrowserMocks();
  });

  describe("isSupported", () => {
    it("should return true when APIs are available", () => {
      expect(createClient().isSupported()).toBe(true);
    });

    it("should return false when serviceWorker is missing", () => {
      Object.defineProperty(globalThis, "navigator", {
        writable: true,
        configurable: true,
        value: {},
      });
      expect(createClient().isSupported()).toBe(false);
    });
  });

  describe("getPermissionState", () => {
    it("should return the current permission state", () => {
      expect(createClient().getPermissionState()).toBe("default");
    });

    it("should return granted when permission is granted", () => {
      mockPermissionState = "granted";
      Object.defineProperty(Notification, "permission", {
        value: "granted",
        writable: true,
      });
      expect(createClient().getPermissionState()).toBe("granted");
    });
  });

  describe("isPermissionDenied", () => {
    it("should return true when permission is denied", () => {
      mockPermissionState = "denied";
      Object.defineProperty(Notification, "permission", {
        value: "denied",
        writable: true,
      });
      expect(createClient().isPermissionDenied()).toBe(true);
    });

    it("should return false when permission is granted", () => {
      mockPermissionState = "granted";
      Object.defineProperty(Notification, "permission", {
        value: "granted",
        writable: true,
      });
      expect(createClient().isPermissionDenied()).toBe(false);
    });
  });

  describe("subscribe", () => {
    it("should return success and subscription when flow completes", async () => {
      mockRequestPermission.mockResolvedValue("granted");
      Object.defineProperty(globalThis, "Notification", {
        writable: true,
        configurable: true,
        value: {
          permission: "default",
          requestPermission: mockRequestPermission,
        },
      });

      const result = await createClient().subscribe();

      expect(result.success).toBe(true);
      expect(result.subscription).toBeDefined();
      expect(result.subscription!.endpoint).toBe(
        "https://push.example.com/sub/test",
      );
      expect(mockRegister).toHaveBeenCalledWith("/sw.js");
      expect(mockRequestPermission).toHaveBeenCalled();
      expect(mockSubscribe).toHaveBeenCalledWith({
        userVisibleOnly: true,
        applicationServerKey: expect.any(Uint8Array),
      });
    });

    it("should return error when permission is denied", async () => {
      mockRequestPermission.mockResolvedValue("denied");
      Object.defineProperty(globalThis, "Notification", {
        writable: true,
        configurable: true,
        value: {
          permission: "default",
          requestPermission: mockRequestPermission,
        },
      });

      const result = await createClient().subscribe();
      expect(result.success).toBe(false);
      expect(result.error).toContain("denied");
    });

    it("should return error when push is not supported", async () => {
      Object.defineProperty(globalThis, "navigator", {
        writable: true,
        configurable: true,
        value: {},
      });

      const result = await createClient().subscribe();
      expect(result.success).toBe(false);
      expect(result.error).toContain("not supported");
    });

    it("should use custom service worker path when provided", async () => {
      mockRequestPermission.mockResolvedValue("granted");
      Object.defineProperty(globalThis, "Notification", {
        writable: true,
        configurable: true,
        value: {
          permission: "default",
          requestPermission: mockRequestPermission,
        },
      });

      await createClient({ serviceWorkerPath: "/custom-sw.js" }).subscribe();
      expect(mockRegister).toHaveBeenCalledWith("/custom-sw.js");
    });
  });

  describe("unsubscribe", () => {
    it("should return success when unsubscribing", async () => {
      mockUnsubscribe.mockResolvedValue(true);
      mockGetSubscription.mockResolvedValue({
        unsubscribe: mockUnsubscribe,
        toJSON: () => ({ endpoint: "test" }),
      });

      // Override navigator so ready promise uses updated mocks
      Object.defineProperty(globalThis, "navigator", {
        writable: true,
        configurable: true,
        value: {
          serviceWorker: {
            register: mockRegister,
            ready: Promise.resolve({
              pushManager: {
                subscribe: mockSubscribe,
                getSubscription: mockGetSubscription,
              },
              active: { state: "activated", addEventListener: vi.fn() },
            }),
          },
        },
      });

      const result = await createClient().unsubscribe();
      expect(result.success).toBe(true);
      expect(mockGetSubscription).toHaveBeenCalled();
      expect(mockUnsubscribe).toHaveBeenCalled();
    });

    it("should return success when no subscription exists", async () => {
      mockGetSubscription.mockResolvedValue(null);

      Object.defineProperty(globalThis, "navigator", {
        writable: true,
        configurable: true,
        value: {
          serviceWorker: {
            register: mockRegister,
            ready: Promise.resolve({
              pushManager: {
                subscribe: mockSubscribe,
                getSubscription: mockGetSubscription,
              },
              active: { state: "activated", addEventListener: vi.fn() },
            }),
          },
        },
      });

      const result = await createClient().unsubscribe();
      expect(result.success).toBe(true);
    });
  });

  describe("getSubscription", () => {
    it("should return null when no subscription exists", async () => {
      mockGetSubscription.mockResolvedValue(null);

      Object.defineProperty(globalThis, "navigator", {
        writable: true,
        configurable: true,
        value: {
          serviceWorker: {
            register: mockRegister,
            ready: Promise.resolve({
              pushManager: {
                subscribe: mockSubscribe,
                getSubscription: mockGetSubscription,
              },
              active: { state: "activated", addEventListener: vi.fn() },
            }),
          },
        },
      });

      const result = await createClient().getSubscription();
      expect(result).toBeNull();
    });

    it("should return subscription when one exists", async () => {
      mockGetSubscription.mockResolvedValue({
        toJSON: () => ({
          endpoint: "https://push.example.com/sub/existing",
          keys: { p256dh: "pk", auth: "ak" },
        }),
      });

      Object.defineProperty(globalThis, "navigator", {
        writable: true,
        configurable: true,
        value: {
          serviceWorker: {
            register: mockRegister,
            ready: Promise.resolve({
              pushManager: {
                subscribe: mockSubscribe,
                getSubscription: mockGetSubscription,
              },
              active: { state: "activated", addEventListener: vi.fn() },
            }),
          },
        },
      });

      const result = await createClient().getSubscription();
      expect(result).not.toBeNull();
      expect(result!.endpoint).toBe("https://push.example.com/sub/existing");
      expect(result!.keys.p256dh).toBe("pk");
    });
  });
});
