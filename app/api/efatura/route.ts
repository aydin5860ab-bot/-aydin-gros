import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

const TENANT = process.env.DEFAULT_TENANT_ID ?? '11111111-1111-1111-1111-111111111111';
const EFATURA_PROVIDER = process.env.EFATURA_PROVIDER ?? 'entegra';
const EFATURA_API_URL = process.env.EFATURA_API_URL ?? 'https://efatura-api.example.com/v1';
const EFATURA_API_KEY = process.env.EFATURA_API_KEY;

/**
 * E-Fatura / E-Arşiv entegrasyon altyapısı.
 * GIB uyumlu entegratör (Entegra, Mikro, Nilvera vb.) ile çalışır.
 * Gerçek kullanım için EFATURA_API_URL ve EFATURA_API_KEY env değişkenleri gereklidir.
 */

export async function GET(req: NextRequest) {
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: 'DB bağlantısı yok' }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action') ?? 'list';

  if (action === 'status') {
    return NextResponse.json({
      provider: EFATURA_PROVIDER,
      configured: !!EFATURA_API_KEY,
      message: EFATURA_API_KEY ? `${EFATURA_PROVIDER} bağlantısı yapılandırılmış` : 'EFATURA_API_KEY ayarlanmamış',
    });
  }

  if (action === 'list') {
    const { data } = await db.from('efatura_records')
      .select('*')
      .eq('tenant_id', TENANT)
      .order('created_at', { ascending: false })
      .limit(50);
    return NextResponse.json(data ?? []);
  }

  return NextResponse.json({ error: 'Bilinmeyen action' }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: 'DB bağlantısı yok' }, { status: 500 });

  const body = await req.json();
  const { action } = body;

  if (action === 'create_earchive') {
    // Build GIB-compliant e-arşiv fatura payload
    const payload = buildEArchivePayload(body);

    // Insert draft record
    const { data: record } = await db.from('efatura_records').insert({
      tenant_id: TENANT,
      order_id: body.order_id,
      fatura_tipi: 'EARCHIVE',
      status: 'draft',
      provider: EFATURA_PROVIDER,
      payload,
    }).select().single();

    if (!EFATURA_API_KEY) {
      return NextResponse.json({
        ok: true,
        id: record?.id,
        status: 'draft',
        message: 'Fatura taslak olarak kaydedildi. EFATURA_API_KEY yapılandırıldığında gönderilebilir.',
        payload,
      });
    }

    // Send to provider
    try {
      const res = await fetch(`${EFATURA_API_URL}/earchive`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${EFATURA_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await res.json();

      await db.from('efatura_records').update({
        status: res.ok ? 'sent' : 'rejected',
        response_data: result,
        fatura_no: result.fatura_no,
        ettn: result.ettn,
        sent_at: new Date().toISOString(),
      }).eq('id', record?.id);

      return NextResponse.json({ ok: res.ok, fatura_no: result.fatura_no, ettn: result.ettn });
    } catch (e) {
      await db.from('efatura_records').update({ status: 'rejected', response_data: { error: String(e) } }).eq('id', record?.id);
      return NextResponse.json({ error: 'Fatura gönderilemedi' }, { status: 500 });
    }
  }

  if (action === 'cancel') {
    const { record_id } = body;
    const { data: rec } = await db.from('efatura_records').select('*').eq('id', record_id).maybeSingle();
    if (!rec) return NextResponse.json({ error: 'Kayıt bulunamadı' }, { status: 404 });

    await db.from('efatura_records').update({ status: 'cancelled' }).eq('id', record_id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Bilinmeyen action' }, { status: 400 });
}

function buildEArchivePayload(body: {
  order_id?: string;
  customer_name?: string;
  customer_tax_no?: string;
  customer_address?: string;
  items: { name: string; qty: number; unit_price: number; tax_rate?: number }[];
  total: number;
  tax_total?: number;
  issue_date?: string;
}) {
  return {
    senaryo: 'TICARIFATURA',
    tip: 'SATIS',
    tarih: body.issue_date ?? new Date().toISOString().slice(0, 10),
    alici: {
      ad: body.customer_name ?? 'Bireysel Müşteri',
      vkn_tckn: body.customer_tax_no ?? '11111111111',
      adres: body.customer_address ?? '',
    },
    kalemler: body.items.map((item, i) => ({
      sira: i + 1,
      ad: item.name,
      miktar: item.qty,
      birim: 'ADET',
      birim_fiyat: item.unit_price,
      kdv_orani: item.tax_rate ?? 10,
      kdv_tutari: item.unit_price * item.qty * ((item.tax_rate ?? 10) / 100),
      toplam: item.unit_price * item.qty,
    })),
    genel_toplam: body.total,
    kdv_toplam: body.tax_total ?? body.total * 0.1,
  };
}
