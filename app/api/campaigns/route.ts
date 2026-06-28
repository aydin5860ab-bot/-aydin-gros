import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

const TENANT = process.env.DEFAULT_TENANT_ID ?? '11111111-1111-1111-1111-111111111111';

export async function GET(req: NextRequest) {
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: 'DB bağlantısı yok' }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const active = searchParams.get('active');

  let query = db.from('campaigns').select('*').eq('tenant_id', TENANT).order('priority', { ascending: false });
  if (active === '1') {
    const now = new Date().toISOString();
    query = query.eq('is_active', true).or(`start_date.is.null,start_date.lte.${now}`).or(`end_date.is.null,end_date.gte.${now}`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: 'DB bağlantısı yok' }, { status: 500 });

  const body = await req.json();

  // Calculate discount for a cart
  if (body.action === 'calculate') {
    return NextResponse.json(await calculateDiscount(db, body));
  }

  // CRUD
  const { id, ...fields } = body;
  if (id) {
    const { data, error } = await db.from('campaigns').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id).eq('tenant_id', TENANT).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  const { data, error } = await db.from('campaigns').insert({ ...fields, tenant_id: TENANT }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: 'DB bağlantısı yok' }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id gerekli' }, { status: 400 });

  await db.from('campaigns').update({ is_active: false }).eq('id', id).eq('tenant_id', TENANT);
  return NextResponse.json({ ok: true });
}

async function calculateDiscount(db: ReturnType<typeof createAdminClient>, body: {
  items: { id: number; price: number; qty: number; category?: string }[];
  order_total: number;
  customer_id?: string;
}) {
  const now = new Date().toISOString();
  const { data: campaigns } = await db!
    .from('campaigns')
    .select('*')
    .eq('tenant_id', TENANT)
    .eq('is_active', true)
    .or(`start_date.is.null,start_date.lte.${now}`)
    .or(`end_date.is.null,end_date.gte.${now}`)
    .order('priority', { ascending: false });

  let totalDiscount = 0;
  const applied: { name: string; discount: number; type: string }[] = [];

  for (const camp of (campaigns ?? [])) {
    if (camp.max_uses && camp.used_count >= camp.max_uses) continue;
    if (camp.min_order_total && body.order_total < camp.min_order_total) continue;

    let discount = 0;

    if (camp.type === 'percentage_discount') {
      discount = body.order_total * (camp.value / 100);
    } else if (camp.type === 'fixed_discount') {
      discount = Math.min(camp.value, body.order_total);
    } else if (camp.type === 'buy_x_get_y') {
      // value = [X, Y] encoded as X*100+Y
      const x = Math.floor(camp.value / 100);
      const y = camp.value % 100;
      const totalQty = body.items.reduce((s, i) => s + i.qty, 0);
      const freeItems = Math.floor(totalQty / (x + y)) * y;
      const cheapest = body.items.map(i => i.price).sort((a, b) => a - b).slice(0, freeItems);
      discount = cheapest.reduce((s, p) => s + p, 0);
    }

    if (discount > 0) {
      totalDiscount += discount;
      applied.push({ name: camp.name, discount, type: camp.type });
    }
  }

  return {
    total_discount: totalDiscount,
    final_total: Math.max(0, body.order_total - totalDiscount),
    applied_campaigns: applied,
  };
}
