import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase/server';
import crypto from 'crypto';

const TENANT_ID =
  process.env.SUPABASE_TENANT_ID ||
  process.env.TENANT_ID ||
  '11111111-1111-1111-1111-111111111111';

const ORDER_STATUS: Record<string, number> = {
  pending: 0, confirmed: 1, preparing: 1, ready: 1,
  out_for_delivery: 2, delivered: 2, cancelled: -1, refunded: -1,
};
const STATUS_FROM_INT = ['pending', 'confirmed', 'out_for_delivery', 'delivered', 'cancelled'];

const SETTINGS_KEY_MAP: Record<string, string> = {
  free_delivery_threshold: 'threshold',
  whatsapp_number:         'waNumber',
  branch1_name:            'branch1Name',
  branch1_address:         'branch1Addr',
  branch2_name:            'branch2Name',
  branch2_address:         'branch2Addr',
};
const SETTINGS_KEY_REVERSE = Object.fromEntries(
  Object.entries(SETTINGS_KEY_MAP).map(([k, v]) => [v, k])
);

// Helper function to check JWT authentication and role claims
async function checkAuth(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return { isAuthenticated: false, role: 'anon', tenantId: null };
  }
  const token = authHeader.substring(7);
  if (!token) {
    return { isAuthenticated: false, role: 'anon', tenantId: null };
  }

  const anonClient = createServerClient();
  if (!anonClient) {
    return { isAuthenticated: false, role: 'anon', tenantId: null };
  }

  try {
    const { data: { user }, error } = await anonClient.auth.getUser(token);
    if (error || !user) {
      return { isAuthenticated: false, role: 'anon', tenantId: null };
    }

    const meta = user.user_metadata || {};
    const appMeta = user.app_metadata || {};
    const role = meta.role || appMeta.role || 'viewer';
    const tenantId = meta.tenant_id || appMeta.tenant_id || null;

    return { isAuthenticated: true, role, tenantId, user };
  } catch (e) {
    return { isAuthenticated: false, role: 'anon', tenantId: null };
  }
}

