import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { checkAuth, isAuthorized } from '@/lib/auth';
import { readCollection } from '@/lib/db';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';

export async function GET(req: NextRequest) {
  const auth = await checkAuth(req);
  if (!auth.isAuthenticated || !isAuthorized(auth.role, ['owner', 'general_manager', 'branch_manager', 'admin'])) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 });
  }

  const tenantId = auth.tenantId || TENANT_ID;
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: 'DB bağlantısı yok' }, { status: 500 });

  // Read raw data from DB / Fallback files
  const products = await readCollection<any>('products', tenantId, db);
  const stock = await readCollection<any>('stock', tenantId, db);
  const orders = await readCollection<any>('orders', tenantId, db);
  const wastage = await readCollection<any>('wastage_records', tenantId, db);
  const refunds = await readCollection<any>('refunds', tenantId, db);
  const tasks = await readCollection<any>('tasks', tenantId, db).catch(() => []);
  const aiTasks = await readCollection<any>('ai_tasks', tenantId, db).catch(() => []);
  const registerSessions = await readCollection<any>('register_sessions', tenantId, db).catch(() => []);
  const loyaltyAccounts = await readCollection<any>('loyalty_accounts', tenantId, db).catch(() => []);

  // 1. Inventory Score (10 pts)
  const stockMap: Record<string, number> = {};
  const minMap: Record<string, number> = {};
  stock.forEach((s: any) => {
    stockMap[s.product_id] = s.qty ?? 10;
    minMap[s.product_id] = s.min ?? 5;
  });
  let inStockItems = 0;
  products.forEach((p: any) => {
    const qty = stockMap[p.id] ?? 10;
    const min = minMap[p.id] ?? 5;
    if (qty > min) inStockItems++;
  });
  const invPct = products.length > 0 ? inStockItems / products.length : 1;
  const scoreInventory = Math.round(invPct * 10);

  // 2. Sales Score (10 pts)
  const todaySales = orders.reduce((sum, o) => sum + (parseFloat(o.total_amount || o.total) || 0), 0);
  const scoreSales = Math.min(10, Math.round((todaySales / 5000) * 10));

  // 3. Profit Score (10 pts)
  let totalCost = 0;
  orders.forEach(o => {
    const items = o.items || [];
    items.forEach((item: any) => {
      const price = parseFloat(item.unit_price || item.price || 0);
      const cost = parseFloat(item.cost || (price * 0.70));
      const qty = parseFloat(item.quantity || item.qty || 1);
      totalCost += qty * cost;
    });
  });
  const netProfit = todaySales - totalCost;
  const marginPct = todaySales > 0 ? (netProfit / todaySales) : 0.30;
  const scoreProfit = Math.min(10, Math.round(marginPct * 10 * 3)); // Max at 33% margin

  // 4. Staff Score (10 pts)
  // Low refund and void rates from employees = higher score
  const totalVoids = orders.reduce((sum, o) => sum + (o.void_count || (o.items && o.items.length === 0 ? 1 : 0)), 0);
  const staffScoreBase = Math.max(0, 10 - (totalVoids + refunds.length));
  const scoreStaff = Math.min(10, staffScoreBase);

  // 5. Customer Score (10 pts)
  // Inverse ratio of refund transactions to total transactions
  const refundRate = orders.length > 0 ? refunds.length / orders.length : 0;
  const scoreCustomer = Math.max(0, Math.round((1 - Math.min(refundRate / 0.08, 1)) * 10));

  // 6. CRM Score (10 pts)
  // Percentage of sales linked to registered customers
  const crmOrders = orders.filter(o => o.customer_id && o.customer_id !== 'perakende').length;
  const crmPct = orders.length > 0 ? crmOrders / orders.length : 0.50;
  const scoreCrm = Math.round(crmPct * 10);

  // 7. Loyalty Score (10 pts)
  // Active loyalty accounts / total customers ratio or points redemption rate
  const totalRedeemedPoints = loyaltyAccounts.reduce((sum, a) => sum + (a.total_redeemed || 0), 0);
  const scoreLoyalty = Math.min(10, Math.round((loyaltyAccounts.length > 0 ? 6 : 2) + Math.min(totalRedeemedPoints / 1000, 4)));

  // 8. Cash Score (10 pts)
  // Checking cash shortages/discrepancies in register sessions
  let cashShortageCount = 0;
  registerSessions.forEach((s: any) => {
    const diff = parseFloat(s.cash_difference || 0);
    if (diff < 0) cashShortageCount++;
  });
  const scoreCash = Math.max(0, 10 - cashShortageCount);

  // 9. Compliance Score (10 pts)
  // Expiration/SKT status control
  let expiredItems = 0;
  const now = new Date();
  stock.forEach((s: any) => {
    if (s.expiration_date) {
      const exp = new Date(s.expiration_date);
      if (exp <= now) expiredItems++;
    }
  });
  const scoreCompliance = Math.max(0, 10 - expiredItems);

  // 10. Operations Score (10 pts)
  // Task completion rate of daily generated tasks
  const completedTasks = aiTasks.filter((t: any) => t.status === 'completed').length;
  const totalAiTasks = aiTasks.length;
  const opPct = totalAiTasks > 0 ? completedTasks / totalAiTasks : 0.85;
  const scoreOperations = Math.round(opPct * 10);

  // Overall calculations
  const totalScore = scoreInventory + scoreSales + scoreProfit + scoreStaff + scoreCustomer + scoreCrm + scoreLoyalty + scoreCash + scoreCompliance + scoreOperations;

  let scoreLabel = 'Kritik';
  let scoreColor = '#ef4444';
  if (totalScore >= 80) { scoreLabel = 'Mükemmel'; scoreColor = '#22c55e'; }
  else if (totalScore >= 60) { scoreLabel = 'İyi'; scoreColor = '#84cc16'; }
  else if (totalScore >= 40) { scoreLabel = 'Orta'; scoreColor = '#eab308'; }
  else if (totalScore >= 20) { scoreLabel = 'Zayıf'; scoreColor = '#f97316'; }

  // Explanatory breakdown text
  const explanations: string[] = [];
  if (scoreInventory < 7) explanations.push(`Stok Sağlığı (%${Math.round(invPct * 100)}) düşük; limit eşiği altındaki ürünler için sipariş verilmelidir.`);
  if (scoreProfit < 7) explanations.push(`Net kâr marjı (%${(marginPct * 100).toFixed(1)}) hedeflerin gerisinde; ürün maliyetleri ve promosyonlar optimize edilmeli.`);
  if (scoreCash < 9) explanations.push(`Kasa oturumlarında nakit açıkları saptandı; kasiyer sayımları denetlenmeli.`);
  if (scoreCompliance < 9) explanations.push(`Envanterde son kullanma tarihi geçmiş ${expiredItems} ürün saptandı; imha veya indirim uygulanmalı.`);
  if (explanations.length === 0) explanations.push('Tüm şube ve operasyon parametreleri güvenli aralıkta, market sağlığı stabil.');

  const result = {
    score: totalScore,
    label: scoreLabel,
    color: scoreColor,
    explanation: explanations.join(' | '),
    components: {
      inventory: { score: scoreInventory, max: 10, label: 'Envanter Eşiği' },
      sales: { score: scoreSales, max: 10, label: 'Satış Hacmi' },
      profit: { score: scoreProfit, max: 10, label: 'Net Kârlılık' },
      staff: { score: scoreStaff, max: 10, label: 'Personel Performansı' },
      customer: { score: scoreCustomer, max: 10, label: 'İade/Memnuniyet' },
      crm: { score: scoreCrm, max: 10, label: 'CRM Üye Hacmi' },
      loyalty: { score: scoreLoyalty, max: 10, label: 'Puan Kullanımı' },
      cash: { score: scoreCash, max: 10, label: 'Kasa Güvenliği' },
      compliance: { score: scoreCompliance, max: 10, label: 'Tarih Uyum (SKT)' },
      operations: { score: scoreOperations, max: 10, label: 'AI Görev Başarısı' }
    },
    calculated_at: new Date().toISOString()
  };

  // Write record to DB/Json fallback best-effort
  try {
    await db.from('ai_market_scores').insert({
      tenant_id: tenantId,
      score: totalScore,
      score_details: result.components,
      metadata: { explanation: result.explanation }
    });
  } catch (_) {}

  return NextResponse.json(result);
}
