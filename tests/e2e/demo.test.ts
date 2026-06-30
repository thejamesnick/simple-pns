/**
 * End-to-end tests for the PNS demo server.
 * ─────────────────────────────────────
 * Starts an Express server with the same API surface as the demo,
 * runs HTTP requests against all endpoints, and validates responses.
 *
 * Uses mocked web-push to avoid needing real VAPID keys.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import * as http from "http";

// Mock web-push so we don't need real VAPID keys
vi.mock("web-push", () => {
  const mockSend = vi.fn();
  // Default: succeed
  mockSend.mockResolvedValue({ statusCode: 201, body: "ok" });

  return {
    default: {
      setVapidDetails: vi.fn(),
      sendNotification: mockSend,
    },
    setVapidDetails: vi.fn(),
    sendNotification: mockSend,
  };
});

// ── Helpers ─────────────────────────────────

function request(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const options: http.RequestOptions = {
      hostname: "127.0.0.1",
      port: 3001,
      path,
      method,
      headers: { "Content-Type": "application/json" },
    };

    const req = http.request(options, (res) => {
      let raw = "";
      res.on("data", (chunk: Buffer) => (raw += chunk.toString()));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode ?? 0, data: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode ?? 0, data: raw });
        }
      });
    });

    req.on("error", reject);

    if (body !== undefined) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// ── Fixtures ────────────────────────────────

const subscriberA = {
  endpoint: "https://e2e-test.example.com/push/a",
  keys: { p256dh: "e2e-key-a", auth: "e2e-auth-a" },
};

const subscriberB = {
  endpoint: "https://e2e-test.example.com/push/b",
  keys: { p256dh: "e2e-key-b", auth: "e2e-auth-b" },
};

// ── Tests ───────────────────────────────────

describe("Demo Server (E2E)", () => {
  let server: http.Server;

  beforeAll(async () => {
    const { default: express } = await import("express");
    const { PushNotificationServer } = await import("../../src/server/index");

    const pns = new PushNotificationServer({
      contact: "mailto:e2e@test.com",
      publicKey: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      privateKey: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    });

    const app = express();
    app.use(express.json());

    const subscriptions = new Map<string, any>();

    app.get("/api/config", (_req, res) => {
      res.json({ publicVapidKey: "test-public-key" });
    });

    app.post("/api/subscribe", (req, res) => {
      const sub = req.body;
      if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
        res.status(400).json({
          success: false,
          error:
            "Invalid subscription object. Expected { endpoint, keys: { p256dh, auth } }.",
        });
        return;
      }
      subscriptions.set(sub.endpoint, sub);
      res.json({ success: true, total: subscriptions.size });
    });

    app.post("/api/unsubscribe", (req, res) => {
      const { endpoint } = req.body ?? {};
      if (!endpoint) {
        res.status(400).json({
          success: false,
          error: 'Missing "endpoint" in request body.',
        });
        return;
      }
      const removed = subscriptions.delete(endpoint);
      res.json({ success: true, removed });
    });

    app.post("/api/notify", async (req, res) => {
      const allSubs = Array.from(subscriptions.values());
      if (allSubs.length === 0) {
        res.json({
          success: true,
          sent: 0,
          failed: 0,
          cleaned: 0,
          message: "No subscribers.",
        });
        return;
      }

      const payload = {
        title: req.body?.title ?? "Test",
        body: req.body?.body ?? "Test body",
      };
      const results = await pns.sendBulk(allSubs, payload);

      let cleaned = 0;
      for (const result of results) {
        if (
          result.status === "fulfilled" &&
          !result.value.success &&
          result.value.error === "GONE"
        ) {
          subscriptions.delete(result.value.subscription?.endpoint);
          cleaned++;
        }
      }

      const sent = results.filter(
        (r) => r.status === "fulfilled" && r.value.success,
      ).length;
      const failed = results.length - sent;

      res.json({
        success: true,
        sent,
        failed,
        cleaned,
        total: subscriptions.size,
      });
    });

    server = app.listen(3001);
    await new Promise<void>((resolve) => server.on("listening", resolve));
  });

  afterAll(() => {
    return new Promise<void>((resolve) => server.close(() => resolve()));
  });

  // ── Tests ──

  it("GET /api/config returns the public VAPID key", async () => {
    const { status, data } = await request("GET", "/api/config");
    expect(status).toBe(200);
    expect(data).toEqual({ publicVapidKey: "test-public-key" });
  });

  it("POST /api/subscribe saves a subscription", async () => {
    const { status, data } = await request(
      "POST",
      "/api/subscribe",
      subscriberA,
    );
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.total).toBe(1);
  });

  it("POST /api/subscribe saves a second subscription", async () => {
    const { status, data } = await request(
      "POST",
      "/api/subscribe",
      subscriberB,
    );
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.total).toBe(2);
  });

  it("POST /api/subscribe with invalid body returns 400", async () => {
    const { status, data } = await request("POST", "/api/subscribe", {
      endpoint: "no-keys",
    });
    expect(status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain("Invalid");
  });

  it("POST /api/notify sends to all subscribers", async () => {
    const { status, data } = await request("POST", "/api/notify", {
      title: "E2E Test",
      body: "Hello from E2E",
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.failed).toBe(0);
    expect(data.sent).toBe(2);
    expect(data.total).toBe(2);
  });

  it("POST /api/unsubscribe removes a subscription", async () => {
    const { status, data } = await request("POST", "/api/unsubscribe", {
      endpoint: subscriberA.endpoint,
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.removed).toBe(true);
  });

  it("POST /api/unsubscribe with missing endpoint returns 400", async () => {
    const { status, data } = await request("POST", "/api/unsubscribe", {});
    expect(status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain("Missing");
  });

  it("POST /api/notify after unsubscribe reflects the count", async () => {
    const { status, data } = await request("POST", "/api/notify", {});
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.total).toBe(1);
  });

  it("POST /api/notify with no subscribers returns empty message", async () => {
    await request("POST", "/api/unsubscribe", {
      endpoint: subscriberB.endpoint,
    });

    const { status, data } = await request("POST", "/api/notify", {
      title: "x",
      body: "y",
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toContain("No subscribers");
  });
});
