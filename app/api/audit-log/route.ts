import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { checkAuth, isAuthorized } from '@/lib/auth';
import { createMockSupabaseClient } from '@/lib/db';

const TENANT = process.env.DEFAULT_TENANT_ID ?? '11111111-1111-1111-1111-111111111111';

export async function GET(req: NextRequest) {
  const auth = await checkAuth(req);
  if (!auth.isAuthenticated) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 });
  }
  if (!isAuthorized(auth.role, ['admin', 'manager'])) {
    return NextResponse.json({ error: 'Bu işlemi yapmaya yetkiniz yok' }, { status: 403 });
  }

  let db: any = createAdminClient();
  if (process.env.FORCE_JSON_DB === 'true') {
    db = createMockSupabaseClient(auth.tenantId || TENANT);
  }
  if (!db) return NextResponse.json({ error: 'DB bağlantısı yok' }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');
  const entity = searchParams.get('entity');
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '100'), 500);
  const offset = parseInt(searchParams.get('offset') ?? '0');

  let query = db.from('audit_logs').select('*', { count: 'exact' }).eq('tenant_id', auth.tenantId || TENANT);

  if (action) query = query.eq('action', action);
  if (entity) query = query.eq('entity', entity);

  query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ logs: data ?? [], total: count ?? 0 });
}

export async function POST(req: NextRequest) {
  const auth = await checkAuth(req);
  if (!auth.isAuthenticated) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 });
  }

  let db: any = createAdminClient();
  if (process.env.FORCE_JSON_DB === 'true') {
    db = createMockSupabaseClient(auth.tenantId || TENANT);
  }
  if (!db) return NextResponse.json({ error: 'DB bağlantısı yok' }, { status: 500 });

  const body = await req.json();
  const forwarded = req.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() : null;

  const { error } = await db.from('audit_logs').insert({
    tenant_id: auth.tenantId || TENANT,
    user_id: auth.user.id,
    user_email: auth.user.email,
    action: body.action,
    entity: body.entity,
    entity_id: body.entity_id,
    old_data: body.old_data,
    new_data: body.new_data,
    ip_address: ip,
    user_agent: req.headers.get('user-agent'),
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