async function supabaseRead(coll: string, supabase: any, tenantId: string) {
  switch (coll) {
    case 'products': {
      const rows: any[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from('products')
          .select('legacy_id, name, price, unit, image_url, is_active, metadata, categories(slug)')
          .eq('tenant_id', tenantId)
          .is('deleted_at', null)
          .not('legacy_id', 'is', null)
          .order('legacy_id')
          .range(from, from + 499);
        if (error) throw new Error('products: ' + error.message);
        if (!data?.length) break;
        rows.push(...data);
        if (data.length < 500) break;
        from += 500;
      }
      return rows.map(r => ({
        id:     r.legacy_id,
        name:   r.name,
        price:  Number(r.price),
        cat:    r.categories?.slug || '',
        img:    r.image_url || '',
        emoji:  r.metadata?.emoji || '',
        badge:  r.metadata?.badge || '',
        unit:   r.unit || 'adet',
        active: r.is_active !== false,
      }));
    }

    case 'categories': {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name, slug, display_order, is_active')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .eq('is_active', true)
        .order('display_order');
      if (error) throw new Error('categories: ' + error.message);
      return (data || []).map((r: any) => ({
        id:    r.id,
        name:  r.name,
        slug:  r.slug,
        order: r.display_order,
      }));
    }

    case 'orders': {
      const { data, error } = await supabase
        .from('orders')
        .select('id, order_number, customer_name, customer_phone, delivery_address, total, status, items_data, created_at')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw new Error('orders: ' + error.message);
      return (data || []).map((r: any) => ({
        no:    r.order_number,
        name:  r.customer_name || '',
        phone: r.customer_phone || '',
        addr:  r.delivery_address || '',
        items: (r.items_data || []).map((i: any) => ({
          id:       i.id,
          name:     i.name,
          qty:      Number(i.qty || i.quantity || 1),
          quantity: Number(i.qty || i.quantity || 1),
          price:    Number(i.price),
        })),
        total:  Number(r.total),
        ts:     new Date(r.created_at).getTime(),
        status: ORDER_STATUS[r.status] ?? 0,
      }));
    }

    case 'settings': {
      const { data, error } = await supabase
        .from('tenant_settings')
        .select('key, value')
        .eq('tenant_id', tenantId);
      if (error) throw new Error('settings: ' + error.message);
      return (data || []).reduce((acc: any, { key, value }: any) => {
        const mapped = SETTINGS_KEY_MAP[key];
        if (mapped) acc[mapped] = isNaN(value as any) ? value : Number(value);
        return acc;
      }, {});
    }

    case 'campaigns': {
      const { data, error } = await supabase
        .from('campaigns')
        .select('id, name, type, discount_value, is_active, start_date, end_date')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null);
      if (error) throw new Error('campaigns: ' + error.message);
      return (data || []).map((r: any) => ({
        id:        r.id,
        name:      r.name,
        type:      r.type,
        value:     r.discount_value,
        active:    r.is_active,
        start:     r.start_date,
        end:       r.end_date,
        minAmount: 0,
      }));
    }

    case 'promos': {
      const { data, error } = await supabase
        .from('coupons')
        .select('code, type, discount_value, is_active')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null);
      if (error) throw new Error('promos: ' + error.message);
      return (data || []).reduce((acc: any, r: any) => {
        acc[r.code] = {
          pct:      r.type === 'percentage' ? Number(r.discount_value) : 0,
          gift:     null,
          freeShip: r.type === 'free_shipping',
          active:   r.is_active,
        };
        return acc;
      }, {});
    }

    case 'stock': {
      const rows: any[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from('product_stock')
          .select('product_legacy_id, qty, min_qty')
          .eq('tenant_id', tenantId)
          .range(from, from + 499);
        if (error) throw new Error('stock: ' + error.message);
        if (!data?.length) break;
        rows.push(...data);
        if (data.length < 500) break;
        from += 500;
      }
      return rows.reduce((acc: any, r: any) => {
        acc[r.product_legacy_id] = { qty: r.qty, min: r.min_qty };
        return acc;
      }, {});
    }

    case 'invoices': {
      const { data, error } = await supabase
        .from('invoices')
        .select('data, created_at')
        .eq('tenant_id', tenantId)
        .not('data', 'is', null)
        .order('created_at', { ascending: false });
      if (error) throw new Error('invoices: ' + error.message);
      return (data || []).map((r: any) => r.data);
    }

    default:
      throw new Error(`Bilinmeyen koleksiyon: ${coll}`);
  }
}

