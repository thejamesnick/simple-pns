/**
 * SqliteStore — SQLite-backed SubscriptionStore
 * ─────────────────────────────────────────────
 * Production-ready adapter using better-sqlite3 (synchronous,
 * zero-config, no server needed).
 *
 * Install:
 *   npm install better-sqlite3
 *   npm install -D @types/better-sqlite3
 *
 * Usage:
 * ```ts
 * const store = new SqliteStore('./subscriptions.db');
 * await store.save(subscription);
 * const all = await store.findAll();
 * ```
 */

import Database from 'better-sqlite3';
import type { PushSubscription } from '../../src/types';
import type { SubscriptionStore } from './SubscriptionStore';

export class SqliteStore implements SubscriptionStore {
  private db: Database.Database;

  constructor(dbPath: string = './pns-subscriptions.db') {
    this.db = new Database(dbPath);

    // Enable WAL mode for better concurrent read performance
    this.db.pragma('journal_mode = WAL');

    // Create the table if it doesn't exist
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        endpoint TEXT PRIMARY KEY,
        p256dh   TEXT NOT NULL,
        auth     TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  async save(subscription: PushSubscription): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO subscriptions (endpoint, p256dh, auth)
      VALUES (?, ?, ?)
    `);

    stmt.run(
      subscription.endpoint,
      subscription.keys.p256dh,
      subscription.keys.auth,
    );
  }

  async findByEndpoint(endpoint: string): Promise<PushSubscription | null> {
    const row = this.db
      .prepare('SELECT * FROM subscriptions WHERE endpoint = ?')
      .get(endpoint) as Row | undefined;

    if (!row) return null;

    return {
      endpoint: row.endpoint,
      keys: {
        p256dh: row.p256dh,
        auth: row.auth,
      },
    };
  }

  async findAll(): Promise<PushSubscription[]> {
    const rows = this.db.prepare('SELECT * FROM subscriptions').all() as Row[];

    return rows.map((row) => ({
      endpoint: row.endpoint,
      keys: {
        p256dh: row.p256dh,
        auth: row.auth,
      },
    }));
  }

  async deleteByEndpoint(endpoint: string): Promise<boolean> {
    const result = this.db
      .prepare('DELETE FROM subscriptions WHERE endpoint = ?')
      .run(endpoint);

    return result.changes > 0;
  }

  async count(): Promise<number> {
    const row = this.db
      .prepare('SELECT COUNT(*) as count FROM subscriptions')
      .get() as { count: number };

    return row.count;
  }

  /** Close the database connection (call on shutdown). */
  close(): void {
    this.db.close();
  }
}

interface Row {
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
}
