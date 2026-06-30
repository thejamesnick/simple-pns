export interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface VapidConfig {
  /**
   * Contact URI for the push service to reach you if needed.
   * Can be a `mailto:` email address or an `https:` website URL.
   * e.g. 'mailto:admin@example.com' or 'https://example.com'
   */
  contact: string;
  /** VAPID public key (URL-safe base64). */
  publicKey: string;
  /** VAPID private key (URL-safe base64). */
  privateKey: string;
}

export interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  vibrate?: number[];
  url?: string;
  data?: Record<string, any>;
}

export interface SendResult {
  success: boolean;
  error?: "GONE" | "ERROR" | string;
  subscription?: PushSubscription;
  result?: any;
}
