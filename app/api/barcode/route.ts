import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { checkAuth } from '@/lib/auth';

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
  const barcode = searchParams.get('barcode');
  const productId = searchParams.get('product_id');

  // Lookup by barcode value — returns the matching product
  if (barcode) {
    const { data } = await db
      .from('product_barcodes')
      .select('*, product_legacy_id')
      .eq('tenant_id', tenantId)
      .eq('barcode', barcode)
      .maybeSingle();

    if (!data) return NextResponse.json({ found: false });
    return NextResponse.json({ found: true, product_legacy_id: data.product_legacy_id, barcode_type: data.barcode_type });
  }

  // List barcodes for a product
  if (productId) {
    const { data } = await db
      .from('product_barcodes')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('product_legacy_id', parseInt(productId))
      .order('is_primary', { ascending: false });

    return NextResponse.json(data ?? []);
  }

  const { data } = await db.from('product_barcodes').select('*').eq('tenant_id', tenantId).limit(200);
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const auth = await checkAuth(req);
  if (!auth.isAuthenticated) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 });
  }

  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: 'DB bağlantısı yok' }, { status: 500 });

  const tenantId = auth.tenantId || TENANT;
  const body = await req.json();
  const { product_legacy_id, barcode, barcode_type = 'EAN13', is_primary = true } = body;

  if (!product_legacy_id || !barcode) {
    return NextResponse.json({ error: 'product_legacy_id ve barcode gerekli' }, { status: 400 });
  }

  // If setting as primary, clear other primaries for this product
  if (is_primary) {
    await db.from('product_barcodes').update({ is_primary: false })
      .eq('tenant_id', tenantId)
      .eq('product_legacy_id', product_legacy_id);
  }

  const { data, error } = await db.from('product_barcodes').upsert({
    tenant_id: tenantId,
    product_legacy_id,
    barcode: barcode.toUpperCase(),
    barcode_type,
    is_primary,
  }, { onConflict: 'tenant_id,barcode' }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const auth = await checkAuth(req);
  if (!auth.isAuthenticated) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 });
  }

  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: 'DB bağlantısı yok' }, { status: 500 });

  const tenantId = auth.tenantId || TENANT;
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id gerekli' }, { status: 400 });

  await db.from('product_barcodes').delete().eq('id', id).eq('tenant_id', tenantId);
  return NextResponse.json({ ok: true });
}
