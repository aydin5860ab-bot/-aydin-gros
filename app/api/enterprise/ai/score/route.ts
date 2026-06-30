import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { checkAuth, isAuthorized } from '@/lib/auth';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';

async function safeQuery(db: any, table: string, tenantId: string, extra?: (q: any) => any) {
  try {
    let q = db.from(table).select('*').eq('tenant_id', tenantId);
    if (extra) q = extra(q);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const auth = await checkAuth(req);
  if (!auth.isAuthenticated || !isAuthorized(auth.role, ['owner', 'general_manager', 'branch_manager', 'admin'])) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 });
  }

  const tenantId = auth.tenantId || TENANT_ID;
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: 'DB bağlantısı yok' }, { status: 500 });

  const [products, stock, orders, wastage, refunds] = await Promise.all([
    safeQuery(db, 'products', tenantId),
    safeQuery(db, 'stock', tenantId),
    safeQuery(db, 'orders', tenantId, q => q.eq('status', 'completed').order('created_at', { ascending: false }).limit(200)),
    safeQuery(db, 'wastage_records', tenantId),
    safeQuery(db, 'refunds', tenantId),
  ]);

  // ── Score Component 1: Stock Health (25 pts) ──────────────────────────
  const stockMap: Record<string, { qty: number; min: number }> = {};
  stock.forEach((s: any) => {
    stockMap[s.product_id] = { qty: s.qty ?? 10, min: s.min ?? 5 };
  });

  let aboveMin = 0;
  const productCount = products.length || 1;
  products.forEach((p: any) => {
    const s = stockMap[p.id] || { qty: 15, min: 5 };
    if (s.qty > s.min) aboveMin++;
  });
  const stockHealthPct = aboveMin / productCount;
  const stockScore = Math.round(stockHealthPct * 25);

  // ── Score Component 2: Sales Velocity (25 pts) ─────────────────────────
  const totalSales = orders.reduce((sum: number, o: any) => sum + (parseFloat(o.total) || 0), 0);
  const avgOrderValue = orders.length > 0 ? totalSales / orders.length : 0;
  // Consider ≥500 TL avg basket = full score
  const salesScore = Math.min(25, Math.round((avgOrderValue / 500) * 25));

  // ── Score Component 3: Wastage Control (25 pts) ────────────────────────
  const totalWastageUnits = wastage.reduce((sum: number, w: any) => sum + (w.quantity || 0), 0);
  // <50 units = full score, >500 = 0
  const wastageScore = Math.max(0, Math.round(((500 - Math.min(totalWastageUnits, 500)) / 500) * 25));

  // ── Score Component 4: Operational Health (25 pts) ─────────────────────
  const refundRate = orders.length > 0 ? refunds.length / orders.length : 0;
  // <5% refund rate = full score
  const refundScore = Math.max(0, Math.round((1 - Math.min(refundRate / 0.05, 1)) * 25));

  const totalScore = stockScore + salesScore + wastageScore + refundScore;

  let scoreLabel = 'Kritik';
  let scoreColor = '#ef4444';
  if (totalScore >= 80) { scoreLabel = 'Mükemmel'; scoreColor = '#22c55e'; }
  else if (totalScore >= 60) { scoreLabel = 'İyi'; scoreColor = '#84cc16'; }
  else if (totalScore >= 40) { scoreLabel = 'Orta'; scoreColor = '#eab308'; }
  else if (totalScore >= 20) { scoreLabel = 'Zayıf'; scoreColor = '#f97316'; }

  const result = {
    score: totalScore,
    label: scoreLabel,
    color: scoreColor,
    components: {
      stock_health: { score: stockScore, max: 25, label: 'Stok Sağlığı', pct: Math.round(stockHealthPct * 100) },
      sales_velocity: { score: salesScore, max: 25, label: 'Satış Hızı', avg_basket: Math.round(avgOrderValue) },
      wastage_control: { score: wastageScore, max: 25, label: 'Fire Kontrolü', total_wastage: totalWastageUnits },
      operational: { score: refundScore, max: 25, label: 'Operasyonel', refund_rate: Math.round(refundRate * 100) },
    },
    calculated_at: new Date().toISOString(),
  };

  // Persist score (best-effort, don't block response on failure)
  db.from('ai_market_scores').insert({
    tenant_id: tenantId,
    score: totalScore,
    score_details: result.components,
  }).then(() => {}, () => {});

  return NextResponse.json(result);
}
