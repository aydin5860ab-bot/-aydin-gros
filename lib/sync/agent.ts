import { getUnsyncedLogs, markLogsAsSynced } from './sqlite';

export class StoreSyncAgent {
  private apiUrl: string;
  private intervalMs: number;
  private timer: NodeJS.Timeout | null = null;
  private isSyncing = false;
  private getAuthHeaderFn: () => Promise<Record<string, string>>;

  constructor(config: {
    apiUrl: string;
    intervalMs?: number;
    getAuthHeader: () => Promise<Record<string, string>>;
  }) {
    this.apiUrl = config.apiUrl;
    this.intervalMs = config.intervalMs || 5000;
    this.getAuthHeaderFn = config.getAuthHeader;
  }

  /**
   * Starts the polling agent background sync loop.
   */
  start(): void {
    if (this.timer) return;
    console.log(`[Sync Agent] Background sync agent started (Interval: ${this.intervalMs}ms)`);
    this.timer = setInterval(() => {
      this.syncNow();
    }, this.intervalMs);
  }

  /**
   * Stops the sync agent.
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('[Sync Agent] Background sync agent stopped.');
    }
  }

  /**
   * Executes a manual synchronization batch immediately.
   */
  async syncNow(): Promise<number> {
    if (this.isSyncing) return 0;
    
    const logs = getUnsyncedLogs();
    if (logs.length === 0) return 0;

    this.isSyncing = true;
    console.log(`[Sync Agent] Found ${logs.length} unsynced CDC logs. Initiating upload...`);

    try {
      const headers = await this.getAuthHeaderFn();
      const res = await fetch(`${this.apiUrl}/api/enterprise/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        body: JSON.stringify({ logs })
      });

      if (!res.ok) {
        throw new Error(`Sync API responded with status: ${res.status}`);
      }

      const result = await res.json();
      const syncedIds = result.synced_event_ids || [];

      if (syncedIds.length > 0) {
        markLogsAsSynced(syncedIds);
        console.log(`[Sync Agent] Successfully synchronized ${syncedIds.length} events.`);
        return syncedIds.length;
      }
      return 0;
    } catch (err: any) {
      console.error('[Sync Agent Error] Upload failed:', err.message);
      return 0;
    } finally {
      this.isSyncing = false;
    }
  }
}
