import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

const TENANT = process.env.DEFAULT_TENANT_ID ?? '11111111-1111-1111-1111-111111111111';
const WA_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN ?? 'aydin_gros_wa_token';

// WhatsApp webhook verification (GET)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === WA_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: 'Doğrulama başarısız' }, { status: 403 });
}

// WhatsApp webhook incoming messages (POST)
export async function POST(req: NextRequest) {
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: 'DB bağlantısı yok' }, { status: 500 });

  const body = await req.json().catch(() => ({}));

  // Extract message from WhatsApp Cloud API payload
  const entry = body?.entry?.[0];
  const changes = entry?.changes?.[0];
  const message = changes?.value?.messages?.[0];

  if (!message) {
    return NextResponse.json({ ok: true }); // No message, still return 200
  }

  const phone = message.from;
  const text = message?.text?.body ?? '';

  // Parse order intent from message
  const parsed = parseOrderMessage(text);

  // Find or create customer
  const { data: customer } = await db.from('customers')
    .select('id')
    .eq('tenant_id', TENANT)
    .eq('phone', phone)
    .maybeSingle();

  await db.from('whatsapp_orders').insert({
    tenant_id: TENANT,
    phone,
    customer_id: customer?.id ?? null,
    raw_message: text,
    parsed_items: parsed,
    status: parsed.length > 0 ? 'pending' : 'rejected',
  });

  return NextResponse.json({ ok: true });
}

function parseOrderMessage(text: string): { name: string; qty: number }[] {
  const lines = text.split('\n');
  const items: { name: string; qty: number }[] = [];

  for (const line of lines) {
    // Match patterns like "2x ekmek", "3 adet süt", "elma x5"
    const m1 = line.match(/^(\d+)\s*[xX×]\s*(.+)/);
    const m2 = line.match(/^(.+?)\s*[xX×]\s*(\d+)$/);
    const m3 = line.match(/^(\d+)\s+adet\s+(.+)/i);

    if (m1) items.push({ qty: parseInt(m1[1]), name: m1[2].trim() });
    else if (m2) items.push({ qty: parseInt(m2[2]), name: m2[1].trim() });
    else if (m3) items.push({ qty: parseInt(m3[1]), name: m3[2].trim() });
    else if (line.trim().length > 2) items.push({ qty: 1, name: line.trim() });
  }

  return items.filter(i => i.name.length > 1);
}