async function supabaseWrite(coll: string, body: any, supabase: any, tenantId: string) {
  switch (coll) {
    case 'orders': {
      const rows = (Array.isArray(body) ? body : []).map(o => ({
        tenant_id:        tenantId,
        order_number:     o.no,
        customer_name:    o.name || '',
        customer_phone:   o.phone || '',
        delivery_address: o.addr || '',
        total:            o.total || 0,
        subtotal:         o.total || 0,
        status:           STATUS_FROM_INT[o.status] || 'pending',
        items_data:       o.items || [],
        created_at:       o.ts ? new Date(o.ts).toISOString() : new Date().toISOString(),
      }));
      if (!rows.length) return;

      // Check which orders are new (to deduct stock only on creation)
      const orderNumbers = rows.map(r => r.order_number);
      const { data: existingOrders, error: existingError } = await supabase
        .from('orders')
        .select('order_number')
        .eq('tenant_id', tenantId)
        .in('order_number', orderNumbers);
      
      if (existingError) {
        throw new Error('Sipariş kontrolü hatası: ' + existingError.message);
      }
      
      const existingNos = new Set((existingOrders || []).map((o: any) => o.order_number));
      const newOrders = rows.filter(r => !existingNos.has(r.order_number));

      if (newOrders.length > 0) {
        // Aggregate stock demands
        const demands: Record<number, number> = {};
        const itemNames: Record<number, string> = {};
        for (const order of newOrders) {
          for (const item of (order.items_data || [])) {
            const pid = Number(item.id);
            const quantity = Number(item.qty || item.quantity || 1);
            if (!isNaN(pid)) {
              demands[pid] = (demands[pid] || 0) + quantity;
              itemNames[pid] = item.name || `Ürün #${pid}`;
            }
          }
        }

        const productIds = Object.keys(demands).map(Number);
        if (productIds.length > 0) {
          // Fetch current stock
          const { data: stocks, error: stockError } = await supabase
            .from('product_stock')
            .select('product_legacy_id, qty')
            .eq('tenant_id', tenantId)
            .in('product_legacy_id', productIds);
          
          if (stockError) {
            throw new Error('Stok sorgulama hatası: ' + stockError.message);
          }

          const stockMap: Record<number, number> = {};
          (stocks || []).forEach((s: any) => {
            stockMap[s.product_legacy_id] = s.qty || 0;
          });

          // Validate stock
          for (const pid of productIds) {
            const demand = demands[pid];
            const currentStock = stockMap[pid] ?? 0;
            if (currentStock < demand) {
              throw new Error(`Stok yetersiz: ${itemNames[pid]} (Talep: ${demand}, Mevcut Stok: ${currentStock})`);
            }
          }

          // Deduct stock
          for (const pid of productIds) {
            const demand = demands[pid];
            const currentStock = stockMap[pid] ?? 0;
            const newStock = currentStock - demand;
            const { error: updateError } = await supabase
              .from('product_stock')
              .update({ qty: newStock, updated_at: new Date().toISOString() })
              .eq('tenant_id', tenantId)
              .eq('product_legacy_id', pid);
            
            if (updateError) {
              throw new Error(`Stok düşme hatası (${itemNames[pid]}): ` + updateError.message);
            }
          }
        }
      }

      const { error } = await supabase
        .from('orders')
        .upsert(rows, { onConflict: 'order_number' });
      if (error) throw new Error('Sipariş kaydetme hatası: ' + error.message);
      return;
    }

    case 'products': {
      // Fetch categories map to convert slug to UUID
      const { data: categories, error: catError } = await supabase
        .from('categories')
        .select('id, slug')
        .eq('tenant_id', tenantId);
      if (catError) throw new Error('Kategoriler sorgulanamadı: ' + catError.message);
      
      const categoryMap: Record<string, string> = {};
      (categories || []).forEach((c: any) => {
        if (c.slug) categoryMap[c.slug] = c.id;
      });

      // Get existing active products to map UUIDs and identify deletes
      const { data: existing, error: fetchErr } = await supabase
        .from('products')
        .select('id, legacy_id')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null);
      if (fetchErr) throw new Error('Ürünler sorgulanamadı: ' + fetchErr.message);

      const uuidMap: Record<number, string> = {};
      (existing || []).forEach((r: any) => {
        if (r.legacy_id !== null) {
          uuidMap[r.legacy_id] = r.id;
        }
      });

      const incomingProducts = (Array.isArray(body) ? body : []);
      const incomingIds = new Set(incomingProducts.map(p => Number(p.id)));

      // Perform soft deletes for products missing from the incoming array
      const deletedUuids = Object.entries(uuidMap)
        .filter(([legacyId]) => !incomingIds.has(Number(legacyId)))
        .map(([, uuid]) => uuid);

      if (deletedUuids.length > 0) {
        const { error: deleteErr } = await supabase
          .from('products')
          .update({ deleted_at: new Date().toISOString(), is_active: false })
          .in('id', deletedUuids);
        if (deleteErr) throw new Error('Ürün silme hatası: ' + deleteErr.message);
      }

      // Map incoming items for upsert
      const rows = incomingProducts.map(p => {
        const catId = categoryMap[p.cat] || null;
        const resolvedUuid = uuidMap[Number(p.id)] || crypto.randomUUID();
        return {
          id:          resolvedUuid,
          tenant_id:   tenantId,
          legacy_id:   Number(p.id),
          name:        p.name || '',
          price:       Number(p.price || 0),
          category_id: catId,
          unit:        p.unit || 'adet',
          image_url:   p.img || '',
          is_active:   p.active !== false,
          is_featured: p.featured === true,
          metadata: {
            emoji: p.emoji || '',
            badge: p.badge || '',
          },
          updated_at:  new Date().toISOString()
        };
      });

      // Deduplicate rows by UUID id to prevent PostgreSQL ON CONFLICT DO UPDATE cannot affect row a second time error
      const uniqueRowsMap = new Map<string, any>();
      rows.forEach(row => {
        if (row.id) {
          uniqueRowsMap.set(row.id, row);
        }
      });
      const uniqueRows = Array.from(uniqueRowsMap.values());

      if (uniqueRows.length > 0) {
        const { error: upsertErr } = await supabase
          .from('products')
          .upsert(uniqueRows, { onConflict: 'id' });
        if (upsertErr) throw new Error('Ürün kaydetme hatası: ' + upsertErr.message);
      }
      return;
    }

    case 'categories': {
      const incomingCategories = (Array.isArray(body) ? body : []);
      const incomingIds = new Set(incomingCategories.map(c => c.id).filter(Boolean));

      // Get existing active categories
      const { data: existing, error: fetchErr } = await supabase
        .from('categories')
        .select('id')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null);
      if (fetchErr) throw new Error('Kategoriler sorgulanamadı: ' + fetchErr.message);

      const existingIds = new Set((existing || []).map((r: any) => r.id));
      const deletedIds = Array.from(existingIds).filter(id => !incomingIds.has(id));

      // Soft delete categories missing from the incoming array
      if (deletedIds.length > 0) {
        const { error: deleteErr } = await supabase
          .from('categories')
          .update({ deleted_at: new Date().toISOString(), is_active: false })
          .in('id', deletedIds);
        if (deleteErr) throw new Error('Kategori silme hatası: ' + deleteErr.message);
      }

      // Map incoming categories
      const rows = incomingCategories.map(c => ({
        id:            c.id || undefined,
        tenant_id:     tenantId,
        name:          c.name || '',
        slug:          c.slug || '',
        display_order: Number(c.order || 0),
        is_active:     true,
        updated_at:    new Date().toISOString()
      }));

      if (rows.length > 0) {
        const { error: upsertErr } = await supabase
          .from('categories')
          .upsert(rows, { onConflict: 'id' });
        if (upsertErr) throw new Error('Kategori kaydetme hatası: ' + upsertErr.message);
      }
      return;
    }

    case 'settings': {
      const entries = Object.entries(body || {})
        .filter(([k]) => SETTINGS_KEY_REVERSE[k])
        .map(([k, v]) => ({
          tenant_id: tenantId,
          key:       SETTINGS_KEY_REVERSE[k],
          value:     String(v),
        }));
      if (!entries.length) return;
      const { error } = await supabase
        .from('tenant_settings')
        .upsert(entries, { onConflict: 'tenant_id,key' });
      if (error) throw new Error('settings write: ' + error.message);
      return;
    }

    case 'campaigns': {
      await supabase.from('campaigns').delete().eq('tenant_id', tenantId);
      const rows = (Array.isArray(body) ? body : []).map(c => ({
        tenant_id:      tenantId,
        name:           c.name || 'Kampanya',
        type:           c.type || 'pct',
        discount_value: c.value || 0,
        is_active:      c.active !== false,
        start_date:     c.start || null,
        end_date:       c.end   || null,
      }));
      if (!rows.length) return;
      const { error } = await supabase.from('campaigns').insert(rows);
      if (error) throw new Error('campaigns write: ' + error.message);
      return;
    }

    case 'promos': {
      await supabase.from('coupons').delete().eq('tenant_id', tenantId);
      const rows = Object.entries(body || {}).map(([code, p]: [string, any]) => ({
        tenant_id:      tenantId,
        code,
        type:           p.pct > 0 ? 'percentage' : (p.freeShip ? 'free_shipping' : 'gift'),
        discount_value: p.pct || 0,
        is_active:      p.active !== false,
      }));
      if (!rows.length) return;
      const { error } = await supabase.from('coupons').insert(rows);
      if (error) throw new Error('promos write: ' + error.message);
      return;
    }

    case 'stock': {
      const rows = Object.entries(body || {}).map(([legacyId, s]: [string, any]) => ({
        tenant_id:         tenantId,
        product_legacy_id: parseInt(legacyId, 10),
        qty:               s.qty ?? 50,
        min_qty:           s.min ?? 5,
        updated_at:        new Date().toISOString(),
      })).filter(r => !isNaN(r.product_legacy_id));
      if (!rows.length) return;
      const { error } = await supabase
        .from('product_stock')
        .upsert(rows, { onConflict: 'tenant_id,product_legacy_id' });
      if (error) throw new Error('stock write: ' + error.message);
      return;
    }

    case 'invoices': {
      await supabase.from('invoices').delete().eq('tenant_id', tenantId);
      const rows = (Array.isArray(body) ? body : []).map(inv => ({
        tenant_id:  tenantId,
        data:       inv,
        created_at: inv.ts ? new Date(inv.ts).toISOString() : new Date().toISOString(),
      }));
      if (!rows.length) return;
      const { error } = await supabase.from('invoices').insert(rows);
      if (error) throw new Error('invoices write: ' + error.message);
      return;
    }

    default:
      throw new Error(`Bilinmeyen koleksiyon: ${coll}`);
  }
}

