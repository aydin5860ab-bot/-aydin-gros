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
  const action = searchParams.get('action');
  const customerId = searchParams.get('customer_id');

  if (action === 'account' && customerId) {
    const { data, error } = await db
      .from('loyalty_accounts')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('customer_id', customerId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (action === 'transactions') {
    const accountId = searchParams.get('account_id') ?? '';
    const { data, error } = await db
      .from('loyalty_transactions')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  }

  if (action === 'program') {
    const { data } = await db
      .from('loyalty_programs')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .maybeSingle();
    return NextResponse.json(data ?? {});
  }

  if (action === 'list' || !action) {
    const { data, error } = await db
      .from('loyalty_accounts')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('current_points', { ascending: false })
      .limit(200);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
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
  const { action } = body;

  if (action === 'earn') {
    const { customer_id, order_total, order_id } = body;
    const program = await getProgram(db, tenantId);
    const pointsEarned = Math.floor(order_total * (program?.points_per_lira ?? 1));
    if (pointsEarned <= 0) return NextResponse.json({ points: 0 });

    const account = await ensureAccount(db, customer_id, tenantId);
    const newBalance = account.current_points + pointsEarned;
    const newTotalEarned = account.total_earned_points + pointsEarned;
    const newTier = getTier(newTotalEarned);

    await db.from('loyalty_accounts').update({
      current_points: newBalance,
      total_earned_points: newTotalEarned,
      tier: newTier,
      updated_at: new Date().toISOString(),
    }).eq('id', account.id);

    await db.from('loyalty_transactions').insert({
      tenant_id: tenantId,
      account_id: account.id,
      order_id: order_id ? String(order_id) : null,
      type: 'earn',
      points: pointsEarned,
      balance_after: newBalance,
      description: `Satış kazanımı — Sipariş #${order_id ?? 'N/A'}`,
    });

    return NextResponse.json({ points_earned: pointsEarned, new_balance: newBalance, tier: newTier });
  }

  if (action === 'redeem') {
    const { customer_id, points_to_spend } = body;
    const program = await getProgram(db, tenantId);
    const account = await ensureAccount(db, customer_id, tenantId);

    if (account.current_points < points_to_spend) {
      return NextResponse.json({ error: 'Yetersiz puan' }, { status: 400 });
    }
    if (points_to_spend < (program?.min_redeem_points ?? 100)) {
      return NextResponse.json(
        { error: `Minimum ${program?.min_redeem_points ?? 100} puan kullanılabilir` },
        { status: 400 }
      );
    }

    const discount = points_to_spend * (program?.lira_per_point ?? 0.01);
    const newBalance = account.current_points - points_to_spend;

    await db.from('loyalty_accounts').update({
      current_points: newBalance,
      total_redeemed_points: account.total_redeemed_points + points_to_spend,
      updated_at: new Date().toISOString(),
    }).eq('id', account.id);

    await db.from('loyalty_transactions').insert({
      tenant_id: tenantId,
      account_id: account.id,
      type: 'redeem',
      points: -points_to_spend,
      balance_after: newBalance,
      description: `Puan kullanımı — ₺${discount.toFixed(2)} indirim`,
    });

    return NextResponse.json({ discount, points_spent: points_to_spend, new_balance: newBalance });
  }

  if (action === 'upsert_program') {
    const { name, points_per_lira, lira_per_point, min_redeem_points } = body;
    const { data: existing } = await db
      .from('loyalty_programs')
      .select('id')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (existing) {
      await db.from('loyalty_programs').update({
        name: name ?? 'Sadakat Programı',
        points_per_lira,
        lira_per_point,
        min_redeem_points,
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id);
    } else {
      await db.from('loyalty_programs').insert({
        tenant_id: tenantId,
        name: name ?? 'Sadakat Programı',
        points_per_lira,
        lira_per_point,
        min_redeem_points,
      });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Bilinmeyen action' }, { status: 400 });
}

async function getProgram(db: ReturnType<typeof createAdminClient>, tenantId: string) {
  const { data } = await db!
    .from('loyalty_programs')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .maybeSingle();
  return data ?? { points_per_lira: 1, lira_per_point: 0.01, min_redeem_points: 100 };
}

async function ensureAccount(db: ReturnType<typeof createAdminClient>, customerId: string, tenantId: string) {
  const { data: existing } = await db!
    .from('loyalty_accounts')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('customer_id', customerId)
    .maybeSingle();

  if (existing) return existing;

  const { data } = await db!.from('loyalty_accounts').insert({
    tenant_id: tenantId,
    customer_id: customerId,
    current_points: 0,
    total_earned_points: 0,
    total_redeemed_points: 0,
    tier: 'bronze',
  }).select().single();

  return data!;
}

function getTier(totalEarned: number): string {
  if (totalEarned >= 10000) return 'platinum';
  if (totalEarned >= 5000) return 'gold';
  if (totalEarned >= 1000) return 'silver';
  return 'bronze';
}
