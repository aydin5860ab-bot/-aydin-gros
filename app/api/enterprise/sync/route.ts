import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/server';
import { readCollection, writeCollection } from '@/lib/db';

const TENANT = process.env.DEFAULT_TENANT_ID ?? '11111111-1111-1111-1111-111111111111';

export async function POST(req: NextRequest) {
  const auth = await checkAuth(req);
  if (!auth.isAuthenticated) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 });
  }

  const db = createAdminClient();
  if (!db) {
    return NextResponse.json({ error: 'Database bağlantısı bulunamadı' }, { status: 500 });
  }

  const tenantId = auth.tenantId || TENANT;

  try {
    const body = await req.json();
    const { logs } = body;

    if (!Array.isArray(logs) || logs.length === 0) {
      return NextResponse.json({ synced_event_ids: [] });
    }

    const syncedEventIds: string[] = [];

    // Read active cloud collections for conflict checking
    const orders = await readCollection<any>('orders', tenantId, db);
    const stockList = await readCollection<any>('stock', tenantId, db);

    for (const log of logs) {
      const payload = typeof log.payload === 'string' ? JSON.parse(log.payload) : log.payload;
      
      if (log.table_name === 'orders') {
        const orderId = payload.id;

        // 1. Idempotency Check: if order is already marked synced, skip save but return success
        const existingOrder = orders.find(o => o.id === orderId);

        if (existingOrder) {
          // 2. Conflict Resolution (Newest Write Wins)
          const localTime = new Date(payload.created_at || log.timestamp).getTime();
          const cloudTime = new Date(existingOrder.updated_at || existingOrder.created_at).getTime();

          if (cloudTime > localTime) {
            console.log(`[Sync Engine] Conflict detected for order ${orderId}. Cloud is newer. Skipping upsert.`);
            syncedEventIds.push(log.event_id);
            continue;
          }
        }

        // 3. Upsert order details
        const updatedOrders = orders.filter(o => o.id !== orderId);
        updatedOrders.push({
          tenant_id: tenantId,
          ...payload,
          updated_at: new Date().toISOString()
        });
        await writeCollection('orders', updatedOrders, tenantId, db);

        // 4. Update Stock levels (Decrement sold items)
        if (Array.isArray(payload.items)) {
          payload.items.forEach((item: any) => {
            const pid = item.product_id || item.id;
            const branchId = payload.branch_id;
            // Match stock record
            const stockRecord = stockList.find(s => s.product_id === pid && s.branch_id === branchId);
            if (stockRecord) {
              stockRecord.qty = Math.max(0, (stockRecord.qty || 0) - (item.quantity || item.qty || 1));
              stockRecord.updated_at = new Date().toISOString();
            }
          });
          await writeCollection('stock', stockList, tenantId, db);
        }

        syncedEventIds.push(log.event_id);
      }
    }

    return NextResponse.json({ synced_event_ids: syncedEventIds });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