export async function GET(req: NextRequest) {
  const coll = req.nextUrl.searchParams.get('coll');

  if (!coll || !/^[a-z0-9_-]+$/i.test(coll)) {
    return NextResponse.json({ error: 'Geçersiz koleksiyon adı' }, { status: 400 });
  }

  // 1. Authenticate user and verify staff status
  const auth = await checkAuth(req);
  const isStaff = auth.isAuthenticated && ['admin', 'manager', 'branch_manager', 'cashier', 'warehouse_person'].includes(auth.role);

  // Anon / Public GET permission check
  const publicReadCollections = ['products', 'categories', 'campaigns', 'promos', 'settings', 'stock'];
  if (!isStaff && !publicReadCollections.includes(coll)) {
    return NextResponse.json({ error: 'Bu koleksiyonu okumak için yetkiniz yok' }, { status: 403 });
  }

  // 2. Initialize admin client and resolve tenant ID
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase yapılandırılmamış' }, { status: 503 });
  }

  const tenantIdToUse = auth.tenantId || TENANT_ID;

  try {
    const data = await supabaseRead(coll, supabase, tenantIdToUse);
    return NextResponse.json(data, {
      headers: {
        'X-Backend': 'supabase',
      },
    });
  } catch (error: any) {
    console.error(`[api/db] GET ${coll} hatası:`, error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const coll = req.nextUrl.searchParams.get('coll');

  if (!coll || !/^[a-z0-9_-]+$/i.test(coll)) {
    return NextResponse.json({ error: 'Geçersiz koleksiyon adı' }, { status: 400 });
  }

  // 1. Authenticate user and verify staff status
  const auth = await checkAuth(req);
  const isStaff = auth.isAuthenticated && ['admin', 'manager', 'branch_manager', 'cashier', 'warehouse_person'].includes(auth.role);

  // Anon / Public POST permission check (only orders can be written anonymously)
  const publicWriteCollections = ['orders'];
  if (!isStaff && !publicWriteCollections.includes(coll)) {
    return NextResponse.json({ error: 'Bu koleksiyonu yazmak için yetkiniz yok' }, { status: 403 });
  }

  // 2. Initialize admin client and resolve tenant ID
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase yapılandırılmamış' }, { status: 503 });
  }

  const tenantIdToUse = auth.tenantId || TENANT_ID;

  try {
    const body = await req.json();
    await supabaseWrite(coll, body, supabase, tenantIdToUse);
    return NextResponse.json({ success: true }, {
      headers: {
        'X-Backend': 'supabase',
      },
    });
  } catch (error: any) {
    console.error(`[api/db] POST ${coll} hatası:`, error.message);
    const status = error.message.includes('Stok yetersiz') ? 400 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}

export async function PUT(req: NextRequest) {
  return POST(req);
}

export const dynamic = 'force-dynamic';
