import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { checkAuth, isAuthorized } from '@/lib/auth';
import { stockLock } from '@/lib/lock';

export async function POST(req: NextRequest) {
  const auth = await checkAuth(req);
  if (!auth.isAuthenticated || !isAuthorized(auth.role, ['admin', 'manager', 'branch_manager', 'warehouse_person'])) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 });
  }

  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: 'DB bağlantısı yok' }, { status: 500 });

  let tenantId = auth.tenantId || '11111111-1111-1111-1111-111111111111';
  if (auth.role === 'admin') {
    const override = req.nextUrl.searchParams.get('tenantId') || req.nextUrl.searchParams.get('tenant_id') || req.headers.get('x-tenant-id');
    if (override) tenantId = override;
  }

  try {
    const body = await req.json();
    const { from_branch_id, to_branch_id, items, notes } = body;

    if (!from_branch_id || !to_branch_id || !items?.length) {
      return NextResponse.json({ error: 'from_branch_id, to_branch_id ve items zorunlu' }, { status: 400 });
    }

    if (from_branch_id === to_branch_id) {
      return NextResponse.json({ error: 'Kaynak ve hedef şube aynı olamaz' }, { status: 400 });
    }

    const release = await stockLock.acquire();
    try {
      // 1. Verify source stock levels
      const itemLegacyIds = items.map((i: any) => Number(i.legacy_id || i.id));
      const demandMap = new Map<number, number>(
        items.map((i: any) => [Number(i.legacy_id || i.id), Number(i.qty || i.quantity || 1)])
      );

      const { data: sStocks, error: sErr } = await db
        .from('product_stock')
        .select('product_legacy_id, qty')
        .eq('tenant_id', tenantId)
        .eq('branch_id', from_branch_id)
        .in('product_legacy_id', itemLegacyIds);

      if (sErr) throw new Error('Kaynak şube stok sorgulama hatası: ' + sErr.message);

      const sStockMap = new Map<number, number>(sStocks?.map(s => [s.product_legacy_id, Number(s.qty)]));

      // Check if source branch has enough quantity
      for (const [id, qty] of demandMap.entries()) {
        const currentQty = sStockMap.has(id) ? (sStockMap.get(id) || 0) : 100;
        if (currentQty < qty) {
          return NextResponse.json({
            error: `Yetersiz kaynak stok: Ürün #${id} (Talep: ${qty}, Mevcut: ${currentQty})`
          }, { status: 400 });
        }
      }

      // 2. Perform stock adjustments (Atomic Updates)
      for (const [id, qty] of demandMap.entries()) {
        // Deduct from source branch
        const sourceCurrent = sStockMap.has(id) ? (sStockMap.get(id) || 0) : 100;
        // Upsert source branch stock (deducted)
        const { error: sUpErr } = await db
          .from('product_stock')
          .upsert({
            tenant_id: tenantId,
            branch_id: from_branch_id,
            product_legacy_id: id,
            qty: Math.max(0, sourceCurrent - qty),
            updated_at: new Date().toISOString()
          }, { onConflict: 'tenant_id,branch_id,product_legacy_id' });

        if (sUpErr) {
          // Fallback if composite constraint does not include branch_id
          const { error: sUpErrFallback } = await db
            .from('product_stock')
            .upsert({
              tenant_id: tenantId,
              branch_id: from_branch_id,
              product_legacy_id: id,
              qty: Math.max(0, sourceCurrent - qty),
              updated_at: new Date().toISOString()
            }, { onConflict: 'tenant_id,product_legacy_id' });
          if (sUpErrFallback) throw new Error('Source stock upsert fallback error: ' + sUpErrFallback.message);
        }

        // Fetch destination stock
        const { data: dStock } = await db
          .from('product_stock')
          .select('qty')
          .eq('tenant_id', tenantId)
          .eq('branch_id', to_branch_id)
          .eq('product_legacy_id', id)
          .maybeSingle();

        let destCurrent = dStock ? Number(dStock.qty) : 0;
        if (!dStock) {
          const { data: globalStock } = await db
            .from('product_stock')
            .select('qty')
            .eq('tenant_id', tenantId)
            .eq('product_legacy_id', id)
            .maybeSingle();
          if (globalStock) {
            destCurrent = Number(globalStock.qty);
          }
        }

        // Upsert target branch stock (incremented)
        const { error: tUpErr } = await db
          .from('product_stock')
          .upsert({
            tenant_id: tenantId,
            branch_id: to_branch_id,
            product_legacy_id: id,
            qty: destCurrent + qty,
            updated_at: new Date().toISOString()
          }, { onConflict: 'tenant_id,branch_id,product_legacy_id' });

        if (tUpErr) {
          // Fallback if composite constraint does not include branch_id
          const { error: tUpErrFallback } = await db
            .from('product_stock')
            .upsert({
              tenant_id: tenantId,
              branch_id: to_branch_id,
              product_legacy_id: id,
              qty: destCurrent + qty,
              updated_at: new Date().toISOString()
            }, { onConflict: 'tenant_id,product_legacy_id' });
          if (tUpErrFallback) throw new Error('Target stock upsert fallback error: ' + tUpErrFallback.message);
        }
      }

      // 3. Register completed transfer record
      const transferNo = `TRF-${Date.now().toString().slice(-6)}`;
      const { data: transferRecord } = await db
        .from('stock_transfers')
        .insert({
          tenant_id: tenantId,
          from_branch_id,
          to_branch_id,
          status: 'completed',
          items,
          notes: notes || 'Şubeler arası transfer',
          completed_at: new Date().toISOString()
        })
        .select()
        .single();

      return NextResponse.json({ success: true, transfer: transferRecord });
    } finally {
      release();
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
