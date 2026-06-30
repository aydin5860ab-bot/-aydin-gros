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

async function persistInsights(db: any, tenantId: string, insights: any[]) {
  if (!insights.length) return;
  try {
    await db.from('ai_insights').insert(
      insights.map(i => ({
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        title: i.title,
        description: i.description,
        severity: i.severity,
        category: i.category,
        affected_entity: i.affected_entity || null,
        recommended_action: i.recommended_action || null,
        estimated_impact: i.estimated_impact || null,
        status: 'open',
      }))
    );
  } catch { /* non-blocking */ }
}

async function persistAlerts(db: any, tenantId: string, alerts: any[]) {
  if (!alerts.length) return;
  try {
    await db.from('ai_alerts').insert(
      alerts.map(a => ({
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        alert_type: a.alert_type,
        message: a.message,
        severity: a.severity,
        status: 'unread',
        metadata: a.metadata || {},
      }))
    );
  } catch { /* non-blocking */ }
}

async function persistDrafts(db: any, tenantId: string, drafts: any[]) {
  if (!drafts.length) return;
  try {
    await db.from('ai_action_drafts').insert(
      drafts.map(d => ({
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        draft_type: d.draft_type,
        title: d.title,
        description: d.description,
        draft_data: d.draft_data || {},
        status: 'pending',
      }))
    );
  } catch { /* non-blocking */ }
}

