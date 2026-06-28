import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

const TENANT = process.env.DEFAULT_TENANT_ID ?? '11111111-1111-1111-1111-111111111111';

export async function GET(req: NextRequest) {
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: 'DB bağlantısı yok' }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');

  if (code) {
    const { data } = await db.from('coupons').select('*').eq('tenant_id', TENANT).eq('code', code.toUpperCase()).maybeSingle();
    if (!data) return NextResponse.json({ valid: false, error: 'Kupon bulunamadı' });

    const now = new Date();
    if (!data.is_active) return NextResponse.json({ valid: false, error: 'Kupon aktif değil' });
    if (data.valid_from && new Date(data.valid_from) > now) return NextResponse.json({ valid: false, error: 'Kupon henüz geçerli değil' });
    if (data.valid_until && new Date(data.valid_until) < now) return NextResponse.json({ valid: false, error: 'Kupon süresi dolmuş' });
    if (data.used_count >= data.max_uses) return NextResponse.json({ valid: false, error: 'Kupon kullanım limiti doldu' });

    return NextResponse.json({ valid: true, coupon: data });
  }

  const { data, error } = await db.from('coupons').select('*').eq('tenant_id', TENANT).order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: 'DB bağlantısı yok' }, { status: 500 });

  const body = await req.json();

  if (body.action === 'apply') {
    const { code, order_total, customer_id, order_id } = body;
    const { data: coupon } = await db.from('coupons').select('*').eq('tenant_id', TENANT).eq('code', code.toUpperCase()).maybeSingle();

    if (!coupon) return NextResponse.json({ error: 'Kupon bulunamadı' }, { status: 404 });
    if (coupon.used_count >= coupon.max_uses) return NextResponse.json({ error: 'Kupon limiti doldu' }, { status: 400 });
    if (coupon.min_order_total && order_total < coupon.min_order_total) {
      return NextResponse.json({ error: `Minimum sipariş tutarı: ${coupon.min_order_total} TL` }, { status: 400 });
    }

    let discount = 0;
    if (coupon.type === 'percentage') discount = order_total * (coupon.value / 100);
    else if (coupon.type === 'fixed') discount = Math.min(coupon.value, order_total);
    else if (coupon.type === 'loyalty_points') discount = 0; // Points credited separately

    // Mark as used
    await db.from('coupons').update({ used_count: coupon.used_count + 1 }).eq('id', coupon.id);
    await db.from('coupon_usages').insert({
      tenant_id: TENANT,
      coupon_id: coupon.id,
      order_id,
      customer_id,
      discount,
    });

    return NextResponse.json({ discount, coupon_type: coupon.type, value: coupon.value });
  }

  // Create coupon
  const { id, ...fields } = body;
  const code = (fields.code ?? generateCode()).toUpperCase();

  if (id) {
    const { data, error } = await db.from('coupons').update({ ...fields, code }).eq('id', id).eq('tenant_id', TENANT).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  const { data, error } = await db.from('coupons').insert({ ...fields, code, tenant_id: TENANT }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: 'DB bağlantısı yok' }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id gerekli' }, { status: 400 });

  await db.from('coupons').update({ is_active: false }).eq('id', id).eq('tenant_id', TENANT);
  return NextResponse.json({ ok: true });
}

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
