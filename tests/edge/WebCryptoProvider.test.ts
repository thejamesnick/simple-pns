/**
 * Tests for WebCryptoProvider
 * ─────────────────────────────
 * Validates VAPID JWT signing, payload encryption,
 * and HTTP fetch integration using Web Crypto API.
 */

import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";

// ── Real VAPID keys (generated from web-push, valid P-256) ──
//
// The subscription p256dh key is a valid uncompressed EC point (65 bytes),
// so we reuse the VAPID public key for it since they share the same format.

const VAPID_PUBLIC_KEY =
  "BFZ-xIwU8_dZzO61K5O9xY3dSa5J2ovl5dO07ul_tyQtplkGrHA6gukUqlainMD6bUGKcEoEEMG8hlPo-7iPxCQ";
const VAPID_PRIVATE_KEY = "Kgj68-IcoZm_cdE4iUPMCKO9hio_wQRzJ8VFMV3GAuo";

const subscription = {
  endpoint: "https://updates.push.services.mozilla.com/wpush/v2/test",
  keys: {
    p256dh: VAPID_PUBLIC_KEY, // Reuse — same format (65-byte uncompressed P-256 point)
    auth: "TEST_AUTH_SECRET_123",
  },
};

const payload = { title: "Test", body: "Hello from Edge PNS!" };

// ── Tests ───────────────────────────────────

describe("WebCryptoProvider", () => {
  beforeAll(() => {
    // Mock global fetch
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should return success when push service accepts", async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 201,
      statusText: "Created",
    });

    const { WebCryptoProvider } = await import("../../src/edge/web-provider");

    const provider = new WebCryptoProvider({
      contact: "mailto:test@example.com",
      publicKey: VAPID_PUBLIC_KEY,
      privateKey: VAPID_PRIVATE_KEY,
    });

    const result = await provider.sendNotification(subscription, payload);

    expect(result.success).toBe(true);
    expect((result as any).result?.statusCode).toBe(201);

    // Verify fetch was called with proper VAPID headers and encrypted body
    expect(globalThis.fetch).toHaveBeenCalledWith(
      subscription.endpoint,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/octet-stream",
          "Content-Encoding": "aes128gcm",
          TTL: expect.any(String),
          Authorization: expect.stringContaining("vapid t="),
          "Crypto-Key": expect.stringContaining("p256ecdsa="),
        }),
        body: expect.any(Uint8Array),
      }),
    );
  });

  it("should return GONE on 410", async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 410,
      statusText: "Gone",
    });

    const { WebCryptoProvider } = await import("../../src/edge/web-provider");

    const provider = new WebCryptoProvider({
      contact: "mailto:test@example.com",
      publicKey: VAPID_PUBLIC_KEY,
      privateKey: VAPID_PRIVATE_KEY,
    });

    const result = await provider.sendNotification(subscription, payload);

    expect(result.success).toBe(false);
    expect(result.error).toBe("GONE");
    expect(result.subscription).toEqual(subscription);
  });

  it("should return GONE on 404", async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found",
    });

    const { WebCryptoProvider } = await import("../../src/edge/web-provider");

    const provider = new WebCryptoProvider({
      contact: "mailto:test@example.com",
      publicKey: VAPID_PUBLIC_KEY,
      privateKey: VAPID_PRIVATE_KEY,
    });

    const result = await provider.sendNotification(subscription, payload);
    expect(result.success).toBe(false);
    expect(result.error).toBe("GONE");
  });

  it("should return error on 500", async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });

    const { WebCryptoProvider } = await import("../../src/edge/web-provider");

    const provider = new WebCryptoProvider({
      contact: "mailto:test@example.com",
      publicKey: VAPID_PUBLIC_KEY,
      privateKey: VAPID_PRIVATE_KEY,
    });

    const result = await provider.sendNotification(subscription, payload);
    expect(result.success).toBe(false);
    expect(result.error).toContain("500");
  });

  it("should return error for invalid endpoint URL", async () => {
    const { WebCryptoProvider } = await import("../../src/edge/web-provider");

    const provider = new WebCryptoProvider({
      contact: "mailto:test@example.com",
      publicKey: VAPID_PUBLIC_KEY,
      privateKey: VAPID_PRIVATE_KEY,
    });

    const result = await provider.sendNotification(
      { ...subscription, endpoint: "not-a-url" },
      payload,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid");
  });

  it("should reject missing VAPID config", async () => {
    const { WebCryptoProvider } = await import("../../src/edge/web-provider");

    expect(() => {
      new WebCryptoProvider({ contact: "", publicKey: "", privateKey: "" });
    }).toThrow("valid VapidConfig");
  });

  it("should handle network errors gracefully", async () => {
    (globalThis.fetch as any).mockRejectedValueOnce(new Error("fetch failed"));

    const { WebCryptoProvider } = await import("../../src/edge/web-provider");

    const provider = new WebCryptoProvider({
      contact: "mailto:test@example.com",
      publicKey: VAPID_PUBLIC_KEY,
      privateKey: VAPID_PRIVATE_KEY,
    });

    const result = await provider.sendNotification(subscription, payload);
    expect(result.success).toBe(false);
    expect(result.error).toBe("fetch failed");
  });
});
