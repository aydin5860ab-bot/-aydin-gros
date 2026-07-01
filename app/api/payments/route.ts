import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { checkAuth } from '@/lib/auth';
import { stockLock } from '@/lib/lock';
import { createMockSupabaseClient } from '@/lib/db';

const TENANT = process.env.DEFAULT_TENANT_ID ?? '11111111-1111-1111-1111-111111111111';

export async function GET(req: NextRequest) {
  const auth = await checkAuth(req);
  if (!auth.isAuthenticated) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 });
  }

  const tenantId = auth.tenantId || TENANT;
  let db: any = createAdminClient();
  if (process.env.FORCE_JSON_DB === 'true') {
    db = createMockSupabaseClient(tenantId);
  }
  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get('order_id');

  if (orderId) {
    const { data, error } = await db
      .from('sale_payments')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('order_id', orderId)
      .order('created_at');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  }

  return NextResponse.json({ error: 'order_id gerekli' }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const auth = await checkAuth(req);
  if (!auth.isAuthenticated) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 });
  }

  const tenantId = auth.tenantId || TENANT;
  let db: any = createAdminClient();
  if (process.env.FORCE_JSON_DB === 'true') {
    db = createMockSupabaseClient(tenantId);
  }
  const body = await req.json();

  // ── Karma ödeme kaydet ──────────────────────────────────────────────────
  // body.payments = [{ method: 'cash', amount: 50 }, { method: 'card', amount: 30 }]
  // body.order_id, body.order_total, body.session_id, body.cashier_email
  const { order_id, order_total, payments, session_id, cashier_email, items } = body;

  if (!order_id || !payments?.length) {
    return NextResponse.json({ error: 'order_id ve payments zorunlu' }, { status: 400 });
  }

  type Payment = { method: string; amount: number; reference?: string };

  const totalPaid = (payments as Payment[]).reduce((s, p) => s + p.amount, 0);
  const orderTotal = order_total ?? totalPaid;

  if (totalPaid < orderTotal - 0.01) {
    return NextResponse.json(
      { error: `Eksik ödeme: ₺${(orderTotal - totalPaid).toFixed(2)} eksik` },
      { status: 400 }
    );
  }

  const change = Math.max(0, totalPaid - orderTotal);

  // Stok kontrol et ve düş
  if (items?.length) {
    const release = await stockLock.acquire();
    try {
      const demands: Record<number, number> = {};
      const itemNames: Record<number, string> = {};
      for (const item of items) {
        const pid = Number(item.id || item.product_legacy_id);
        const quantity = Number(item.qty || item.quantity || 1);
        if (!isNaN(pid) && pid > 0) {
          demands[pid] = (demands[pid] || 0) + quantity;
          itemNames[pid] = item.name || `Ürün #${pid}`;
        }
      }

      const productIds = Object.keys(demands).map(Number);
      if (productIds.length > 0) {
        // 1. Stokları sorgula
        const activeBranch = '22222222-2222-2222-2222-222222222222';
        const { data: stocks, error: stockError } = await db
          .from('product_stock')
          .select('product_legacy_id, qty')
          .eq('tenant_id', tenantId)
          .in('product_legacy_id', productIds);

        if (stockError) {
          return NextResponse.json({ error: 'Stok sorgulama hatası: ' + stockError.message }, { status: 500 });
        }

        const stockMap: Record<number, number> = {};
        (stocks || []).forEach((s: any) => {
          stockMap[s.product_legacy_id] = s.qty || 0;
        });

        // 2. Yetersiz stok kontrolü
        for (const pid of productIds) {
          const demand = demands[pid];
          const currentStock = stockMap[pid] ?? 0;
          if (currentStock < demand) {
            return NextResponse.json(
              { error: `Stok yetersiz: ${itemNames[pid]} (Talep: ${demand}, Mevcut Stok: ${currentStock})` },
              { status: 400 }
            );
          }
        }

        // 3. Stokları düş
        for (const pid of productIds) {
          const demand = demands[pid];
          const currentStock = stockMap[pid] ?? 0;
          const newStock = currentStock - demand;

          const { error: updateError } = await db
            .from('product_stock')
            .update({ qty: newStock, updated_at: new Date().toISOString() })
            .eq('tenant_id', tenantId)
            .eq('branch_id', activeBranch)
            .eq('product_legacy_id', pid);

          if (updateError) {
            // Fallback: branch_id olmadan dene
            const { error: fbErr } = await db
              .from('product_stock')
              .update({ qty: newStock, updated_at: new Date().toISOString() })
              .eq('tenant_id', tenantId)
              .eq('product_legacy_id', pid);
            if (fbErr) {
              return NextResponse.json({ error: `Stok güncelleme hatası (${itemNames[pid]}): ` + fbErr.message }, { status: 500 });
            }
          }
        }
      }
    } finally {
      release();
    }
  }

  // Order'ı kaydet
  const orderNumber = `POS-${Date.now().toString().slice(-8)}`;
  const { data: order, error: orderError } = await db
    .from('orders')
    .insert({
      tenant_id: tenantId,
      id: order_id,
      order_number: orderNumber,
      channel: 'pos',
      subtotal: orderTotal,
      total: orderTotal,
      payment_method: payments.length > 1 ? 'mixed' : (payments[0] as Payment).method,
      mixed_payment: payments.length > 1,
      session_id: session_id ?? null,
      items_data: items ?? [],
      status: 'completed',
      source: 'pos',
    })
    .select()
    .single();

  if (orderError) {
    // Order zaten var (idempotent retry) — devam et
    if (!orderError.message.includes('duplicate')) {
      return NextResponse.json({ error: orderError.message }, { status: 500 });
    }
  }

  // Ödeme detaylarını kaydet
  const paymentRows = (payments as Payment[]).map((p) => ({
    tenant_id: tenantId,
    order_id,
    session_id: session_id ?? null,
    payment_method: p.method,
    amount: p.amount,
    reference: p.reference ?? null,
    cashier_email: cashier_email ?? null,
  }));

  await db.from('sale_payments').insert(paymentRows);

  // Audit log
  try {
    await db.from('audit_logs').insert({
      tenant_id: tenantId,
      user_email: cashier_email,
      action: 'process_payment',
      entity: 'order',
      entity_id: order_id,
      new_data: {
        total: orderTotal,
        paid: totalPaid,
        change,
        methods: (payments as Payment[]).map((p) => `${p.method}:${p.amount}`).join(', '),
      },
    });
  } catch (e) {}

  return NextResponse.json({
    ok: true,
    order_id,
    total: orderTotal,
    paid: totalPaid,
    change,
    payments: paymentRows,
  });
}
