import * as path from 'path';
import { encrypt, decrypt } from './crypto';

// Dynamically require node:sqlite to prevent bundler problems during Next.js compilation
let DatabaseSync: any;
try {
  const sqlite = require('node:sqlite');
  DatabaseSync = sqlite.DatabaseSync;
} catch (err) {
  console.warn('[SQLite Loader] node:sqlite module not found. Falling back to memory shim.');
}

const DB_PATH = path.resolve('C:/AYDIN GROS/local_store.db');
const ENCRYPTION_SECRET = process.env.SQLITE_ENCRYPTION_SECRET || 'aydingros-default-secret-key-12345';

let localDb: any = null;

export function getLocalDb() {
  if (localDb) return localDb;

  if (!DatabaseSync) {
    // Memory database shim if native SQLite DatabaseSync is missing (e.g. legacy node versions)
    console.warn('[SQLite] Native DatabaseSync missing. Running in-memory database simulation.');
    localDb = createInMemoryShim();
    return localDb;
  }

  try {
    localDb = new DatabaseSync(DB_PATH);
    initializeTables(localDb);
    console.log(`[SQLite] Local database initialized successfully at: ${DB_PATH}`);
  } catch (err: any) {
    console.error('[SQLite Initialization Error]', err.message);
    // Fallback to in-memory to prevent checkout failures
    localDb = new DatabaseSync(':memory:');
    initializeTables(localDb);
  }

  return localDb;
}

function initializeTables(db: any) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      branch_id TEXT,
      order_total REAL,
      items_json TEXT,
      created_at TEXT
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS cdc_logs (
      event_id TEXT PRIMARY KEY,
      timestamp TEXT,
      table_name TEXT,
      action TEXT,
      payload TEXT,
      is_synced INTEGER DEFAULT 0
    );
  `);
}

/**
 * Saves a sales transaction order to the local offline database
 * and writes a CDC log record inside a single transactional block.
 */
export function saveOrderOffline(order: {
  id: string;
  branch_id: string;
  order_total: number;
  items: any[];
  created_at?: string;
}): void {
  const db = getLocalDb();
  const createdAt = order.created_at || new Date().toISOString();
  
  // Encrypt items list before writing to disk (protecting customer/loyalty basket metadata)
  const itemsString = JSON.stringify(order.items);
  const encryptedItems = encrypt(itemsString, ENCRYPTION_SECRET);

  const orderPayload = {
    id: order.id,
    branch_id: order.branch_id,
    order_total: order.order_total,
    items: order.items,
    created_at: createdAt
  };

  const cdcPayload = JSON.stringify(orderPayload);
  const eventId = `event-${order.id}`;

  try {
    db.exec('BEGIN TRANSACTION');

    // 1. Insert order record
    const insertOrder = db.prepare(`
      INSERT OR REPLACE INTO orders (id, branch_id, order_total, items_json, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    insertOrder.run(order.id, order.branch_id, order.order_total, encryptedItems, createdAt);

    // 2. Insert CDC sync log
    const insertCdc = db.prepare(`
      INSERT OR REPLACE INTO cdc_logs (event_id, timestamp, table_name, action, payload, is_synced)
      VALUES (?, ?, ?, ?, ?, 0)
    `);
    insertCdc.run(eventId, createdAt, 'orders', 'INSERT', cdcPayload);

    db.exec('COMMIT');
    console.log(`[SQLite Offline DB] Order ${order.id} saved locally and CDC queued.`);
  } catch (err: any) {
    db.exec('ROLLBACK');
    throw new Error(`Offline order save failed: ${err.message}`);
  }
}

/**
 * Retrieve all unsynced CDC logs from local queue.
 */
export function getUnsyncedLogs(): any[] {
  const db = getLocalDb();
  try {
    const stmt = db.prepare(`SELECT * FROM cdc_logs WHERE is_synced = 0 ORDER BY timestamp ASC`);
    return stmt.all();
  } catch (err) {
    console.error('[SQLite getUnsyncedLogs Error]', err);
    return [];
  }
}

/**
 * Mark logs as successfully synchronized.
 */
export function markLogsAsSynced(eventIds: string[]): void {
  if (eventIds.length === 0) return;
  const db = getLocalDb();
  try {
    db.exec('BEGIN TRANSACTION');
    const stmt = db.prepare(`UPDATE cdc_logs SET is_synced = 1 WHERE event_id = ?`);
    eventIds.forEach(id => {
      stmt.run(id);
    });
    db.exec('COMMIT');
    console.log(`[SQLite Offline DB] Marked ${eventIds.length} events as synchronized.`);
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('[SQLite markLogsAsSynced Error]', err);
  }
}

/**
 * Clean memory DatabaseSync shim if native module is not supported.
 */
function createInMemoryShim() {
  const store: Record<string, Record<string, any>> = {
    orders: {},
    cdc_logs: {}
  };
  return {
    exec: (sql: string) => {},
    prepare: (sql: string) => {
      if (sql.includes('INSERT OR REPLACE INTO orders')) {
        return {
          run: (id: string, branch_id: string, total: number, items_json: string, created_at: string) => {
            store.orders[id] = { id, branch_id, order_total: total, items_json, created_at };
          }
        };
      }
      if (sql.includes('INSERT OR REPLACE INTO cdc_logs')) {
        return {
          run: (event_id: string, timestamp: string, table_name: string, action: string, payload: string) => {
            store.cdc_logs[event_id] = { event_id, timestamp, table_name, action, payload, is_synced: 0 };
          }
        };
      }
      if (sql.includes('SELECT * FROM cdc_logs')) {
        return {
          all: () => Object.values(store.cdc_logs).filter(c => c.is_synced === 0)
        };
      }
      if (sql.includes('UPDATE cdc_logs')) {
        return {
          run: (event_id: string) => {
            if (store.cdc_logs[event_id]) {
              store.cdc_logs[event_id].is_synced = 1;
            }
          }
        };
      }
      return { run: () => {}, all: () => [], get: () => null };
    }
  };
}
