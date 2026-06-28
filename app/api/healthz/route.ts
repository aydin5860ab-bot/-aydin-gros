import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

const TENANT_ID = process.env.SUPABASE_TENANT_ID || '11111111-1111-1111-1111-111111111111';

export async function GET() {
  const sb = createAdminClient();
  if (!sb) {
    return NextResponse.json({ error: 'no_supabase_config' }, { status: 503 });
  }

  const checks: Record<string, any> = {};

  // Her tabloyu test et
  const tables = ['products','categories','orders','campaigns','coupons','product_stock','tenant_settings','invoices'];
  for (const tbl of tables) {
    const { count, error } = await sb.from(tbl)
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', TENANT_ID);
    checks[tbl] = error ? `ERR: ${error.message}` : count;
  }

  // Hangi key kullanılıyor (Sadece türünü döndür, gizli anahtarı veya kesitini asla sızdırma)
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || '';
  const keyUsed = svcKey ? 'service_role' : (anonKey ? 'anon' : 'none');

  return NextResponse.json({ tenant: TENANT_ID, keyUsed, checks }, { status: 200 });
}

export const dynamic = 'force-dynamic';
