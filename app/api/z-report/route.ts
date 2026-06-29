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
  const action = searchParams.get('action') ?? 'list';
  const sessionId = searchParams.get('session_id');

  // Kaydedilmiş raporları listele
  if (action === 'list') {
    const { data, error } = await db
      .from('z_reports')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  }

  // Anlık önizleme (kaydetme) — mevcut vardiyayı hesapla
  if (action === 'preview') {
    const preview = await buildReportData(db, sessionId ?? null, tenantId);
    return NextResponse.json(preview);
  }

  // Tek rapor detayı
  const reportId = searchParams.get('id');
  if (reportId) {
    const { data } = await db.from('z_reports').select('*').eq('id', reportId).eq('tenant_id', tenantId).maybeSingle();
    return NextResponse.json(data ?? {});
  }

  return NextResponse.json({ error: 'Bilinmeyen action' }, { status: 400 });
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
  const { action, session_id, closing_cash, cashier_email, notes } = body;

  if (action === 'generate') {
    // Veri hesapla
    const data = await buildReportData(db, session_id ?? null, tenantId);

    const reportNo = `Z-${String(Date.now()).slice(-6)}`;

    const { data: report, error } = await db.from('z_reports').insert({
      tenant_id: tenantId,
      report_no: reportNo,
      register_session_id: session_id ?? null,
      cashier_email: cashier_email ?? null,
      shift_start: data.shift_start,
      shift_end: data.shift_end,
      total_sales_count: data.total_sales_count,
      total_sales_amount: data.total_sales_amount,
      total_returns_count: data.total_returns_count,
      total_returns_amount: data.total_returns_amount,
      total_exchanges_count: data.total_exchanges_count,
      net_amount: data.net_amount,
      cash_total: data.cash_total,
      card_total: data.card_total,
      loyalty_total: data.loyalty_total,
      other_total: data.other_total,
      opening_balance: data.opening_balance,
      closing_cash: closing_cash ?? 0,
      expected_cash: data.opening_balance + data.cash_total - data.total_returns_amount,
      cash_difference: (closing_cash ?? 0) - (data.opening_balance + data.cash_total - data.total_returns_amount),
      tax_breakdown: data.tax_breakdown,
      top_products: data.top_products,
      notes: notes ?? null,
      status: 'closed',
    }).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Kasa oturumunu kapat
    if (session_id) {
      await db.from('register_sessions').update({
        status: 'closed',
        closing_cash: closing_cash ?? 0,
        expected_cash: data.opening_balance + data.cash_total,
        cash_difference: (closing_cash ?? 0) - (data.opening_balance + data.cash_total),
        total_sales: data.total_sales_amount,
        total_returns: data.total_returns_amount,
        transaction_count: data.total_sales_count,
        z_report_id: report?.id,
        closed_at: new Date().toISOString(),
      }).eq('id', session_id).eq('tenant_id', tenantId);
    }

    await db.from('audit_logs').insert({
      tenant_id: tenantId,
      user_email: cashier_email,
      action: 'generate_z_report',
      entity: 'z_report',
      entity_id: report?.id,
      new_data: { report_no: reportNo, net_amount: data.net_amount },
    }).catch(() => {});

    return NextResponse.json({ ok: true, report_no: reportNo, report });
  }

  return NextResponse.json({ error: 'Bilinmeyen action' }, { status: 400 });
}

