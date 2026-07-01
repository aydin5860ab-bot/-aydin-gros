import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { checkAuth } from '@/lib/auth';
import { readCollection } from '@/lib/db';

const TENANT = process.env.DEFAULT_TENANT_ID ?? '11111111-1111-1111-1111-111111111111';

export async function GET(req: NextRequest) {
  const auth = await checkAuth(req);
  if (!auth.isAuthenticated) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 });
  }

  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: 'DB bağlantısı yok' }, { status: 500 });

  const tenantId = auth.tenantId || TENANT;

  console.log("[analytics GET] FORCE_JSON_DB =", process.env.FORCE_JSON_DB);

  console.log("[analytics GET] Reading customers...");
  const customers = await readCollection<any>('customers', tenantId, db);
  console.log("[analytics GET] Customers read. Count:", customers.length);

  console.log("[analytics GET] Reading loyalty_accounts...");
  const loyaltyAccounts = await readCollection<any>('loyalty_accounts', tenantId, db);
  console.log("[analytics GET] Loyalty accounts read. Count:", loyaltyAccounts.length);

  console.log("[analytics GET] Reading wallets...");
  const wallets = await readCollection<any>('wallets', tenantId, db);
  console.log("[analytics GET] Wallets read. Count:", wallets.length);

  console.log("[analytics GET] Reading orders...");
  const orders = await readCollection<any>('orders', tenantId, db);
  console.log("[analytics GET] Orders read. Count:", orders.length);

  // Active vs Churn counts
  const activeCount = customers.filter(c => c.is_active).length;
  
  // Calculate churn risk based on days since last order
  let churnRiskCount = 0;
  let vipCount = 0;

  customers.forEach(c => {
    // Check if VIP in tags or type
    if (c.tags?.includes('VIP') || c.customer_type === 'business') {
      vipCount++;
    }
  });

  // Calculate wallet liabilities
  let totalStoreCredit = 0;
  let totalGiftCard = 0;
  let totalRefundCredit = 0;
  let totalCampaignCredit = 0;

  wallets.forEach(w => {
    totalStoreCredit += parseFloat(w.store_credit || 0);
    totalGiftCard += parseFloat(w.gift_card || 0);
    totalRefundCredit += parseFloat(w.refund_credit || 0);
    totalCampaignCredit += parseFloat(w.campaign_credit || 0);
  });

  const walletLiabilities = totalStoreCredit + totalGiftCard + totalRefundCredit + totalCampaignCredit;

  // Calculate loyalty costs (1 point = 0.10 TL cost)
  let totalPointsBalance = 0;
  loyaltyAccounts.forEach(la => {
    totalPointsBalance += parseInt(la.points_balance || 0);
    if (la.tier === 'gold' || la.tier === 'platinum' || la.tier === 'diamond') {
      // count active high tier accounts as VIP
      vipCount++;
    }
  });

  // Deduplicate VIP count
  const uniqVipCount = Math.max(vipCount, loyaltyAccounts.filter(la => ['gold','platinum','diamond'].includes(la.tier)).length);

  const loyaltyCost = totalPointsBalance * 0.10;

  // Calculate campaign ROI
  let totalSales = 0;
  let totalDiscount = 0;
  orders.forEach(o => {
    const tot = parseFloat(o.total || o.total_amount || 0);
    const disc = parseFloat(o.discount_amount || 0);
    totalSales += tot;
    totalDiscount += disc;
  });

  // Campaign ROI estimation
  const campaignRoi = totalDiscount > 0 ? (totalSales / totalDiscount).toFixed(2) : '0.00';

  // Calculate dynamic churn count based on last visit times
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 30);
  
  const inactiveCustomers = customers.filter(c => {
    const lastVisit = c.last_visit_at ? new Date(c.last_visit_at) : new Date(c.created_at);
    return lastVisit < sixtyDaysAgo;
  });
  churnRiskCount = inactiveCustomers.length;

  return NextResponse.json({
    active_customers: activeCount,
    returning_customers: customers.length - churnRiskCount,
    churn_risk: churnRiskCount,
    vip_count: uniqVipCount,
    campaign_roi: parseFloat(campaignRoi),
    wallet_liabilities: walletLiabilities,
    loyalty_cost: loyaltyCost,
    customer_growth: customers.length > 0 ? 8.5 : 0.0, // simulated monthly growth rate %
    
    // Detailed breakdown
    wallet_breakdown: {
      store_credit: totalStoreCredit,
      gift_card: totalGiftCard,
      refund_credit: totalRefundCredit,
      campaign_credit: totalCampaignCredit
    }
  });
}
