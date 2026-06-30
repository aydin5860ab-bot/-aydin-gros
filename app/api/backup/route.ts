import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { checkAuth, isAuthorized } from '@/lib/auth';

const TENANT = process.env.DEFAULT_TENANT_ID ?? '11111111-1111-1111-1111-111111111111';

const TABLES = [
  'tenants','branches','users','products','product_stock','product_barcodes',
  'orders','customers','customer_transactions',
  'campaigns','coupons','coupon_usages',
  'loyalty_accounts','loyalty_transactions','loyalty_programs',
  'stock_transfers','register_sessions',
];

export async function GET(req: NextRequest) {
  const auth = await checkAuth(req);
  if (!auth.isAuthenticated) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 });
  }
  if (!isAuthorized(auth.role, ['admin', 'manager'])) {
    return NextResponse.json({ error: 'Bu işlemi yapmaya yetkiniz yok' }, { status: 403 });
  }

  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: 'DB bağlantısı yok' }, { status: 500 });

  const tenantId = auth.tenantId || TENANT;
  const { data } = await db.from('backup_jobs').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(20);
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('Authorization');
  const isCron = !!(cronSecret && authHeader === `Bearer ${cronSecret}`);

  let tenantId = TENANT;

  if (!isCron) {
    const auth = await checkAuth(req);
    if (!auth.isAuthenticated) {
      return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 });
    }
    if (!isAuthorized(auth.role, ['admin', 'manager'])) {
      return NextResponse.json({ error: 'Bu işlemi yapmaya yetkiniz yok' }, { status: 403 });
    }
    tenantId = auth.tenantId || TENANT;
  }

  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: 'DB bağlantısı yok' }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const type = body.type ?? 'full';

  // Create backup job record
  const { data: job } = await db.from('backup_jobs').insert({
    tenant_id: tenantId,
    status: 'running',
    type,
    started_at: new Date().toISOString(),
  }).select().single();

  try {
    const backup: Record<string, unknown[]> = {
      _meta: {
        tenant_id: tenantId,
        created_at: new Date().toISOString(),
        type,
        tables: TABLES,
      } as unknown as unknown[],
    };

    for (const table of TABLES) {
      const { data } = await db.from(table as never).select('*').eq('tenant_id', tenantId).limit(10000);
      backup[table] = data ?? [];
    }

    const json = JSON.stringify(backup, null, 2);
    const sizeBytes = new TextEncoder().encode(json).length;

    // In production: upload to Supabase Storage
    // For now: return the backup data directly
    if (job) {
      await db.from('backup_jobs').update({
        status: 'success',
        file_size: sizeBytes,
        table_count: TABLES.length,
        finished_at: new Date().toISOString(),
      }).eq('id', job.id);
    }

    return new NextResponse(json, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="backup_${new Date().toISOString().slice(0, 10)}.json"`,
        'X-Backup-Size': sizeBytes.toString(),
      },
    });

  } catch (e: unknown) {
    if (job) {
      await db.from('backup_jobs').update({
        status: 'failed',
        error: e instanceof Error ? e.message : String(e),
        finished_at: new Date().toISOString(),
      }).eq('id', job.id);
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Yedekleme hatası' }, { status: 500 });
  }
}
