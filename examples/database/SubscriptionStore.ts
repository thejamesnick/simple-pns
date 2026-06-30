/**
 * SubscriptionStore — Database Adapter Interface
 * ─────────────────────────────────────────────
 * Implement this interface to persist push subscriptions
 * in any database (SQLite, Postgres, MySQL, MongoDB, etc.).
 *
 * The PNS Server SDK doesn't manage subscriptions itself —
 * that's your job. This interface gives you a contract to
 * build your own storage layer.
 */

import type { PushSubscription } from '../../src/types';

export interface SubscriptionStore {
  /**
   * Save a new subscription or update an existing one
   * (by endpoint, which is unique per browser).
   */
  save(subscription: PushSubscription): Promise<void>;

  /**
   * Find a subscription by its endpoint URL.
   * Returns `null` if not found.
   */
  findByEndpoint(endpoint: string): Promise<PushSubscription | null>;

  /**
   * Return every active subscription (for broadcasting).
   */
  findAll(): Promise<PushSubscription[]>;

  /**
   * Delete a subscription by endpoint (e.g. when we get 410 Gone).
   * Returns `true` if a row was actually deleted.
   */
  deleteByEndpoint(endpoint: string): Promise<boolean>;

  /**
   * Total number of stored subscriptions.
   */
  count(): Promise<number>;
}
