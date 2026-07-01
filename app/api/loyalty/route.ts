import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { checkAuth, isAuthorized } from '@/lib/auth';
import { readCollection, writeCollection } from '@/lib/db';
import crypto from 'crypto';

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

  const accounts = await readCollection<any>('loyalty_accounts', tenantId, db);

  const normalizeAccount = (acc: any) => {
    if (!acc) return null;
    return {
      ...acc,
      current_points: acc.points_balance ?? 0,
      total_earned_points: acc.total_earned ?? 0,
      total_redeemed_points: acc.total_redeemed ?? 0,
    };
  };

  if (action === 'account' && customerId) {
    let account = accounts.find(a => a.customer_id === customerId);
    if (!account) {
      // Auto-create account if missing
      account = {
        id: 'la-' + crypto.randomUUID(),
        customer_id: customerId,
        tenant_id: tenantId,
        points_balance: 0,
        total_earned: 0,
        total_redeemed: 0,
        tier: 'bronze',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      accounts.push(account);
      await writeCollection('loyalty_accounts', accounts, tenantId, db);
    }
    return NextResponse.json(normalizeAccount(account));
  }

  if (action === 'transactions') {
    const accountId = searchParams.get('account_id') ?? '';
    const txs = await readCollection<any>('loyalty_transactions', tenantId, db);
    const filteredTxs = txs.filter(t => t.account_id === accountId || t.loyalty_account_id === accountId);
    return NextResponse.json(filteredTxs.slice(0, 50));
  }

  if (action === 'program') {
    const programs = await readCollection<any>('loyalty_programs', tenantId, db);
    const program = programs.find(p => p.is_active);
    return NextResponse.json(program || {
      id: 'prog-aydin-default',
      tenant_id: tenantId,
      name: 'Aydın Sadakat Kart Programı',
      points_per_lira: 1,
      lira_per_point: 0.10,
      min_redeem_points: 50,
      is_active: true
    });
  }

  if (action === 'list' || !action) {
    return NextResponse.json(accounts.map(normalizeAccount));
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

  const accounts = await readCollection<any>('loyalty_accounts', tenantId, db);
  const txs = await readCollection<any>('loyalty_transactions', tenantId, db);

  if (action === 'earn') {
    const { customer_id, order_total, order_id } = body;
    if (!customer_id || !order_total) {
      return NextResponse.json({ error: 'customer_id ve order_total gereklidir' }, { status: 400 });
    }

    const programs = await readCollection<any>('loyalty_programs', tenantId, db);
    const program = programs.find(p => p.is_active) || { points_per_lira: 1 };

    let accIdx = accounts.findIndex(a => a.customer_id === customer_id);
    let account: any;

    if (accIdx === -1) {
      account = {
        id: 'la-' + crypto.randomUUID(),
        customer_id,
        tenant_id: tenantId,
        points_balance: 0,
        total_earned: 0,
        total_redeemed: 0,
        tier: 'bronze',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      accounts.push(account);
      accIdx = accounts.length - 1;
    } else {
      account = accounts[accIdx];
    }

    // Tier multipliers logic
    let tierMultiplier = 1.0;
    const tier = account.tier || 'bronze';
    if (tier === 'silver') tierMultiplier = 1.1;
    else if (tier === 'gold') tierMultiplier = 1.2;
    else if (tier === 'platinum') tierMultiplier = 1.5;
    else if (tier === 'diamond') tierMultiplier = 2.0;

    const basePoints = Math.floor(order_total * (program.points_per_lira || 1));
    const pointsEarned = Math.floor(basePoints * tierMultiplier);

    const oldBalance = account.points_balance || 0;
    const newBalance = oldBalance + pointsEarned;
    const newTotalEarned = (account.total_earned || 0) + pointsEarned;

    // Automatic VIP level upgrade
    let newTier = 'bronze';
    if (newTotalEarned >= 25000) newTier = 'diamond';
    else if (newTotalEarned >= 10000) newTier = 'platinum';
    else if (newTotalEarned >= 5000) newTier = 'gold';
    else if (newTotalEarned >= 1000) newTier = 'silver';

    account.points_balance = newBalance;
    account.total_earned = newTotalEarned;
    account.tier = newTier;
    account.updated_at = new Date().toISOString();
    accounts[accIdx] = account;

    // Log transaction
    const newTx = {
      id: 'ltx-' + crypto.randomUUID(),
      account_id: account.id,
      loyalty_account_id: account.id,
      customer_id,
      tenant_id: tenantId,
      type: 'earn',
      points: pointsEarned,
      order_id: order_id || null,
      description: `Satış kazanımı — Sipariş #${order_id || 'N/A'} (VIP: ${newTier.toUpperCase()})`,
      created_at: new Date().toISOString()
    };
    txs.push(newTx);

    // Save
    await writeCollection('loyalty_accounts', accounts, tenantId, db);
    await writeCollection('loyalty_transactions', txs, tenantId, db);

    return NextResponse.json({
      points_earned: pointsEarned,
      new_balance: newBalance,
      tier: newTier
    });
  }

  if (action === 'redeem') {
    const { customer_id, points_to_spend } = body;
    if (!customer_id || !points_to_spend) {
      return NextResponse.json({ error: 'customer_id ve points_to_spend gereklidir' }, { status: 400 });
    }

    const programs = await readCollection<any>('loyalty_programs', tenantId, db);
    const program = programs.find(p => p.is_active) || { lira_per_point: 0.10, min_redeem_points: 50 };

    const accIdx = accounts.findIndex(a => a.customer_id === customer_id);
    if (accIdx === -1) {
      return NextResponse.json({ error: 'Müşteri sadakat kartı bulunamadı' }, { status: 404 });
    }

    const account = accounts[accIdx];
    const oldBalance = account.points_balance || 0;

    if (oldBalance < points_to_spend) {
      return NextResponse.json({ error: 'Yetersiz puan bakiyesi' }, { status: 400 });
    }

    const minPoints = program.min_redeem_points || 50;
    if (points_to_spend < minPoints) {
      return NextResponse.json({ error: `En az ${minPoints} puan harcanabilir` }, { status: 400 });
    }

    const discount = points_to_spend * (program.lira_per_point || 0.10);
    const newBalance = oldBalance - points_to_spend;

    account.points_balance = newBalance;
    account.total_redeemed = (account.total_redeemed || 0) + points_to_spend;
    account.updated_at = new Date().toISOString();
    accounts[accIdx] = account;

    // Log transaction
    const newTx = {
      id: 'ltx-' + crypto.randomUUID(),
      account_id: account.id,
      loyalty_account_id: account.id,
      customer_id,
      tenant_id: tenantId,
      type: 'redeem',
      points: -points_to_spend,
      description: `Puan harcaması — ₺${discount.toFixed(2)} indirim`,
      created_at: new Date().toISOString()
    };
    txs.push(newTx);

    // Save
    await writeCollection('loyalty_accounts', accounts, tenantId, db);
    await writeCollection('loyalty_transactions', txs, tenantId, db);

    return NextResponse.json({
      discount,
      points_spent: points_to_spend,
      new_balance: newBalance
    });
  }

  if (action === 'upsert_program') {
    const isManager = isAuthorized(auth.role, ['admin', 'manager', 'branch_manager', 'owner']);
    if (!isManager) {
      return NextResponse.json({ error: 'Bu işlemi yapmaya yetkiniz yok' }, { status: 403 });
    }
    const { name, points_per_lira, lira_per_point, min_redeem_points } = body;
    const programs = await readCollection<any>('loyalty_programs', tenantId, db);
    
    let program = programs.find(p => p.is_active);
    if (program) {
      program.name = name ?? program.name;
      program.points_per_lira = points_per_lira !== undefined ? parseFloat(points_per_lira) : program.points_per_lira;
      program.lira_per_point = lira_per_point !== undefined ? parseFloat(lira_per_point) : program.lira_per_point;
      program.min_redeem_points = min_redeem_points !== undefined ? parseInt(min_redeem_points) : program.min_redeem_points;
      program.updated_at = new Date().toISOString();
    } else {
      program = {
        id: 'prog-' + crypto.randomUUID(),
        tenant_id: tenantId,
        name: name ?? 'Aydın Sadakat Kart Programı',
        points_per_lira: points_per_lira !== undefined ? parseFloat(points_per_lira) : 1,
        lira_per_point: lira_per_point !== undefined ? parseFloat(lira_per_point) : 0.10,
        min_redeem_points: min_redeem_points !== undefined ? parseInt(min_redeem_points) : 50,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      programs.push(program);
    }

    await writeCollection('loyalty_programs', programs, tenantId, db);
    return NextResponse.json(program);
  }

  return NextResponse.json({ error: 'Bilinmeyen action' }, { status: 400 });
}
