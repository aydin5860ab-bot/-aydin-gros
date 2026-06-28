import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

const TENANT = process.env.DEFAULT_TENANT_ID ?? '11111111-1111-1111-1111-111111111111';
const IKASA_API_URL = process.env.IKASA_API_URL ?? 'https://api.ikasa.gov.tr/v1';
const IKASA_TOKEN = process.env.IKASA_TOKEN;

/**
 * İKASA (İşyeri Kayıt ve Analitik Sistemi) entegrasyon altyapısı.
 * Gerçek API erişimi için IKASA_API_URL ve IKASA_TOKEN env değişkenleri gereklidir.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action') ?? 'status';

  if (action === 'status') {
    return NextResponse.json({
      configured: !!IKASA_TOKEN,
      api_url: IKASA_API_URL,
      message: IKASA_TOKEN ? 'İKASA bağlantısı yapılandırılmış' : 'IKASA_TOKEN env değişkeni ayarlanmamış',
    });
  }

  if (!IKASA_TOKEN) {
    return NextResponse.json({ error: 'İKASA token yapılandırılmamış' }, { status: 503 });
  }

  if (action === 'products') {
    const res = await ikasaFetch('/products');
    return NextResponse.json(await res.json());
  }

  if (action === 'sales') {
    const from = searchParams.get('from') ?? new Date(Date.now() - 86400000).toISOString();
    const to = searchParams.get('to') ?? new Date().toISOString();
    const res = await ikasaFetch(`/sales?from=${from}&to=${to}`);
    return NextResponse.json(await res.json());
  }

  return NextResponse.json({ error: 'Bilinmeyen action' }, { status: 400 });
}

export async function POST(req: NextRequest) {
  if (!IKASA_TOKEN) {
    return NextResponse.json({ error: 'İKASA token yapılandırılmamış. IKASA_TOKEN env değişkenini ayarlayın.' }, { status: 503 });
  }

  const db = createAdminClient();
  const body = await req.json();
  const { action } = body;

  if (action === 'sync_sale') {
    // Push a completed order to İKASA
    const payload = {
      sale_date: body.sale_date,
      total: body.total,
      tax_total: body.tax_total ?? body.total * 0.1,
      items: body.items.map((i: { name: string; price: number; qty: number; tax_rate?: number }) => ({
        name: i.name,
        unit_price: i.price,
        quantity: i.qty,
        tax_rate: i.tax_rate ?? 10,
      })),
      payment_method: body.payment_method ?? 'cash',
      branch_id: body.branch_id,
    };

    const res = await ikasaFetch('/sales', 'POST', payload);
    const result = await res.json();

    if (db && body.order_id) {
      await db.from('audit_logs').insert({
        tenant_id: TENANT,
        action: 'ikasa_sync',
        entity: 'order',
        entity_id: body.order_id,
        new_data: result,
      });
    }

    return NextResponse.json(result);
  }

  return NextResponse.json({ error: 'Bilinmeyen action' }, { status: 400 });
}

async function ikasaFetch(path: string, method = 'GET', body?: unknown) {
  return fetch(`${IKASA_API_URL}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${IKASA_TOKEN}`,
      'Content-Type': 'application/json',
      'X-Tenant': TENANT,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
