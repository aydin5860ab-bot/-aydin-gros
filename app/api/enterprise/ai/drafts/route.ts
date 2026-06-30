import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase/server';
import { checkAuth, isAuthorized } from '@/lib/auth';
import fs from 'fs';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';

// Helper to query collections safely (Supabase table or local file fallback)
async function safeReadCollection(coll: string, supabase: any, tenantId: string) {
  try {
    const { data, error } = await supabase
      .from(coll)
      .select('*')
      .eq('tenant_id', tenantId);
    if (error) throw error;
    return data || [];
  } catch (error: any) {
    if (error.code === '42P01' || (error.message && (error.message.includes('relation') || error.message.includes('does not exist')))) {
      const dbFile = `c:/AYDIN GROS/db_${coll}.json`;
      if (fs.existsSync(dbFile)) {
        try {
          return JSON.parse(fs.readFileSync(dbFile, 'utf8'));
        } catch(e) {
          return [];
        }
      }
    }
    return [];
  }
}

export async function GET(req: NextRequest) {
  const auth = await checkAuth(req);
  if (!auth.isAuthenticated || !isAuthorized(auth.role, ['owner', 'general_manager', 'branch_manager'])) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 });
  }

  const tenantId = auth.tenantId || TENANT_ID;
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: 'DB bağlantısı yok' }, { status: 500 });

  try {
    const { data: dbDrafts, error: queryErr } = await db
      .from('ai_action_drafts')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (queryErr) throw queryErr;
    if (dbDrafts && dbDrafts.length > 0) {
      return NextResponse.json(dbDrafts);
    }
    throw new Error("No pending drafts in database, use mock drafts");
  } catch (err: any) {
    // Return structured pending mock drafts
    const mockDrafts = [
      {
        id: 'draft-po-1',
        tenant_id: tenantId,
        draft_type: 'purchase_order',
        title: 'Satın Alma Sipariş Taslağı: Süt & Şarküteri',
        description: 'Envanteri eşik altına düşen Süt, Kaşar Peyniri ve Tereyağı ürünleri için Erenler Toptan Gıda firmasına verilecek sipariş taslağı.',
        draft_data: {
          supplier_id: 'supplier-uuid-1',
          supplier_name: 'Erenler Toptan Gida',
          items: [
            { product_name: 'Yarım Yağlı Süt 1L', recommended: 45, unit_cost: 18.5 },
            { product_name: 'Taze Kaşar 500g', recommended: 20, unit_cost: 110.0 }
          ]
        },
        status: 'pending',
        created_at: new Date().toISOString()
      },
      {
        id: 'draft-camp-1',
        tenant_id: tenantId,
        draft_type: 'campaign',
        title: 'Kampanya Önerisi: Hızlı Tüketim Meyve / Sebze',
        description: 'Son 2 gün kalan manav reyonu portakal ve elma stokları için %25 indirim tanımlama taslağı.',
        draft_data: {
          campaign_name: 'Manav Akşam İndirimi',
          discount_percentage: 25,
          categories: ['manav']
        },
        status: 'pending',
        created_at: new Date().toISOString()
      },
      {
        id: 'draft-count-1',
        tenant_id: tenantId,
        draft_type: 'stock_count',
        title: 'Kör Sayım Emri Taslağı: Temizlik Reyonu',
        description: 'Temizlik reyonunda son 15 günde 230 TL kayıp fire saptandığı için envanter sayım görevi atanması.',
        draft_data: {
          session_name: 'Temizlik Reyonu Denetim Sayımı',
          blind_mode: true
        },
        status: 'pending',
        created_at: new Date().toISOString()
      }
    ];
    return NextResponse.json(mockDrafts);
  }
}

export async function POST(req: NextRequest) {
  const auth = await checkAuth(req);
  if (!auth.isAuthenticated || !isAuthorized(auth.role, ['owner', 'general_manager', 'branch_manager'])) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 });
  }

  const tenantId = auth.tenantId || TENANT_ID;
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: 'DB bağlantısı yok' }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const draft_id = body.draft_id || body.id;
  const action = body.action || (body.status === 'approved' ? 'approve' : 'reject');
  
  if (!draft_id || !action) {
    return NextResponse.json({ error: 'draft_id ve action zorunlu' }, { status: 400 });
  }

  const nextStatus = action === 'approve' ? 'approved' : 'rejected';

  try {

    // 1. Update draft status
    await db
      .from('ai_action_drafts')
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq('id', draft_id)
      .eq('tenant_id', tenantId);

    // 2. Perform mock action side effects on approve (write logs)
    if (action === 'approve') {
      await db.from('audit_logs').insert({
        tenant_id: tenantId,
        user_email: auth.user?.email || 'unknown',
        action: 'approve_ai_action_draft',
        entity: 'ai_action_draft',
        entity_id: draft_id,
        new_data: { draft_id, status: nextStatus }
      });
    }

    return NextResponse.json({ ok: true, status: nextStatus });
  } catch (err: any) {
    if (err.message.includes('relation') || err.message.includes('does not exist')) {
      return NextResponse.json({ ok: true, status: action === 'approve' ? 'approved' : 'rejected', simulated: true });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
