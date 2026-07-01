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
  const branchId = searchParams.get('branch_id') || '22222222-2222-2222-2222-222222222222';
  const shelfId = searchParams.get('shelf_id');

  try {
    if (shelfId) {
      const { data: shelf, error: sErr } = await db
        .from('shelves')
        .select('*')
        .eq('id', shelfId)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (sErr) throw sErr;

      const { data: products, error: pErr } = await db
        .from('shelf_products')
        .select('*, products(name, sku, price)')
        .eq('shelf_id', shelfId)
        .eq('tenant_id', tenantId);

      if (pErr) throw pErr;

      return NextResponse.json({ shelf, products: products || [] });
    }

    const { data: shelves, error: listErr } = await db
      .from('shelves')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('branch_id', branchId)
      .is('deleted_at', null);

    if (listErr) throw listErr;
    return NextResponse.json(shelves || []);
  } catch (err: any) {
    const msg = err.message || String(err);
    if (err.code === '42P01' || msg.includes('relation') || msg.includes('does not exist')) {
      return NextResponse.json([]);
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await checkAuth(req);
  if (!auth.isAuthenticated) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 });
  }

  const allowedRoles = ['admin', 'owner', 'general_manager', 'branch_manager', 'warehouse_staff'];
  if (!isAuthorized(auth.role, allowedRoles)) {
    return NextResponse.json({ error: 'Bu işlem için yetkiniz yok' }, { status: 403 });
  }

  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: 'DB bağlantısı yok' }, { status: 500 });

  const tenantId = auth.tenantId || TENANT;
  const body = await req.json();
  const { action, id, shelf_code, location_desc, capacity, branch_id, shelf_id, product_id, quantity } = body;

  const activeBranch = branch_id || '22222222-2222-2222-2222-222222222222';

  try {
    // 1. SAVE SHELF
    if (action === 'save_shelf') {
      if (!shelf_code) return NextResponse.json({ error: 'shelf_code zorunlu' }, { status: 400 });

      if (id) {
        await db
          .from('shelves')
          .update({
            shelf_code,
            location_desc: location_desc || null,
            capacity: Number(capacity || 100),
            updated_at: new Date().toISOString()
          })
          .eq('id', id)
          .eq('tenant_id', tenantId);
      } else {
        await db
          .from('shelves')
          .insert({
            tenant_id: tenantId,
            branch_id: activeBranch,
            shelf_code,
            location_desc: location_desc || null,
            capacity: Number(capacity || 100)
          });
      }
      return NextResponse.json({ ok: true });
    }

    // 2. LINK PRODUCT
    if (action === 'link_product') {
      if (!shelf_id || !product_id) {
        return NextResponse.json({ error: 'shelf_id ve product_id zorunlu' }, { status: 400 });
      }

      const { data: existing } = await db
        .from('shelf_products')
        .select('id')
        .eq('shelf_id', shelf_id)
        .eq('product_id', product_id)
        .maybeSingle();

      if (existing) {
        await db
          .from('shelf_products')
          .update({
            quantity: Number(quantity || 0),
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id);
      } else {
        await db
          .from('shelf_products')
          .insert({
            tenant_id: tenantId,
            shelf_id,
            product_id,
            quantity: Number(quantity || 0)
          });
      }
      return NextResponse.json({ ok: true });
    }

    // 3. DELETE SHELF
    if (action === 'delete_shelf') {
      if (!id) return NextResponse.json({ error: 'id zorunlu' }, { status: 400 });
      await db
        .from('shelves')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
        .eq('tenant_id', tenantId);
      return NextResponse.json({ ok: true });
    }

    // 4. DELETE SHELF PRODUCT
    if (action === 'delete_shelf_product') {
      if (!id) return NextResponse.json({ error: 'id zorunlu' }, { status: 400 });
      await db
        .from('shelf_products')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenantId);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Bilinmeyen action' }, { status: 400 });
  } catch (err: any) {
    const msg = err.message || String(err);
    if (err.code === '42P01' || msg.includes('relation') || msg.includes('does not exist')) {
      return NextResponse.json({ success: true, warning: 'Simulated action due to missing schema' });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
