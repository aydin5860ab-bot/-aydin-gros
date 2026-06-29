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

  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: 'DB bağlantısı yok' }, { status: 500 });

  const tenantId = auth.tenantId || TENANT;
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

  // Order'ı kaydet
  const { data: order, error: orderError } = await db
    .from('orders')
    .insert({
      tenant_id: tenantId,
      id: order_id,
      total: orderTotal,
      payment_method: payments.length > 1 ? 'mixed' : (payments[0] as Payment).method,
      mixed_payment: payments.length > 1,
      session_id: session_id ?? null,
      items: items ?? [],
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
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    order_id,
    total: orderTotal,
    paid: totalPaid,
    change,
    payments: paymentRows,
  });
}