async function buildReportData(
  db: ReturnType<typeof createAdminClient>,
  sessionId: string | null,
  tenantId: string
) {
  const now = new Date();
  // Son kasa kapanışından beri (veya bugün 00:00'dan beri)
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  let shiftStart = today.toISOString();

  // Session varsa oturum açılış zamanını al
  let openingBalance = 0;
  if (sessionId) {
    const { data: session } = await db!
      .from('register_sessions')
      .select('opened_at, opening_balance')
      .eq('id', sessionId)
      .maybeSingle();
    if (session) {
      shiftStart = session.opened_at ?? shiftStart;
      openingBalance = session.opening_balance ?? 0;
    }
  }

  const shiftEnd = now.toISOString();

  // Siparişleri çek
  let ordersQuery = db!
    .from('orders')
    .select('id, total, payment_method, is_cancelled, items, created_at')
    .eq('tenant_id', tenantId)
    .gte('created_at', shiftStart)
    .lte('created_at', shiftEnd);

  if (sessionId) ordersQuery = ordersQuery.eq('session_id', sessionId);

  const { data: orders } = await ordersQuery;
  const allOrders = orders ?? [];

  const activeOrders = allOrders.filter((o) => !o.is_cancelled);
  const cancelledOrders = allOrders.filter((o) => o.is_cancelled);

  const totalSalesAmount = activeOrders.reduce((s, o) => s + (o.total ?? 0), 0);
  const cashOrders = activeOrders.filter((o) => o.payment_method === 'cash');
  const cardOrders = activeOrders.filter((o) => o.payment_method === 'card');

  const cashTotal = cashOrders.reduce((s, o) => s + (o.total ?? 0), 0);
  const cardTotal = cardOrders.reduce((s, o) => s + (o.total ?? 0), 0);

  // Karma ödemeler (sale_payments tablosundan)
  let loyaltyTotal = 0;
  let otherTotal = 0;
  const { data: payments } = await db!
    .from('sale_payments')
    .select('payment_method, amount')
    .eq('tenant_id', tenantId)
    .gte('created_at', shiftStart)
    .lte('created_at', shiftEnd);

  (payments ?? []).forEach((p) => {
    if (p.payment_method === 'loyalty_points') loyaltyTotal += p.amount;
    else if (!['cash', 'card'].includes(p.payment_method)) otherTotal += p.amount;
  });

  // İadeler
  const { data: returns } = await db!
    .from('sale_returns')
    .select('total_refund')
    .eq('tenant_id', tenantId)
    .gte('created_at', shiftStart)
    .lte('created_at', shiftEnd)
    .eq('status', 'completed');

  const totalReturnsAmount = (returns ?? []).reduce((s, r) => s + (r.total_refund ?? 0), 0);

  // Değişimler
  const { data: exchanges } = await db!
    .from('sale_exchanges')
    .select('id')
    .eq('tenant_id', tenantId)
    .gte('created_at', shiftStart)
    .lte('created_at', shiftEnd)
    .eq('status', 'completed');

  // En çok satılan 10 ürün
  const productMap: Record<string, number> = {};
  activeOrders.forEach((o) => {
    (o.items ?? []).forEach((i: { name: string; qty: number }) => {
      productMap[i.name] = (productMap[i.name] ?? 0) + i.qty;
    });
  });
  const topProducts = Object.entries(productMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, qty]) => ({ name, qty }));

  // KDV tahmini (%10 sabit — gerçek projede ürün bazlı hesaplanır)
  const taxBreakdown = {
    kdv_10: parseFloat((totalSalesAmount * 0.1 / 1.1).toFixed(2)),
    kdv_20: 0,
    total_tax: parseFloat((totalSalesAmount * 0.1 / 1.1).toFixed(2)),
  };

  return {
    shift_start: shiftStart,
    shift_end: shiftEnd,
    total_sales_count: activeOrders.length,
    total_sales_amount: parseFloat(totalSalesAmount.toFixed(2)),
    total_cancelled_count: cancelledOrders.length,
    total_returns_count: (returns ?? []).length,
    total_returns_amount: parseFloat(totalReturnsAmount.toFixed(2)),
    total_exchanges_count: (exchanges ?? []).length,
    net_amount: parseFloat((totalSalesAmount - totalReturnsAmount).toFixed(2)),
    cash_total: parseFloat(cashTotal.toFixed(2)),
    card_total: parseFloat(cardTotal.toFixed(2)),
    loyalty_total: parseFloat(loyaltyTotal.toFixed(2)),
    other_total: parseFloat(otherTotal.toFixed(2)),
    opening_balance: openingBalance,
    tax_breakdown: taxBreakdown,
    top_products: topProducts,
  };
}
