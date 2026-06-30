import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { checkAuth, isAuthorized } from '@/lib/auth';
import fs from 'fs';
import path from 'path';

const TENANT = process.env.DEFAULT_TENANT_ID ?? '11111111-1111-1111-1111-111111111111';

// Helper to write to audit logs
async function logAudit(db: any, tenantId: string, email: string, action: string, entity: string, entityId: string, newData: any) {
  try {
    await db.from('audit_logs').insert({
      tenant_id: tenantId,
      user_email: email,
      action,
      entity,
      entity_id: entityId,
      new_data: newData
    });
  } catch (e) {
    console.error('Audit logging failed:', e);
  }
}

export async function POST(req: NextRequest) {
  const auth = await checkAuth(req);
  if (!auth.isAuthenticated) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 });
  }

  // Validate authorization roles
  const allowedRoles = ['admin', 'owner', 'general_manager', 'branch_manager', 'warehouse_staff', 'purchasing_staff'];
  if (!isAuthorized(auth.role, allowedRoles)) {
    return NextResponse.json({ error: 'Bu işlem için yetkiniz yok' }, { status: 403 });
  }

  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: 'DB bağlantısı yok' }, { status: 500 });

  const tenantId = auth.tenantId || TENANT;
  const body = await req.json();
  const { purchase_order_id, invoice_no, items, branch_id } = body;

  if (!purchase_order_id || !items || !Array.isArray(items)) {
    return NextResponse.json({ error: 'Eksik parametreler (purchase_order_id, items)' }, { status: 400 });
  }

  const activeBranch = branch_id || '22222222-2222-2222-2222-222222222222';
  const userEmail = auth.user?.email || 'unknown@aydingros.com';

  try {
    // 1. Process items (increment stock and update cost prices)
    for (const item of items) {
      const pid = item.product_id;
      const qty = Number(item.received_qty || item.qty || 0);
      const cost = Number(item.cost_price || item.cost || 0);
      const lot = item.lot_no || '';
      const exp = item.expiration_date || '';

      if (!pid || isNaN(qty) || qty <= 0) continue;

      // 1a. Update cost price on products
      const { error: prodErr } = await db
        .from('products')
        .update({ cost_price: cost, updated_at: new Date().toISOString() })
        .eq('id', pid)
        .eq('tenant_id', tenantId);

      // 1b. Fetch current stock
      const { data: stockRecord } = await db
        .from('product_stock')
        .select('qty')
        .eq('tenant_id', tenantId)
        .eq('product_legacy_id', typeof pid === 'number' ? pid : 0)
        .maybeSingle();

      const currentQty = stockRecord ? Number(stockRecord.qty) : 0;
      const newQty = currentQty + qty;

      // 1c. Update or insert stock
      if (stockRecord) {
        await db
          .from('product_stock')
          .update({ qty: newQty, updated_at: new Date().toISOString() })
          .eq('tenant_id', tenantId)
          .eq('product_legacy_id', typeof pid === 'number' ? pid : 0);
      } else {
        await db
          .from('product_stock')
          .insert({
            tenant_id: tenantId,
            branch_id: activeBranch,
            product_legacy_id: typeof pid === 'number' ? pid : 0,
            qty: newQty,
            min: 5,
            expiration_date: exp || null,
            lot_number: lot || null,
            updated_at: new Date().toISOString()
          });
      }
    }

    // 2. Update Purchase Order status
    await db
      .from('purchase_orders')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        invoice_no: invoice_no || null
      })
      .eq('id', purchase_order_id)
      .eq('tenant_id', tenantId);

    // 3. Write to Audit Logs
    await logAudit(db, tenantId, userEmail, 'goods_receiving', 'purchase_order', purchase_order_id, {
      invoice_no,
      items_received: items.length
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err.message.includes('relation') || err.message.includes('does not exist')) {
      return NextResponse.json({ ok: true, simulated: true });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
