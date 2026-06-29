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
  const page = parseInt(searchParams.get('page') ?? '0');
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 100);

  if (orderId) {
    const { data, error } = await db
      .from('sale_exchanges')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('original_order_id', orderId)
      .order('created_at', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  }

  const { data, error } = await db
    .from('sale_exchanges')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .range(page * limit, (page + 1) * limit - 1);

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
  const {
    order_id,
    return_items,
    new_items,
    payment_method,
    notes,
    cashier_email,
  } = body;

  if (!order_id || !return_items?.length || !new_items?.length) {
    return NextResponse.json(
      { error: 'order_id, return_items ve new_items zorunlu' },
      { status: 400 }
    );
  }

  type Item = { price: number; qty: number; name: string };

  const returnTotal = (return_items as Item[]).reduce((s, i) => s + i.price * i.qty, 0);
  const newTotal = (new_items as Item[]).reduce((s, i) => s + i.price * i.qty, 0);
  const difference = newTotal - returnTotal;

  const exchangeNo = `DEG-${Date.now().toString().slice(-6)}`;

  const { data: exchangeRecord, error } = await db
    .from('sale_exchanges')
    .insert({
      tenant_id: tenantId,
      original_order_id: order_id,
      exchange_no: exchangeNo,
      return_items,
      new_items,
      return_total: returnTotal,
      new_total: newTotal,
      difference,
      payment_method: payment_method ?? null,
      status: 'completed',
      processed_by: cashier_email ?? null,
      notes: notes ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    await db.from('audit_logs').insert({
      tenant_id: tenantId,
      user_email: cashier_email,
      action: 'product_exchange',
      entity: 'order',
      entity_id: order_id,
      new_data: {
        exchange_no: exchangeNo,
        return_total: returnTotal,
        new_total: newTotal,
        difference,
      },
    });
  } catch (e) {}

  return NextResponse.json({
    ok: true,
    exchange_no: exchangeNo,
    exchange_id: exchangeRecord?.id,
    return_total: returnTotal,
    new_total: newTotal,
    difference,
    // Pozitif: müşteri ödeme yapar, negatif: müşteriye iade yapılır
    action_required: difference > 0 ? 'customer_pays' : difference < 0 ? 'refund_customer' : 'even',
  });
}