export async function POST(req: NextRequest) {
  const auth = await checkAuth(req);
  if (!auth.isAuthenticated || !isAuthorized(auth.role, ['owner', 'general_manager', 'admin'])) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 });
  }

  const tenantId = auth.tenantId || TENANT_ID;
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: 'DB bağlantısı yok' }, { status: 500 });

  const [products, stock, orders, wastage, refunds] = await Promise.all([
    safeQuery(db, 'products', tenantId),
    safeQuery(db, 'stock', tenantId),
    safeQuery(db, 'orders', tenantId, q => q.order('created_at', { ascending: false }).limit(500)),
    safeQuery(db, 'wastage_records', tenantId),
    safeQuery(db, 'refunds', tenantId),
  ]);

  const stockMap: Record<string, { qty: number; min: number }> = {};
  stock.forEach((s: any) => { stockMap[s.product_id] = { qty: s.qty ?? 10, min: s.min ?? 5 }; });

  const insights: any[] = [];
  const alerts: any[] = [];
  const drafts: any[] = [];

  // ── INSIGHT: Critical stock ──────────────────────────────────────────────
  const criticalItems: any[] = [];
  products.forEach((p: any) => {
    const s = stockMap[p.id] || { qty: 20, min: 5 };
    if (s.qty === 0) {
      alerts.push({
        alert_type: 'stock_out',
        message: `Stok Sıfır: ${p.name} tamamen tükendi.`,
        severity: 'critical',
        metadata: { product_id: p.id, product_name: p.name },
      });
    } else if (s.qty <= s.min) {
      criticalItems.push({ name: p.name, qty: s.qty, min: s.min, supplier: p.supplier_name || 'Erenler Toptan Gida', recommended: Math.max(20, s.min * 3 - s.qty) });
      insights.push({
        title: `Kritik Stok: ${p.name}`,
        description: `${p.name} stoku kritik eşiğe düştü. Mevcut: ${s.qty} adet, Minimum eşik: ${s.min} adet.`,
        severity: 'critical',
        category: 'low_stock',
        affected_entity: p.name,
        recommended_action: `Tedarikçi ${p.supplier_name || 'Erenler Toptan Gida'} üzerinden +${Math.max(20, s.min * 3 - s.qty)} adet sipariş aç.`,
        estimated_impact: 'Satış sürekliliği ve müşteri memnuniyeti korunur.',
      });
    }
  });

  // ── ACTION DRAFT: Purchase order for critical stock ─────────────────────
  if (criticalItems.length > 0) {
    drafts.push({
      draft_type: 'purchase_order',
      title: `Otomatik Satın Alma Önerisi (${criticalItems.length} Kalem)`,
      description: `Stok limiti altına düşen ${criticalItems.length} ürün için tedarikçi sipariş taslağı hazırlandı.`,
      draft_data: {
        supplier_name: 'Erenler Toptan Gida',
        items: criticalItems.slice(0, 10).map(i => ({
          product_name: i.name,
          current_qty: i.qty,
          recommended: i.recommended,
          unit_cost: 0,
        })),
        total_items: criticalItems.length,
      },
    });
  }

  // ── INSIGHT: High wastage ────────────────────────────────────────────────
  const totalWastage = wastage.reduce((s: number, w: any) => s + (w.quantity || 0), 0);
  if (totalWastage > 50) {
    insights.push({
      title: 'Yüksek Fire & Kayıp Oranı',
      description: `Son dönemde toplam ${totalWastage} adet fire/kayıp kaydı bulunmaktadır. Bu durum kâr marjını olumsuz etkilemektedir.`,
      severity: 'high',
      category: 'wastage',
      affected_entity: 'Tüm Reyonlar',
      recommended_action: 'Manav ve şarküteri reyonlarında happy hour indirimi tanımlayın. SKT kontrolünü günlük yapın.',
      estimated_impact: 'Fire maliyetinde %30-40 azalma sağlanabilir.',
    });

    drafts.push({
      draft_type: 'campaign',
      title: 'Akşam Happy Hour Kampanyası — Fire Önleme',
      description: 'Fire riski taşıyan ürünlerde akşam 20:00 sonrası %25 indirim kampanyası önerilmektedir.',
      draft_data: {
        campaign_name: 'Akşam Happy Hour',
        discount_percentage: 25,
        start_hour: 20,
        categories: ['manav', 'şarküteri', 'fırın'],
      },
    });
  }

  // ── INSIGHT: High refund rate ────────────────────────────────────────────
  const refundRate = orders.length > 0 ? refunds.length / orders.length : 0;
  if (refundRate > 0.05) {
    insights.push({
      title: 'Yüksek İade Oranı Tespit Edildi',
      description: `İade oranı %${Math.round(refundRate * 100)} seviyesinde. Sektör ortalaması %3'ün altında olmalıdır.`,
      severity: 'high',
      category: 'cashier_anomaly',
      affected_entity: 'Kasiyerler / Müşteriler',
      recommended_action: 'Son 30 gün iade kayıtlarını analiz edin. Kasiyer bazlı iptal/iade hareketlerini denetim günlüğünden inceleyin.',
      estimated_impact: 'İade oranının %3 altına çekilmesi ile aylık ciro kaybı minimize edilir.',
    });

    alerts.push({
      alert_type: 'high_refund_rate',
      message: `İade oranı %${Math.round(refundRate * 100)} ile normal seviyenin üzerinde.`,
      severity: 'high',
      metadata: { refund_count: refunds.length, order_count: orders.length, rate: refundRate },
    });
  }

  // ── INSIGHT: Sales trend ─────────────────────────────────────────────────
  const totalSales = orders.reduce((s: number, o: any) => s + (parseFloat(o.total) || 0), 0);
  const avgBasket = orders.length > 0 ? totalSales / orders.length : 0;
  if (avgBasket > 0 && avgBasket < 150) {
    insights.push({
      title: 'Düşük Sepet Ortalaması',
      description: `Mevcut sepet ortalaması ${Math.round(avgBasket)} TL. Hedef sepet değeri 250 TL ve üzerinde olmalıdır.`,
      severity: 'medium',
      category: 'sales_drop',
      affected_entity: 'Tüm Şubeler',
      recommended_action: 'Çapraz satış önerileri aktive edin. Müşterilere "Sık Alınanlarla Birlikte" paket ürünler sunun.',
      estimated_impact: 'Sepet ortalamasının %20 artışı aylık ciroya doğrudan yansır.',
    });
  }

  // Persist all to DB (non-blocking)
  await Promise.allSettled([
    persistInsights(db, tenantId, insights),
    persistAlerts(db, tenantId, alerts),
    persistDrafts(db, tenantId, drafts),
  ]);

  // Audit log
  db.from('audit_logs').insert({
    tenant_id: tenantId,
    user_email: auth.user?.email || 'system',
    action: 'ai_full_analyze',
    entity: 'ai_engine',
    new_data: { insights_count: insights.length, alerts_count: alerts.length, drafts_count: drafts.length },
  }).then(() => {}, () => {});

  return NextResponse.json({
    ok: true,
    summary: {
      insights_generated: insights.length,
      alerts_generated: alerts.length,
      drafts_generated: drafts.length,
    },
    insights,
    alerts,
    drafts,
    analyzed_at: new Date().toISOString(),
  });
}
