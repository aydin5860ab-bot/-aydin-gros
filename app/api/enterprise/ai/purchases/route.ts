import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { checkAuth, isAuthorized } from '@/lib/auth';
import { readCollection, writeCollection } from '@/lib/db';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';

export async function GET(req: NextRequest) {
  const auth = await checkAuth(req);
  if (!auth.isAuthenticated || !isAuthorized(auth.role, ['owner', 'general_manager', 'branch_manager', 'admin'])) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 });
  }

  const tenantId = auth.tenantId || TENANT_ID;
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: 'DB bağlantısı yok' }, { status: 500 });

  // Get active purchase drafts
  const drafts = await readCollection<any>('ai_action_drafts', tenantId, db);
  const purchaseDrafts = drafts.filter(d => d.draft_type === 'purchase_order' && d.status === 'pending');

  if (purchaseDrafts.length === 0) {
    // Generate purchase drafts based on products under minimum stock level
    const products = await readCollection<any>('products', tenantId, db);
    const stock = await readCollection<any>('stock', tenantId, db);

    const stockMap: Record<string, number> = {};
    const minMap: Record<string, number> = {};
    stock.forEach((s: any) => {
      stockMap[s.product_id] = s.qty ?? 10;
      minMap[s.product_id] = s.min ?? 5;
    });

    const itemsNeeded: any[] = [];
    products.forEach((p: any) => {
      const qty = stockMap[p.id] ?? 8;
      const min = minMap[p.id] ?? 10;
      if (qty <= min) {
        itemsNeeded.push({
          product_id: p.id,
          product_name: p.name,
          current_stock: qty,
          min_stock: min,
          recommended: Math.max(30, (min * 3) - qty),
          unit_cost: p.cost_price || p.price * 0.70,
          lead_time: 2, // days
          supplier_name: p.supplier_name || 'Erenler Toptan Gida'
        });
      }
    });

    if (itemsNeeded.length > 0) {
      // Group by supplier
      const newDraft = {
        id: `draft-po-${Date.now()}`,
        tenant_id: tenantId,
        draft_type: 'purchase_order',
        title: 'Otomatik Akıllı Satın Alma Sipariş Önerisi',
        description: 'Stok limiti altına düşen ürünler için dönemsellik, tedarik süresi ve satış hızına dayalı AI sipariş taslağı.',
        draft_data: {
          supplier_name: 'Erenler Toptan Gida',
          items: itemsNeeded.slice(0, 10),
          total_cost: itemsNeeded.slice(0, 10).reduce((sum, item) => sum + (item.recommended * item.unit_cost), 0)
        },
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      drafts.push(newDraft);
      await writeCollection('ai_action_drafts', drafts, tenantId, db);
      return NextResponse.json([newDraft]);
    }
  }

  return NextResponse.json(purchaseDrafts);
}

export async function POST(req: NextRequest) {
  const auth = await checkAuth(req);
  if (!auth.isAuthenticated || !isAuthorized(auth.role, ['owner', 'general_manager', 'branch_manager', 'admin'])) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 });
  }

  const tenantId = auth.tenantId || TENANT_ID;
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: 'DB bağlantısı yok' }, { status: 500 });

  const body = await req.json();
  const { draft_id, action } = body;

  if (!draft_id || !action) {
    return NextResponse.json({ error: 'draft_id ve action zorunludur' }, { status: 400 });
  }

  const drafts = await readCollection<any>('ai_action_drafts', tenantId, db);
  const idx = drafts.findIndex(d => d.id === draft_id);

  if (idx === -1) {
    return NextResponse.json({ error: 'İşlem yapılacak taslak bulunamadı' }, { status: 404 });
  }

  const draft = drafts[idx];
  const nextStatus = action === 'approve' ? 'approved' : 'rejected';
  drafts[idx] = {
    ...draft,
    status: nextStatus,
    updated_at: new Date().toISOString()
  };

  await writeCollection('ai_action_drafts', drafts, tenantId, db);

  // If approved, update stock in the database (Simulation of received stock goods)
  if (action === 'approve') {
    const stock = await readCollection<any>('stock', tenantId, db);
    const items = draft.draft_data?.items || [];
    
    items.forEach((item: any) => {
      const sIdx = stock.findIndex((s: any) => s.product_id === item.product_id);
      if (sIdx !== -1) {
        stock[sIdx].qty = (stock[sIdx].qty || 0) + item.recommended;
        stock[sIdx].updated_at = new Date().toISOString();
      }
    });

    await writeCollection('stock', stock, tenantId, db);

    // Audit log
    try {
      await db.from('audit_logs').insert({
        tenant_id: tenantId,
        user_email: auth.user?.email || 'unknown',
        action: 'approve_purchase_draft',
        entity: 'ai_action_draft',
        entity_id: draft_id,
        new_data: { title: draft.title, items_approved: items.length, status: 'approved' }
      });
    } catch (_) {}
  }

  return NextResponse.json({ ok: true, draft: drafts[idx] });
}
