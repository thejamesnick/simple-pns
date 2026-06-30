# Implementation Plan - TypeScript Push Notification System (PNS) Package

Build a modular, type-safe **Push Notification System (PNS)** package using TypeScript. The package will compile separate builds for the Node.js Server SDK and the Browser Client SDK, alongside a configurable Service Worker.

## User Review Required

> [!IMPORTANT]
> **VAPID Keys Generation:** We will include a utility script to generate VAPID keys. You will need to copy these keys to a `.env` file for testing.
> **Service Worker Location:** Browsers require the Service Worker (`sw.js`) to be served from the root directory of the application (or with specific HTTP headers) to have full scope over the app. In our test rig, we will serve it from the public root.

## Open Questions
No immediate open questions.

---

## Proposed Changes

We will create a typescript project structure:
```
PNS/
├── package.json
├── tsconfig.json            (Base configuration)
├── tsconfig.server.json     (For compiling Server SDK to Node/CommonJS)
├── tsconfig.client.json     (For compiling Client SDK to ES6/Browser)
├── src/
│   ├── types.ts             (Shared TypeScript definitions/interfaces)
│   ├── server/
│   │   └── index.ts         (PushNotificationServer SDK)
│   ├── client/
│   │   └── index.ts         (PushNotificationClient SDK)
│   └── sw/
│       └── sw.ts            (Service Worker source)
├── bin/
│   └── generate-keys.ts     (VAPID key generator utility)
└── demo/                    (Test app)
    ├── server.ts            (Express server using Server SDK)
    ├── public/
    │   ├── index.html       (Web frontend using Client SDK)
    │   └── sw.js            (Compiled Service Worker)
    └── .env                 (VAPID key settings)
```

### Setup & Configurations

#### [package.json](file:///Users/nicksol/Desktop/2026/PNS/package.json)
Define dependencies (`web-push`, `dotenv`, `express`), devDependencies (`typescript`, `@types/node`, `@types/web-push`, `@types/express`, `ts-node`), and build scripts.

#### [tsconfig.json](file:///Users/nicksol/Desktop/2026/PNS/tsconfig.json)
Base compiler options targeting modern ES.

#### [tsconfig.server.json](file:///Users/nicksol/Desktop/2026/PNS/tsconfig.server.json)
Overrides to build Server SDK to `dist/server` targeting CommonJS/Node.

#### [tsconfig.client.json](file:///Users/nicksol/Desktop/2026/PNS/tsconfig.client.json)
Overrides to build Client SDK and Service Worker to `dist/client` targeting DOM/ES6.

---

### Core Package Code

#### [types.ts](file:///Users/nicksol/Desktop/2026/PNS/src/types.ts)
Define explicit interfaces:
*   `PushSubscription` (endpoint, keys)
*   `VapidConfig` (subject/email, publicKey, privateKey)
*   `NotificationPayload` (title, body, icon, badge, vibrate, url, data)
*   `SendResult` (success, error status, raw result)

#### [index.ts (Server)](file:///Users/nicksol/Desktop/2026/PNS/src/server/index.ts)
*   `PushNotificationServer` class.
*   Constructor accepts `VapidConfig` configuration rather than relying on hardcoded environment variables, enabling reuse in different codebases.
*   `sendNotification(subscription: PushSubscription, payload: NotificationPayload): Promise<SendResult>` with proper catching of status code `410` (Gone) and `404` (Not Found).
*   `sendBulk(subscriptions: PushSubscription[], payload: NotificationPayload): Promise<PromiseSettledResult<SendResult>[]>` for batch processing.

#### [index.ts (Client)](file:///Users/nicksol/Desktop/2026/PNS/src/client/index.ts)
*   `PushNotificationClient` class.
*   Constructor accepts `publicVapidKey: string` and optional `serviceWorkerPath` (defaulting to `/sw.js`).
*   `subscribe(): Promise<PushSubscription>`:
    *   Checks feature support (`serviceWorker` and `PushManager`).
    *   Registers/waits for Service Worker.
    *   Requests permission.
    *   Converts Base64 VAPID key to `Uint8Array`.
    *   Returns JSON subscription object.

#### [sw.ts](file:///Users/nicksol/Desktop/2026/PNS/src/sw/sw.ts)
Service worker implementation in TypeScript, compiled to JavaScript. Handles standard `'push'` and `'notificationclick'` events.

#### [generate-keys.ts](file:///Users/nicksol/Desktop/2026/PNS/bin/generate-keys.ts)
Script to generate and log fresh public/private VAPID key pairs.

---

### Verification/Demo Rig

#### [server.ts](file:///Users/nicksol/Desktop/2026/PNS/demo/server.ts)
An Express application serving the demo frontend and providing two API endpoints:
1.  `POST /api/subscribe`: Accepts a browser subscription and saves it to an in-memory/JSON DB.
2.  `POST /api/notify-all`: Triggers a push notification to all stored subscriptions using the Server SDK, demonstrating batch sending and cleanup of `GONE` subscriptions.

#### [index.html](file:///Users/nicksol/Desktop/2026/PNS/demo/public/index.html)
A dynamic, beautifully styled UI for testing:
*   Button to trigger subscription prompt.
*   Subscription state indicator showing active details.
*   Button/form to trigger a notification request to the server.

---

## Verification Plan

### Automated Verification
*   Compile TypeScript using `tsc` to verify static typing correctness:
    ```bash
    npm run build
    ```
*   Run the key generation script:
    ```bash
    npx ts-node bin/generate-keys.ts
    ```

### Manual Verification
*   Start the Express server locally:
    ```bash
    npm run demo
    ```
*   Open the app in Chrome/Firefox at `http://localhost:3000`.
*   Grant notification permission and subscribe.
*   Click the notify button to test notification delivery and see the popup.
*   Revoke permission or manually delete the subscription from Chrome DevTools, then trigger another notification to verify that the Server SDK catches the `410 Gone` error and prunes the subscriber.
