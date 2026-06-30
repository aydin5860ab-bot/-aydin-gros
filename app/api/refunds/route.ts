import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { checkAuth } from '@/lib/auth';

const TENANT = process.env.DEFAULT_TENANT_ID ?? '11111111-1111-1111-1111-111111111111';

export async function GET(req: NextRequest) {
  const auth = await checkAuth(req);
  if (!auth.isAuthenticated) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 });
  }

  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: 'DB bağlantısı yok' }, { status: 500 });

  const tenantId = auth.tenantId || TENANT;
  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get('order_id');
  const status = searchParams.get('status');
  const page = parseInt(searchParams.get('page') ?? '0');
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 100);

  if (orderId) {
    const { data, error } = await db
      .from('sale_returns')
      .select('*, sale_return_items(*)')
      .eq('tenant_id', tenantId)
      .eq('original_order_id', orderId)
      .order('created_at', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  }

  let query = db
    .from('sale_returns')
    .select('*, sale_return_items(*)')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .range(page * limit, (page + 1) * limit - 1);

  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const auth = await checkAuth(req);
  if (!auth.isAuthenticated) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 });
  }

  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: 'DB bağlantısı yok' }, { status: 500 });

  const tenantId = auth.tenantId || TENANT;
  const body = await req.json();
  const { action } = body;

  // ── Satış iptal (tam iade) ──────────────────────────────────────────────
  if (action === 'cancel_order') {
    const { order_id, reason, cashier_email } = body;
    if (!order_id) return NextResponse.json({ error: 'order_id zorunlu' }, { status: 400 });

    // Siparişi bul
    const { data: order, error: orderErr } = await db
      .from('orders')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', order_id)
      .maybeSingle();

    if (orderErr || !order) return NextResponse.json({ error: 'Sipariş bulunamadı' }, { status: 404 });
    if (order.is_cancelled) return NextResponse.json({ error: 'Sipariş zaten iptal edilmiş' }, { status: 400 });

    // Siparişi iptal et
    await db.from('orders').update({
      is_cancelled: true,
      cancel_reason: reason ?? 'Kasiyer iptali',
      cancelled_at: new Date().toISOString(),
      cancelled_by: cashier_email ?? null,
    }).eq('id', order_id).eq('tenant_id', tenantId);

    // İade kaydı oluştur
    const returnNo = `IAD-${Date.now().toString().slice(-6)}`;
    const items: any[] = order.items_data ?? order.items ?? [];
    const totalRefund = order.total ?? 0;

    const { data: returnRecord } = await db.from('sale_returns').insert({
      tenant_id: tenantId,
      original_order_id: order_id,
      session_id: order.session_id ?? null,
      return_no: returnNo,
      return_reason: reason ?? 'Kasiyer iptali — tam iade',
      refund_method: order.payment_method === 'card' ? 'card' : 'cash',
      total_refund: totalRefund,
      status: 'completed',
      processed_by: cashier_email ?? null,
    }).select().single();

    // İade kalemlerini kaydet
    if (returnRecord && items.length > 0) {
      await db.from('sale_return_items').insert(
        items.map((i) => ({
          return_id: returnRecord.id,
          tenant_id: tenantId,
          product_name: i.name,
          qty: i.qty,
          unit_price: i.price,
          subtotal: i.price * i.qty,
          restock: true,
        }))
      );
    }

    // Stok geri gelsin
    if (items.length > 0) {
      const activeBranch = '22222222-2222-2222-2222-222222222222';
      for (const i of items) {
        const pid = Number(i.id || i.product_legacy_id);
        const qty = Number(i.qty || i.quantity || 1);
        if (!isNaN(pid) && pid > 0) {
          // 1. Mevcut stoğu çek
          const { data: stockRecord } = await db
            .from('product_stock')
            .select('qty')
            .eq('tenant_id', tenantId)
            .eq('product_legacy_id', pid)
            .maybeSingle();

          const currentStock = stockRecord ? Number(stockRecord.qty) : 0;
          const newStock = currentStock + qty;

          // 2. Güncelle
          const { error: updateError } = await db
            .from('product_stock')
            .update({ qty: newStock, updated_at: new Date().toISOString() })
            .eq('tenant_id', tenantId)
            .eq('branch_id', activeBranch)
            .eq('product_legacy_id', pid);

          if (updateError) {
            // Fallback: branch_id olmadan dene
            await db
              .from('product_stock')
              .update({ qty: newStock, updated_at: new Date().toISOString() })
              .eq('tenant_id', tenantId)
              .eq('product_legacy_id', pid);
          }
        }
      }
    }

    try {
      await db.from('audit_logs').insert({
        tenant_id: tenantId,
        user_email: cashier_email,
        action: 'cancel_order',
        entity: 'order',
        entity_id: order_id,
        new_data: { return_no: returnNo, total_refund: totalRefund },
      });
    } catch (e) {}

    return NextResponse.json({
      ok: true,
      return_no: returnNo,
      total_refund: totalRefund,
      refund_method: returnRecord?.refund_method,
    });
  }

  // ── Kısmi iade ────────────────────────────────────────────────────────────
  if (action === 'partial_return') {
    const { order_id, items, refund_method, reason, cashier_email } = body;

    if (!order_id || !items?.length) {
      return NextResponse.json({ error: 'order_id ve items zorunlu' }, { status: 400 });
    }

    const totalRefund = (items as { price: number; qty: number }[])
      .reduce((s, i) => s + i.price * i.qty, 0);

    const returnNo = `IAD-${Date.now().toString().slice(-6)}`;

    // Siparişi bulup session_id'sini al
    const { data: order } = await db
      .from('orders')
      .select('session_id')
      .eq('tenant_id', tenantId)
      .eq('id', order_id)
      .maybeSingle();

    const { data: returnRecord } = await db.from('sale_returns').insert({
      tenant_id: tenantId,
      original_order_id: order_id,
      session_id: order?.session_id ?? null,
      return_no: returnNo,
      return_reason: reason ?? 'Kısmi iade',
      refund_method: refund_method ?? 'cash',
      total_refund: totalRefund,
      status: 'completed',
      processed_by: cashier_email ?? null,
    }).select().single();

    if (returnRecord) {
      await db.from('sale_return_items').insert(
        (items as { name: string; qty: number; price: number; product_id?: number }[]).map((i) => ({
          return_id: returnRecord.id,
          tenant_id: tenantId,
          product_legacy_id: i.product_id ?? null,
          product_name: i.name,
          qty: i.qty,
          unit_price: i.price,
          subtotal: i.price * i.qty,
          restock: true,
        }))
      );
    }

    // Stok geri gelsin
    if (items.length > 0) {
      const activeBranch = '22222222-2222-2222-2222-222222222222';
      for (const i of items) {
        const pid = Number(i.product_id || i.id || i.product_legacy_id);
        const qty = Number(i.qty || i.quantity || 1);
        if (!isNaN(pid) && pid > 0) {
          // 1. Mevcut stoğu çek
          const { data: stockRecord } = await db
            .from('product_stock')
            .select('qty')
            .eq('tenant_id', tenantId)
            .eq('product_legacy_id', pid)
            .maybeSingle();

          const currentStock = stockRecord ? Number(stockRecord.qty) : 0;
          const newStock = currentStock + qty;

          // 2. Güncelle
          const { error: updateError } = await db
            .from('product_stock')
            .update({ qty: newStock, updated_at: new Date().toISOString() })
            .eq('tenant_id', tenantId)
            .eq('branch_id', activeBranch)
            .eq('product_legacy_id', pid);

          if (updateError) {
            // Fallback: branch_id olmadan dene
            await db
              .from('product_stock')
              .update({ qty: newStock, updated_at: new Date().toISOString() })
              .eq('tenant_id', tenantId)
              .eq('product_legacy_id', pid);
          }
        }
      }
    }

    try {
      await db.from('audit_logs').insert({
        tenant_id: tenantId,
        user_email: cashier_email,
        action: 'partial_return',
        entity: 'order',
        entity_id: order_id,
        new_data: { return_no: returnNo, total_refund: totalRefund, items_count: items.length },
      });
    } catch (e) {}

    return NextResponse.json({
      ok: true,
      return_no: returnNo,
      total_refund: totalRefund,
      return_id: returnRecord?.id,
    });
  }

  return NextResponse.json({ error: 'Bilinmeyen action' }, { status: 400 });
}
