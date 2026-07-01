import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { checkAuth } from '@/lib/auth';
import { readCollection, writeCollection } from '@/lib/db';

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

  if (!customerId) {
    return NextResponse.json({ error: 'customer_id parametresi zorunludur' }, { status: 400 });
  }

  const wallets = await readCollection<any>('wallets', tenantId, db);
  let wallet = wallets.find(w => w.customer_id === customerId);

  if (!wallet) {
    wallet = {
      id: `wallet-${Date.now()}`,
      customer_id: customerId,
      tenant_id: tenantId,
      store_credit: 0.0,
      gift_card: 0.0,
      refund_credit: 0.0,
      campaign_credit: 0.0,
      updated_at: new Date().toISOString()
    };
    wallets.push(wallet);
    await writeCollection('wallets', wallets, tenantId, db);
  }

  if (action === 'history') {
    const txs = await readCollection<any>('wallet_transactions', tenantId, db);
    const filteredTxs = txs.filter(t => t.wallet_id === wallet.id || t.customer_id === customerId);
    return NextResponse.json(filteredTxs.sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
  }

  return NextResponse.json(wallet);
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
  const { customer_id, amount, type, source, notes, expires_at } = body;

  if (!customer_id || amount === undefined || !type || !source) {
    return NextResponse.json({ error: 'Eksik parametre (customer_id, amount, type, source gereklidir)' }, { status: 400 });
  }

  const wallets = await readCollection<any>('wallets', tenantId, db);
  const txs = await readCollection<any>('wallet_transactions', tenantId, db);

  let wIdx = wallets.findIndex(w => w.customer_id === customer_id);
  let wallet: any;

  if (wIdx === -1) {
    wallet = {
      id: `wallet-${Date.now()}`,
      customer_id,
      tenant_id: tenantId,
      store_credit: 0.0,
      gift_card: 0.0,
      refund_credit: 0.0,
      campaign_credit: 0.0,
      updated_at: new Date().toISOString()
    };
    wallets.push(wallet);
    wIdx = wallets.length - 1;
  } else {
    wallet = wallets[wIdx];
  }

  const numericAmount = parseFloat(amount);
  if (isNaN(numericAmount) || numericAmount <= 0) {
    return NextResponse.json({ error: 'Geçersiz miktar değeri' }, { status: 400 });
  }

  // Calculate new balances based on credit/debit and source category
  if (type === 'credit') {
    if (source === 'store_credit') wallet.store_credit = (wallet.store_credit || 0) + numericAmount;
    else if (source === 'gift_card') wallet.gift_card = (wallet.gift_card || 0) + numericAmount;
    else if (source === 'refund') wallet.refund_credit = (wallet.refund_credit || 0) + numericAmount;
    else if (source === 'campaign') wallet.campaign_credit = (wallet.campaign_credit || 0) + numericAmount;
  } else if (type === 'debit') {
    // Debit logic - subtract from matching wallet source
    if (source === 'store_credit') {
      if ((wallet.store_credit || 0) < numericAmount) return NextResponse.json({ error: 'Yetersiz bakiye (Store Credit)' }, { status: 400 });
      wallet.store_credit -= numericAmount;
    } else if (source === 'gift_card') {
      if ((wallet.gift_card || 0) < numericAmount) return NextResponse.json({ error: 'Yetersiz bakiye (Gift Card)' }, { status: 400 });
      wallet.gift_card -= numericAmount;
    } else if (source === 'refund') {
      if ((wallet.refund_credit || 0) < numericAmount) return NextResponse.json({ error: 'Yetersiz bakiye (Refund Credit)' }, { status: 400 });
      wallet.refund_credit -= numericAmount;
    } else if (source === 'campaign') {
      if ((wallet.campaign_credit || 0) < numericAmount) return NextResponse.json({ error: 'Yetersiz bakiye (Campaign Credit)' }, { status: 400 });
      wallet.campaign_credit -= numericAmount;
    }
  } else {
    return NextResponse.json({ error: 'Geçersiz işlem tipi (type: credit veya debit olmalıdır)' }, { status: 400 });
  }

  wallet.updated_at = new Date().toISOString();
  wallets[wIdx] = wallet;

  // Insert wallet transaction history record
  const newTx = {
    id: `wt-${Date.now()}`,
    wallet_id: wallet.id,
    customer_id,
    tenant_id: tenantId,
    amount: type === 'credit' ? numericAmount : -numericAmount,
    type,
    source,
    notes: notes || `${source.toUpperCase()} ${type === 'credit' ? 'Yükleme' : 'Kullanım'} işlemi`,
    expires_at: expires_at || null,
    created_at: new Date().toISOString()
  };
  txs.push(newTx);

  await writeCollection('wallets', wallets, tenantId, db);
  await writeCollection('wallet_transactions', txs, tenantId, db);

  return NextResponse.json({
    success: true,
    wallet,
    transaction: newTx
  });
}
