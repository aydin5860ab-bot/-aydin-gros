import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { checkAuth, isAuthorized } from '@/lib/auth';
import { readCollection, writeCollection } from '@/lib/db';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';

export async function GET(req: NextRequest) {
  const auth = await checkAuth(req);
  if (!auth.isAuthenticated || !isAuthorized(auth.role, ['owner', 'general_manager', 'branch_manager', 'admin', 'cashier', 'staff'])) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 });
  }

  const tenantId = auth.tenantId || TENANT_ID;
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: 'DB bağlantısı yok' }, { status: 500 });

  const tasks = await readCollection<any>('ai_tasks', tenantId, db);

  if (tasks.length === 0) {
    // Generate daily default tasks on-the-fly
    const defaultTasks = [
      {
        id: `task-s15-1`,
        tenant_id: tenantId,
        title: 'Manav Reyonu A12 Sayımı',
        description: 'Meyve ve sebze reyonundaki stok farklarını incelemek amacıyla kör sayım gerçekleştirin.',
        priority: 'high',
        estimated_duration: 20,
        business_impact: 'Envanter kaçaklarını önler, stok doğruluğunu sağlar.',
        responsible_role: 'staff',
        due_time: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: `task-s15-2`,
        tenant_id: tenantId,
        title: 'Reyon Fiyat Etiketlerinin Değiştirilmesi',
        description: 'Tedarikçi fiyat güncellemeleri sonrası değişen 15 ürüne ait reyon etiketlerini yazdırıp raflara yerleştirin.',
        priority: 'medium',
        estimated_duration: 30,
        business_impact: 'Kasa-raf fiyat tutarsızlık cezalarını engeller.',
        responsible_role: 'staff',
        due_time: new Date(Date.now() + 6 * 3600 * 1000).toISOString(),
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: `task-s15-3`,
        tenant_id: tenantId,
        title: 'Erenler Tedarik Siparişi Onayı',
        description: 'Eşik değerinin altına inen içecek grubu ürünleri için AI tarafından oluşturulan sipariş taslağını inceleyin.',
        priority: 'critical',
        estimated_duration: 10,
        business_impact: 'Stok tükenmesini engeller, ciro kaybını önler.',
        responsible_role: 'manager',
        due_time: new Date(Date.now() + 2 * 3600 * 1000).toISOString(),
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: `task-s15-4`,
        tenant_id: tenantId,
        title: 'Şarküteri SKT Kontrolü',
        description: 'Son kullanma tarihine 3 günden az kalan şarküteri reyonu ürünlerini toplayın ve fire/kampanya işlemini yapın.',
        priority: 'critical',
        estimated_duration: 15,
        business_impact: 'Gıda güvenliği uyumluluğu sağlar.',
        responsible_role: 'staff',
        due_time: new Date(Date.now() + 3 * 3600 * 1000).toISOString(),
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: `task-s15-5`,
        tenant_id: tenantId,
        title: 'Kasiyer İade İşlemlerinin İncelenmesi',
        description: 'Kasiyer iade oranlarında anormallik gözlenen işlemlerin fiş detaylarını yönetim panelinden denetleyin.',
        priority: 'high',
        estimated_duration: 25,
        business_impact: 'Kayıp-kaçak ve kötüye kullanımı engeller.',
        responsible_role: 'manager',
        due_time: new Date(Date.now() + 5 * 3600 * 1000).toISOString(),
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ];

    await writeCollection('ai_tasks', defaultTasks, tenantId, db);
    return NextResponse.json(defaultTasks);
  }

  return NextResponse.json(tasks);
}

export async function POST(req: NextRequest) {
  const auth = await checkAuth(req);
  if (!auth.isAuthenticated || !isAuthorized(auth.role, ['owner', 'general_manager', 'branch_manager', 'admin', 'cashier', 'staff'])) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 });
  }

  const tenantId = auth.tenantId || TENANT_ID;
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: 'DB bağlantısı yok' }, { status: 500 });

  const body = await req.json();
  const { id, status } = body;

  if (!id || !status) {
    return NextResponse.json({ error: 'id ve status gereklidir' }, { status: 400 });
  }

  const tasks = await readCollection<any>('ai_tasks', tenantId, db);
  const idx = tasks.findIndex(t => t.id === id);

  if (idx === -1) {
    return NextResponse.json({ error: 'Güncellenecek görev bulunamadı' }, { status: 404 });
  }

  const oldTask = tasks[idx];
  tasks[idx] = {
    ...oldTask,
    status,
    updated_at: new Date().toISOString()
  };

  await writeCollection('ai_tasks', tasks, tenantId, db);

  // Write audit log if completed
  if (status === 'completed') {
    try {
      await db.from('audit_logs').insert({
        tenant_id: tenantId,
        user_email: auth.user?.email || 'unknown',
        action: 'complete_ai_task',
        entity: 'ai_task',
        entity_id: id,
        new_data: { title: oldTask.title, status: 'completed' }
      });
    } catch (_) {}
  }

  return NextResponse.json({ ok: true, task: tasks[idx] });
}
