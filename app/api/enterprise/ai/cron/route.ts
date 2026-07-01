import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { readCollection, writeCollection } from '@/lib/db';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const CRON_SECRET = process.env.CRON_SECRET || 'test_cron_secret_token_12345';

export async function POST(req: NextRequest) {
  // Validate cron secret header or parameter
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : req.nextUrl.searchParams.get('secret');
  
  if (token !== CRON_SECRET) {
    return NextResponse.json({ error: 'Yetkisiz erişim - Geçersiz Cron Sırrı' }, { status: 401 });
  }

  const tenantId = TENANT_ID;
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: 'DB bağlantısı yok' }, { status: 500 });

  // 1. Run Analysis Pipeline (simulated cron workflow)
  const products = await readCollection<any>('products', tenantId, db);
  const stock = await readCollection<any>('stock', tenantId, db);
  const orders = await readCollection<any>('orders', tenantId, db);
  const wastage = await readCollection<any>('wastage_records', tenantId, db);
  const refunds = await readCollection<any>('refunds', tenantId, db);

  const stockMap: Record<string, number> = {};
  const minMap: Record<string, number> = {};
  stock.forEach((s: any) => {
    stockMap[s.product_id] = s.qty ?? 10;
    minMap[s.product_id] = s.min ?? 5;
  });

  const generatedAlerts: any[] = [];
  const generatedInsights: any[] = [];
  const generatedDrafts: any[] = [];

  // Out of stock & Critical Stock alert generation
  products.forEach((p: any) => {
    const qty = stockMap[p.id] ?? 8;
    const min = minMap[p.id] ?? 10;
    if (qty === 0) {
      generatedAlerts.push({
        id: `cron-alert-oos-${p.id}`,
        tenant_id: tenantId,
        alert_type: 'stock_out',
        message: `Kritik Stok: ${p.name} tamamen bitti!`,
        severity: 'critical',
        status: 'unread',
        created_at: new Date().toISOString()
      });
    } else if (qty <= min) {
      generatedInsights.push({
        id: `cron-insight-low-${p.id}`,
        tenant_id: tenantId,
        title: `Kritik Stok Eşiği: ${p.name}`,
        description: `${p.name} stoku limit altına indi. Mevcut: ${qty} adet.`,
        severity: 'critical',
        category: 'low_stock',
        affected_entity: p.name,
        recommended_action: `Tedarikçi ${p.supplier_name || 'Erenler Gida'} üzerinden acil sipariş oluştur.`,
        estimated_impact: 'Satış kaybını engeller.',
        status: 'open',
        created_at: new Date().toISOString()
      });
    }
  });

  // Write alerts, insights, drafts to collections
  if (generatedAlerts.length > 0) {
    const currentAlerts = await readCollection<any>('ai_alerts', tenantId, db);
    currentAlerts.push(...generatedAlerts);
    await writeCollection('ai_alerts', currentAlerts, tenantId, db);
  }

  if (generatedInsights.length > 0) {
    const currentInsights = await readCollection<any>('ai_insights', tenantId, db);
    currentInsights.push(...generatedInsights);
    await writeCollection('ai_insights', currentInsights, tenantId, db);
  }

  // Pre-generate Tasks & Risks if empty
  const currentTasks = await readCollection<any>('ai_tasks', tenantId, db);
  const currentRisks = await readCollection<any>('ai_risks', tenantId, db);

  let tasksCreated = 0;
  if (currentTasks.length === 0) {
    const defaultTasks = [
      {
        id: `cron-task-1`,
        tenant_id: tenantId,
        title: 'Manav Reyonu A12 Sayımı',
        description: 'Meyve ve sebze reyonundaki stok farklarını incelemek amacıyla kör sayım gerçekleştirin.',
        priority: 'high',
        estimated_duration: 20,
        business_impact: 'Envanter kaçaklarını önler.',
        responsible_role: 'staff',
        due_time: new Date().toISOString(),
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ];
    await writeCollection('ai_tasks', defaultTasks, tenantId, db);
    tasksCreated = defaultTasks.length;
  }

  let risksCreated = 0;
  if (currentRisks.length === 0) {
    const defaultRisks = [
      {
        id: `cron-risk-1`,
        tenant_id: tenantId,
        risk_type: 'negative_margin',
        message: 'Negatif Marj Uyarısı: Zamlar sonrası bazı şarküteri ürünleri zararına satılıyor.',
        severity: 'high',
        probability: 95.00,
        impact: 'Kârlılık kaybı.',
        recommended_action: 'Satış fiyatlarını güncelleyin.',
        status: 'open',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ];
    await writeCollection('ai_risks', defaultRisks, tenantId, db);
    risksCreated = defaultRisks.length;
  }

  // Pre-generate Morning Briefing
  const todayStr = new Date().toISOString().split('T')[0];
  const briefings = await readCollection<any>('ai_daily_briefings', tenantId, db);
  let briefingCreated = false;

  if (!briefings.some(b => b.briefing_date === todayStr)) {
    const newBriefing = {
      id: `cron-briefing-${Date.now()}`,
      tenant_id: tenantId,
      briefing_date: todayStr,
      yesterday_revenue: orders.reduce((sum, o) => sum + (parseFloat(o.total_amount || o.total) || 0), 0),
      yesterday_profit: orders.reduce((sum, o) => sum + (parseFloat(o.total_amount || o.total) || 0), 0) * 0.30,
      top_products: ['Limon (24 adet)', 'Domates (15 adet)'],
      worst_products: ['Ekmek (2 adet)'],
      stock_risks: 'Envanterde stok limitinin altına inen bazı taze gıdalar var.',
      expected_revenue_today: 15000.00,
      weather_impact: 'Hava Sıcaklığı 28°C — Gazlı içecekler satışı artabilir.',
      special_days: 'Herhangi bir resmi tatil bulunmamaktadır.',
      recommended_actions: 'AI tarafından önerilen satın alma taslağını gözden geçirin.',
      created_at: new Date().toISOString()
    };
    briefings.push(newBriefing);
    await writeCollection('ai_daily_briefings', briefings, tenantId, db);
    briefingCreated = true;
  }

  // Log in Audit Logs
  try {
    await db.from('audit_logs').insert({
      tenant_id: tenantId,
      user_email: 'cron-job@system',
      action: 'run_ai_cron_automation',
      entity: 'system_cron',
      new_data: {
        alerts_created: generatedAlerts.length,
        insights_created: generatedInsights.length,
        tasks_created: tasksCreated,
        risks_created: risksCreated,
        briefing_created: briefingCreated
      }
    });
  } catch (_) {}

  return NextResponse.json({
    success: true,
    pipeline: {
      alerts_created: generatedAlerts.length,
      insights_created: generatedInsights.length,
      tasks_created: tasksCreated,
      risks_created: risksCreated,
      briefing_created: briefingCreated
    },
    executed_at: new Date().toISOString()
  });
}
