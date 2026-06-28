import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

const TENANT = process.env.DEFAULT_TENANT_ID ?? '11111111-1111-1111-1111-111111111111';

export async function GET(req: NextRequest) {
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: 'DB bağlantısı yok' }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');
  const customerId = searchParams.get('customer_id');

  if (action === 'account' && customerId) {
    const { data, error } = await db
      .from('loyalty_accounts')
      .select('*, customers(full_name,phone)')
      .eq('tenant_id', TENANT)
      .eq('customer_id', customerId)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (action === 'transactions' && customerId) {
    const { data, error } = await db
      .from('loyalty_transactions')
      .select('*')
      .eq('tenant_id', TENANT)
      .eq('account_id', searchParams.get('account_id') ?? '')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  }

  if (action === 'program') {
    const { data } = await db
      .from('loyalty_programs')
      .select('*')
      .eq('tenant_id', TENANT)
      .eq('is_active', true)
      .maybeSingle();
    return NextResponse.json(data);
  }

  // List all accounts
  const { data, error } = await db
    .from('loyalty_accounts')
    .select('*, customers(full_name,phone)')
    .eq('tenant_id', TENANT)
    .order('points', { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: 'DB bağlantısı yok' }, { status: 500 });

  const body = await req.json();
  const { action } = body;

  if (action === 'earn') {
    const { customer_id, order_total, order_id } = body;
    const program = await getProgram(db);
    const pointsEarned = Math.floor(order_total * (program?.points_per_lira ?? 1));
    if (pointsEarned <= 0) return NextResponse.json({ points: 0 });

    const account = await ensureAccount(db, customer_id);
    const newBalance = account.points + pointsEarned;
    const newTier = getTier(account.total_earned + pointsEarned);

    await db.from('loyalty_accounts').update({
      points: newBalance,
      total_earned: account.total_earned + pointsEarned,
      tier: newTier,
      updated_at: new Date().toISOString(),
    }).eq('id', account.id);

    await db.from('loyalty_transactions').insert({
      tenant_id: TENANT,
      account_id: account.id,
      order_id,
      type: 'earn',
      points: pointsEarned,
      balance_after: newBalance,
      note: `Satış kazanımı — Sipariş #${order_id ?? 'N/A'}`,
    });

    return NextResponse.json({ points_earned: pointsEarned, new_balance: newBalance, tier: newTier });
  }

  if (action === 'redeem') {
    const { customer_id, points_to_spend } = body;
    const program = await getProgram(db);
    const account = await ensureAccount(db, customer_id);

    if (account.points < points_to_spend) {
      return NextResponse.json({ error: 'Yetersiz puan' }, { status: 400 });
    }
    if (points_to_spend < (program?.min_redeem_points ?? 100)) {
      return NextResponse.json({ error: `Minimum ${program?.min_redeem_points ?? 100} puan kullanılabilir` }, { status: 400 });
    }

    const discount = points_to_spend * (program?.lira_per_point ?? 0.01);
    const newBalance = account.points - points_to_spend;

    await db.from('loyalty_accounts').update({
      points: newBalance,
      total_spent: account.total_spent + points_to_spend,
      updated_at: new Date().toISOString(),
    }).eq('id', account.id);

    await db.from('loyalty_transactions').insert({
      tenant_id: TENANT,
      account_id: account.id,
      type: 'redeem',
      points: -points_to_spend,
      balance_after: newBalance,
      note: `Puan kullanımı — ${discount.toFixed(2)} TL indirim`,
    });

    return NextResponse.json({ discount, points_spent: points_to_spend, new_balance: newBalance });
  }

  if (action === 'upsert_program') {
    const { points_per_lira, lira_per_point, min_redeem_points } = body;
    const existing = await db.from('loyalty_programs').select('id').eq('tenant_id', TENANT).maybeSingle();

    if (existing.data) {
      await db.from('loyalty_programs').update({ points_per_lira, lira_per_point, min_redeem_points, updated_at: new Date().toISOString() }).eq('id', existing.data.id);
    } else {
      await db.from('loyalty_programs').insert({ tenant_id: TENANT, points_per_lira, lira_per_point, min_redeem_points });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Bilinmeyen action' }, { status: 400 });
}

async function getProgram(db: ReturnType<typeof createAdminClient>) {
  const { data } = await db!.from('loyalty_programs').select('*').eq('tenant_id', TENANT).eq('is_active', true).maybeSingle();
  return data ?? { points_per_lira: 1, lira_per_point: 0.01, min_redeem_points: 100 };
}

async function ensureAccount(db: ReturnType<typeof createAdminClient>, customerId: string) {
  const { data: existing } = await db!
    .from('loyalty_accounts')
    .select('*')
    .eq('tenant_id', TENANT)
    .eq('customer_id', customerId)
    .maybeSingle();

  if (existing) return existing;

  const { data } = await db!.from('loyalty_accounts').insert({
    tenant_id: TENANT,
    customer_id: customerId,
    points: 0,
    total_earned: 0,
    total_spent: 0,
    tier: 'bronze',
  }).select().single();

  return data;
}

function getTier(totalEarned: number): string {
  if (totalEarned >= 10000) return 'platinum';
  if (totalEarned >= 5000) return 'gold';
  if (totalEarned >= 1000) return 'silver';
  return 'bronze';
}
