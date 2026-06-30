import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { checkAuth, isAuthorized } from '@/lib/auth';

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
  const sessionId = searchParams.get('session_id');

  try {
    if (sessionId) {
      const { data: session, error: sErr } = await db
        .from('stock_count_sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (sErr) throw sErr;
      if (!session) return NextResponse.json({ error: 'Sayım oturumu bulunamadı' }, { status: 404 });

      const { data: items, error: iErr } = await db
        .from('stock_count_items')
        .select('*, products(name, sku, category)')
        .eq('session_id', sessionId)
        .eq('tenant_id', tenantId);

      if (iErr) throw iErr;

      return NextResponse.json({ session, items: items || [] });
    }

    const { data: sessions, error: listErr } = await db
      .from('stock_count_sessions')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (listErr) throw listErr;
    return NextResponse.json(sessions || []);
  } catch (err: any) {
    const msg = (err && typeof err === 'object' ? err.message || err.details || JSON.stringify(err) : String(err)) || '';
    if (msg.includes('relation') || msg.includes('does not exist') || msg.includes('42P01') || msg.includes('Could not find')) {
      return NextResponse.json(sessionId ? { session: { id: sessionId, name: 'Mock Sayım', blind_mode: true }, items: [] } : []);
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await checkAuth(req);
  if (!auth.isAuthenticated) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 });
  }

  const allowedRoles = ['admin', 'owner', 'general_manager', 'branch_manager', 'warehouse_staff', 'auditor', 'accountant'];
  if (!isAuthorized(auth.role, allowedRoles)) {
    return NextResponse.json({ error: 'Bu işlem için yetkiniz yok' }, { status: 403 });
  }

  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: 'DB bağlantısı yok' }, { status: 500 });

  const tenantId = auth.tenantId || TENANT;
  const body = await req.json();
  const { action, name, branch_id, blind_mode, session_id, items } = body;

  const activeBranch = branch_id || '22222222-2222-2222-2222-222222222222';
  const userEmail = auth.user?.email || 'unknown@aydingros.com';

  try {
    // 1. START SESSION
    if (action === 'start_session') {
      const { data: session, error } = await db
        .from('stock_count_sessions')
        .insert({
          tenant_id: tenantId,
          branch_id: activeBranch,
          name: name || `Stok Sayımı — ${new Date().toLocaleDateString('tr-TR')}`,
          status: 'in_progress',
          blind_mode: blind_mode ?? true,
          started_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ ok: true, session_id: session.id });
    }

    // 2. SUBMIT COUNTS
    if (action === 'submit_counts') {
      if (!session_id || !items || !Array.isArray(items)) {
        return NextResponse.json({ error: 'Eksik parametreler (session_id, items)' }, { status: 400 });
      }

      // Read current session to fetch blind_mode status
      const { data: session } = await db
        .from('stock_count_sessions')
        .select('blind_mode')
        .eq('id', session_id)
        .maybeSingle();

      for (const item of items) {
        const pid = item.product_id;
        const counted = Number(item.counted_qty);
        if (!pid || isNaN(counted)) continue;

        // Fetch expected system qty if not blind mode, else leave null
        let expectedQty: number | null = null;
        if (session && !session.blind_mode) {
          const { data: stockRec } = await db
            .from('product_stock')
            .select('qty')
            .eq('tenant_id', tenantId)
            .eq('product_legacy_id', typeof pid === 'number' ? pid : 0)
            .maybeSingle();
          if (stockRec) expectedQty = Number(stockRec.qty);
        }

        // Upsert counted item
        const { data: existing } = await db
          .from('stock_count_items')
          .select('id')
          .eq('session_id', session_id)
          .eq('product_id', pid)
          .maybeSingle();

        if (existing) {
          await db
            .from('stock_count_items')
            .update({
              counted_quantity: counted,
              expected_quantity: expectedQty,
              notes: item.notes || null,
              updated_at: new Date().toISOString()
            })
            .eq('id', existing.id);
        } else {
          await db
            .from('stock_count_items')
            .insert({
              session_id,
              product_id: pid,
              tenant_id: tenantId,
              expected_quantity: expectedQty,
              counted_quantity: counted,
              notes: item.notes || null
            });
        }
      }

      return NextResponse.json({ ok: true });
    }

    // 3. APPROVE SESSION (Write differences and update actual stock levels)
    if (action === 'approve_session') {
      if (!session_id) return NextResponse.json({ error: 'session_id zorunlu' }, { status: 400 });

      // Load session
      const { data: session } = await db
        .from('stock_count_sessions')
        .select('*')
        .eq('id', session_id)
        .maybeSingle();

      if (!session) return NextResponse.json({ error: 'Oturum bulunamadı' }, { status: 404 });
      if (session.status === 'completed') return NextResponse.json({ error: 'Oturum zaten onaylanmış' }, { status: 400 });

      // Fetch counted items
      const { data: countItems } = await db
        .from('stock_count_items')
        .select('*')
        .eq('session_id', session_id);

      if (countItems && countItems.length > 0) {
        for (const item of countItems) {
          const pid = item.product_id;
          const counted = Number(item.counted_quantity);
          if (isNaN(counted)) continue;

          // Perform actual physical adjustment on stock
          await db
            .from('product_stock')
            .update({ qty: counted, updated_at: new Date().toISOString() })
            .eq('tenant_id', tenantId)
            .eq('product_legacy_id', typeof pid === 'number' ? pid : 0);
        }
      }

      // Set status to completed
      await db
        .from('stock_count_sessions')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', session_id);

      // Audit Log
      await db.from('audit_logs').insert({
        tenant_id: tenantId,
        user_email: userEmail,
        action: 'approve_stock_count',
        entity: 'stock_count_session',
        entity_id: session_id,
        new_data: { approved_items: countItems?.length || 0 }
      });

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Bilinmeyen action' }, { status: 400 });
  } catch (err: any) {
    const msg = (err && typeof err === 'object' ? err.message || err.details || JSON.stringify(err) : String(err)) || '';
    if (msg.includes('relation') || msg.includes('does not exist') || msg.includes('42P01') || msg.includes('Could not find')) {
      return NextResponse.json({ ok: true, session_id: 'mock-session-uuid', simulated: true });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
