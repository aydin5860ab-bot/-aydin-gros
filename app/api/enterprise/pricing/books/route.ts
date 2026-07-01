import { NextRequest, NextResponse } from 'next/server';
import { checkAuth, isAuthorized } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/server';
import { readCollection, writeCollection } from '@/lib/db';

const TENANT = process.env.DEFAULT_TENANT_ID ?? '11111111-1111-1111-1111-111111111111';

export async function GET(req: NextRequest) {
  const auth = await checkAuth(req);
  if (!auth.isAuthenticated) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 });
  }

  const db = createAdminClient();
  const tenantId = auth.tenantId || TENANT;

  try {
    const priceBooks = await readCollection<any>('price_books', tenantId, db) || [];
    return NextResponse.json(priceBooks);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await checkAuth(req);
  if (!auth.isAuthenticated) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 });
  }

  // Only corporate admins or managers can mutate pricing books
  if (!isAuthorized(auth.role, ['admin', 'manager'])) {
    return NextResponse.json({ error: 'Fiyat listelerini yönetme yetkiniz yok' }, { status: 403 });
  }

  const db = createAdminClient();
  const tenantId = auth.tenantId || TENANT;

  try {
    const body = await req.json();
    const { action } = body;

    const priceBooks = await readCollection<any>('price_books', tenantId, db) || [];
    const entries = await readCollection<any>('price_book_entries', tenantId, db) || [];

    if (action === 'create_book') {
      const newBook = {
        id: `pb-${Date.now()}`,
        tenant_id: tenantId,
        name: body.name,
        type: body.type, // 'base' | 'region' | 'branch' | 'customer_group'
        scope_value: body.scope_value || '',
        starts_at: body.starts_at || new Date().toISOString(),
        ends_at: body.ends_at || new Date(Date.now() + 365 * 24 * 3600000).toISOString(),
        priority: parseInt(body.priority || '0'),
        status: 'draft', // defaults to draft
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      priceBooks.push(newBook);
      await writeCollection('price_books', priceBooks, tenantId, db);
      return NextResponse.json(newBook);
    }

    if (action === 'add_entry') {
      const newEntry = {
        id: `pbe-${Date.now()}`,
        price_book_id: body.price_book_id,
        product_id: body.product_id,
        price: parseFloat(body.price),
        cost_price: parseFloat(body.cost_price || '0'),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      entries.push(newEntry);
      await writeCollection('price_book_entries', entries, tenantId, db);
      return NextResponse.json(newEntry);
    }

    if (action === 'approve_book') {
      const idx = priceBooks.findIndex(b => b.id === body.price_book_id);
      if (idx === -1) {
        return NextResponse.json({ error: 'Fiyat kitabı bulunamadı' }, { status: 404 });
      }

      priceBooks[idx].status = 'approved';
      priceBooks[idx].updated_at = new Date().toISOString();
      await writeCollection('price_books', priceBooks, tenantId, db);

      // Log to audit logs for compliance review
      if (db) {
        await db.from('audit_logs').insert({
          tenant_id: tenantId,
          action: 'PRICE_BOOK_APPROVED',
          user_email: auth.email,
          details: `Fiyat Kataloğu onaylandı: ${priceBooks[idx].name} (ID: ${body.price_book_id})`
        });
      }

      return NextResponse.json({ success: true, price_book: priceBooks[idx] });
    }

    return NextResponse.json({ error: 'Bilinmeyen action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
