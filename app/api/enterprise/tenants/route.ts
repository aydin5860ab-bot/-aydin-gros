import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { checkAuth, isAuthorized } from '@/lib/auth';

const ADMIN_TENANT = '11111111-1111-1111-1111-111111111111';

export async function GET(req: NextRequest) {
  const auth = await checkAuth(req);
  if (!auth.isAuthenticated || !isAuthorized(auth.role, ['admin'])) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 });
  }

  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: 'DB bağlantısı yok' }, { status: 500 });

  const { data: tenants, error } = await db
    .from('tenants')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(tenants ?? []);
}

export async function POST(req: NextRequest) {
  const auth = await checkAuth(req);
  if (!auth.isAuthenticated || !isAuthorized(auth.role, ['admin'])) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 });
  }

  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: 'DB bağlantısı yok' }, { status: 500 });

  try {
    const body = await req.json();
    const { name, slug, status, package_type, trial_days, license_key, license_days } = body;

    if (!name || !slug) {
      return NextResponse.json({ error: 'Market ismi (name) ve slug zorunlu' }, { status: 400 });
    }

    const trialDays = Number(trial_days ?? 14);
    const trialEndsAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).toISOString();
    
    let licenseEndsAt = null;
    if (license_key && license_days) {
      licenseEndsAt = new Date(Date.now() + Number(license_days) * 24 * 60 * 60 * 1000).toISOString();
    }

    const settings = {
      package: package_type || 'starter',
      trial_ends_at: trialEndsAt,
      license_key: license_key || null,
      license_ends_at: licenseEndsAt,
      created_by: auth.user.email
    };

    // Insert new tenant
    const { data: tenant, error: tErr } = await db
      .from('tenants')
      .insert({
        name,
        slug,
        status: status || 'active',
        settings
      })
      .select()
      .single();

    if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });

    // Seed default main branch for this tenant
    const { data: bData, error: bErr } = await db.from('branches').insert({
      tenant_id: tenant.id,
      name: `${name} Merkez Şubesi`,
      slug: 'merkez-subesi',
      is_main: true,
      is_active: true
    }).select();
    
    if (bErr) {
      const { error: fErr } = await db.from('branches').insert({
        tenant_id: tenant.id,
        name: `${name} Merkez Şubesi`,
        is_active: true
      });
      console.log('[api/enterprise/tenants] Fallback seed branch result:', { fErr });
    } else {
      console.log('[api/enterprise/tenants] Seed branch result:', { bData });
    }

    return NextResponse.json({ success: true, tenant });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
