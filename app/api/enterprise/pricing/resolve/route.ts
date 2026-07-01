import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/server';
import { resolveProductPrice } from '@/lib/pricing/resolver';

const TENANT = process.env.DEFAULT_TENANT_ID ?? '11111111-1111-1111-1111-111111111111';

export async function POST(req: NextRequest) {
  const auth = await checkAuth(req);
  if (!auth.isAuthenticated) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 });
  }

  const db = createAdminClient();
  const tenantId = auth.tenantId || TENANT;

  try {
    const body = await req.json();
    const { branch_id, customer_tier, product_ids } = body;

    if (!branch_id) {
      return NextResponse.json({ error: 'branch_id parametresi gereklidir' }, { status: 400 });
    }
    if (!Array.isArray(product_ids) || product_ids.length === 0) {
      return NextResponse.json({ error: 'product_ids listesi boş olamaz' }, { status: 400 });
    }

    const resolvedPrices: Record<string, any> = {};

    for (const pid of product_ids) {
      try {
        const resolution = await resolveProductPrice(db, tenantId, {
          product_id: pid,
          branch_id,
          customer_tier
        });
        resolvedPrices[pid] = resolution;
      } catch (err: any) {
        resolvedPrices[pid] = { error: err.message };
      }
    }

    return NextResponse.json({ prices: resolvedPrices });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
