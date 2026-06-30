import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase/server';
import crypto from 'crypto';
import { stockLock } from '@/lib/lock';
import { isLicenseActive } from '@/lib/auth';

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

async function supabaseRead(coll: string, supabase: any, tenantId: string, branchId?: string) {
  const activeBranch = branchId || '22222222-2222-2222-2222-222222222222';
  switch (coll) {
    case 'branches': {
      const { data, error } = await supabase
        .from('branches')
        .select('id, name, slug, is_main, is_active')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null);
      
      if (error) {
        const { data: fData, error: fErr } = await supabase
          .from('branches')
          .select('id, name, is_active')
          .eq('tenant_id', tenantId)
          .is('deleted_at', null);
        if (fErr) return [];
        return (fData || []).map((b: any, idx: number) => ({
          id: b.id,
          name: b.name,
          slug: 'sube-' + (idx + 1),
          isMain: idx === 0,
          isActive: b.is_active
        }));
      }
      
      return (data || []).map((b: any) => ({
        id: b.id,
        name: b.name,
        slug: b.slug,
        isMain: b.is_main,
        isActive: b.is_active
      }));
    }

    case 'customers': {
      const { data, error } = await supabase
        .from('customers')
        .select('id, full_name, phone, email, notes, balance')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .order('full_name');
      if (error) {
        if (error.code === '42P01') return [];
        throw new Error('customers: ' + error.message);
      }
      return (data || []).map((c: any) => ({
        id:      c.id,
        name:    c.full_name,
        phone:   c.phone || '',
        email:   c.email || '',
        notes:   c.notes || '',
        balance: Number(c.balance || 0)
      }));
    }

    case 'customer_transactions': {
      const { data, error } = await supabase
        .from('customer_transactions')
        .select('id, customer_id, amount, type, reference_id, notes, created_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });
      if (error) {
        if (error.code === '42P01') return [];
        throw new Error('customer_transactions: ' + error.message);
      }
      return (data || []).map((t: any) => ({
        id:          t.id,
        customerId:  t.customer_id,
        amount:      Number(t.amount),
        type:        t.type,
        referenceId: t.reference_id || '',
        notes:       t.notes || '',
        ts:          new Date(t.created_at).getTime()
      }));
    }

    case 'register_sessions': {
      const { data, error } = await supabase
        .from('register_sessions')
        .select('id, branch_id, opened_by, opened_at, closed_at, opening_cash, expected_cash, actual_cash, status, notes')
        .eq('tenant_id', tenantId)
        .order('opened_at', { ascending: false });
      if (error) {
        if (error.code === '42P01') return [];
        throw new Error('register_sessions: ' + error.message);
      }
      return (data || []).map((s: any) => ({
        id:          s.id,
        branchId:    s.branch_id,
        openedBy:    s.opened_by || '',
        openedAt:    new Date(s.opened_at).getTime(),
        closedAt:    s.closed_at ? new Date(s.closed_at).getTime() : null,
        openingCash: Number(s.opening_cash),
        expectedCash:Number(s.expected_cash),
        actualCash:  Number(s.actual_cash),
        status:      s.status,
        notes:       s.notes || ''
      }));
    }

    case 'stock_transfers': {
      const { data, error } = await supabase
        .from('stock_transfers')
        .select('id, from_branch_id, to_branch_id, status, items, notes, created_at, completed_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });
      if (error) {
        if (error.code === '42P01') return [];
        throw new Error('stock_transfers: ' + error.message);
      }
      return (data || []).map((t: any) => ({
        id:           t.id,
        fromBranchId: t.from_branch_id,
        toBranchId:   t.to_branch_id,
        status:       t.status,
        items:        t.items || [],
        notes:        t.notes || '',
        createdAt:    new Date(t.created_at).getTime(),
        completedAt:  t.completed_at ? new Date(t.completed_at).getTime() : null
      }));
    }

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
        .select('id, order_number, customer_name, customer_phone, delivery_address, total, status, items_data, created_at, payment_method, customer_id, register_id, branch_id')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw new Error('orders: ' + error.message);
      return (data || []).map((r: any) => ({
        no:            r.order_number,
        name:          r.customer_name || '',
        phone:         r.customer_phone || '',
        addr:          r.delivery_address || '',
        items: (r.items_data || []).map((i: any) => ({
          id:       i.id,
          name:     i.name,
          qty:      Number(i.qty || i.quantity || 1),
          quantity: Number(i.qty || i.quantity || 1),
          price:    Number(i.price),
        })),
        total:         Number(r.total),
        ts:            new Date(r.created_at).getTime(),
        status:        ORDER_STATUS[r.status] ?? 0,
        paymentMethod: r.payment_method || 'cash',
        customerId:    r.customer_id || '',
        registerId:    r.register_id || '',
        branchId:      r.branch_id || ''
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
          .eq('branch_id', activeBranch)
          .range(from, from + 499);
        if (error) {
          if (error.code === '42703' || error.message.includes('column "branch_id"')) {
            const { data: fallbackData, error: fbError } = await supabase
              .from('product_stock')
              .select('product_legacy_id, qty, min_qty')
              .eq('tenant_id', tenantId)
              .range(from, from + 499);
            if (fbError) throw new Error('stock fallback: ' + fbError.message);
            if (!fallbackData?.length) break;
            rows.push(...fallbackData);
            if (fallbackData.length < 500) break;
            from += 500;
            continue;
          }
          throw new Error('stock: ' + error.message);
        }
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

    default: {
      const { data, error } = await supabase
        .from(coll)
        .select('*')
        .eq('tenant_id', tenantId);
      if (error) {
        if (error.code === '42P01' || error.message.includes('relation') || error.message.includes('does not exist')) {
          const fs = require('fs');
          const dbFile = `c:/AYDIN GROS/db_${coll}.json`;
          if (fs.existsSync(dbFile)) {
            try {
              return JSON.parse(fs.readFileSync(dbFile, 'utf8'));
            } catch(e) {
              return [];
            }
          }
          return [];
        }
        throw new Error(`${coll}: ` + error.message);
      }
      return data || [];
    }
  }
}

const DEMO_CATEGORIES = [
  { slug: 'manav', name: 'Manav', display_order: 1 },
  { slug: 'temel-gida', name: 'Temel Gıda', display_order: 2 },
  { slug: 'sut-sarkuteri', name: 'Süt & Şarküteri', display_order: 3 },
  { slug: 'icecek', name: 'İçecek', display_order: 4 },
  { slug: 'temizlik', name: 'Temizlik', display_order: 5 }
];

const DEMO_PRODUCTS = [
  { legacy_id: 101, name: 'Salkım Domates', cat: 'manav', price: 29.90, unit: 'kg', emoji: '🍅', barcode: '8690000000101' },
  { legacy_id: 102, name: 'Amasya Elması', cat: 'manav', price: 34.50, unit: 'kg', emoji: '🍎', barcode: '8690000000102' },
  { legacy_id: 103, name: 'Yerli Muz', cat: 'manav', price: 48.00, unit: 'kg', emoji: '🍌', barcode: '8690000000103' },
  { legacy_id: 104, name: 'Ekmek 200g', cat: 'temel-gida', price: 10.00, unit: 'adet', emoji: '🍞', barcode: '8690000000104' },
  { legacy_id: 105, name: 'Filiz Çay 500g', cat: 'temel-gida', price: 85.00, unit: 'adet', emoji: '☕', barcode: '8690000000105' },
  { legacy_id: 106, name: 'Pilavlık Pirinç 1kg', cat: 'temel-gida', price: 62.00, unit: 'adet', emoji: '🌾', barcode: '8690000000106' },
  { legacy_id: 107, name: 'Yarım Yağlı Süt 1L', cat: 'sut-sarkuteri', price: 28.50, unit: 'adet', emoji: '🥛', barcode: '8690000000107' },
  { legacy_id: 108, name: 'Klasik Peynir 500g', cat: 'sut-sarkuteri', price: 145.00, unit: 'adet', emoji: '🧀', barcode: '8690000000108' },
  { legacy_id: 109, name: 'Tava Yoğurt 1.5kg', cat: 'sut-sarkuteri', price: 78.00, unit: 'adet', emoji: '🥛', barcode: '8690000000109' },
  { legacy_id: 110, name: 'Doğal Kaynak Suyu 5L', cat: 'icecek', price: 18.00, unit: 'adet', emoji: '💧', barcode: '8690000000110' },
  { legacy_id: 111, name: 'Kola 1.5L', cat: 'icecek', price: 42.00, unit: 'adet', emoji: '🥤', barcode: '8690000000111' },
  { legacy_id: 112, name: 'Bulaşık Deterjanı 750ml', cat: 'temizlik', price: 54.00, unit: 'adet', emoji: '🧼', barcode: '8690000000112' }
];

async function supabaseWrite(coll: string, body: any, supabase: any, tenantId: string, branchId?: string) {
  const activeBranch = branchId || '22222222-2222-2222-2222-222222222222';
  switch (coll) {
    case 'seed': {
      const tenantToUse = body.tenant_id || tenantId;
      const branchToUse = body.branch_id || activeBranch;

      for (const cat of DEMO_CATEGORIES) {
        const { data: existingCat } = await supabase
          .from('categories')
          .select('id')
          .eq('tenant_id', tenantToUse)
          .eq('name', cat.name)
          .maybeSingle();

        let catId;
        if (existingCat) {
          catId = existingCat.id;
        } else {
          const { data: newCat } = await supabase
            .from('categories')
            .insert({
              tenant_id: tenantToUse,
              name: cat.name,
              sort_order: cat.display_order
            })
            .select('id')
            .single();
          catId = newCat?.id;
        }

        const catProducts = DEMO_PRODUCTS.filter(p => p.cat === cat.slug);
        for (const prod of catProducts) {
          const { data: existingProd } = await supabase
            .from('products')
            .select('id')
            .eq('tenant_id', tenantToUse)
            .eq('legacy_id', prod.legacy_id)
            .maybeSingle();

          let productId;
          if (existingProd) {
            productId = existingProd.id;
          } else {
            const { data: newProd } = await supabase
              .from('products')
              .insert({
                tenant_id: tenantToUse,
                category_id: catId || null,
                name: prod.name,
                price: prod.price,
                unit: prod.unit,
                legacy_id: prod.legacy_id,
                is_active: true
              })
              .select('id')
              .single();
            productId = newProd?.id;
          }

          if (productId) {
            const { data: existingBarcode } = await supabase
              .from('product_barcodes')
              .select('id')
              .eq('tenant_id', tenantToUse)
              .eq('barcode', prod.barcode)
              .maybeSingle();

            if (!existingBarcode) {
              await supabase.from('product_barcodes').insert({
                tenant_id: tenantToUse,
                product_legacy_id: prod.legacy_id,
                product_id: productId,
                barcode: prod.barcode,
                is_active: true
              });
            }

            const { data: existingStock } = await supabase
              .from('product_stock')
              .select('product_legacy_id')
              .eq('tenant_id', tenantToUse)
              .eq('branch_id', branchToUse)
              .eq('product_legacy_id', prod.legacy_id)
              .maybeSingle();

            if (!existingStock) {
              await supabase.from('product_stock').insert({
                tenant_id: tenantToUse,
                branch_id: branchToUse,
                product_legacy_id: prod.legacy_id,
                product_id: productId,
                qty: 100,
                min_qty: 5
              });
            }
          }
        }
      }
      return;
    }

    case 'orders': {
      const rows = (Array.isArray(body) ? body : []).map(o => ({
        tenant_id:        tenantId,
        branch_id:        o.branchId || activeBranch,
        register_id:      null,
        session_id:       o.registerId || o.sessionId || null,
        customer_id:      o.customerId || null,
        order_number:     o.no,
        customer_name:    o.name || '',
        customer_phone:   o.phone || '',
        delivery_address: o.addr || '',
        total:            o.total || 0,
        subtotal:         o.total || 0,
        status:           STATUS_FROM_INT[o.status] || 'pending',
        items_data:       o.items || [],
        payment_method:   o.paymentMethod || 'cash',
        payment_status:   (o.paymentMethod === 'veresiye' ? 'pending' : 'paid'),
        created_at:       o.ts ? new Date(o.ts).toISOString() : new Date().toISOString(),
      }));
      if (!rows.length) return;

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
          const release = await stockLock.acquire();
          try {
            const { data: stocks, error: stockError } = await supabase
              .from('product_stock')
              .select('product_legacy_id, qty')
              .eq('tenant_id', tenantId)
              .eq('branch_id', activeBranch)
              .in('product_legacy_id', productIds);
            
            let stockMap: Record<number, number> = {};
            if (stockError) {
              if (stockError.code === '42703' || stockError.message.includes('column "branch_id"')) {
                const { data: fallbackStocks, error: fbErr } = await supabase
                  .from('product_stock')
                  .select('product_legacy_id, qty')
                  .eq('tenant_id', tenantId)
                  .in('product_legacy_id', productIds);
                if (fbErr) throw new Error('Stok sorgulama hatası: ' + fbErr.message);
                (fallbackStocks || []).forEach((s: any) => {
                  stockMap[s.product_legacy_id] = s.qty || 0;
                });
              } else {
                throw new Error('Stok sorgulama hatası: ' + stockError.message);
              }
            } else {
              (stocks || []).forEach((s: any) => {
                stockMap[s.product_legacy_id] = s.qty || 0;
              });
            }

            for (const pid of productIds) {
              const demand = demands[pid];
              const currentStock = stockMap[pid] ?? 0;
              if (currentStock < demand) {
                throw new Error(`Stok yetersiz: ${itemNames[pid]} (Talep: ${demand}, Mevcut Stok: ${currentStock})`);
              }
            }

            for (const pid of productIds) {
              const demand = demands[pid];
              const currentStock = stockMap[pid] ?? 0;
              const newStock = currentStock - demand;
              
              const { error: updateError } = await supabase
                .from('product_stock')
                .update({ qty: newStock, updated_at: new Date().toISOString() })
                .eq('tenant_id', tenantId)
                .eq('branch_id', activeBranch)
                .eq('product_legacy_id', pid);
              
              if (updateError) {
                const { error: fbErr } = await supabase
                  .from('product_stock')
                  .update({ qty: newStock, updated_at: new Date().toISOString() })
                  .eq('tenant_id', tenantId)
                  .eq('product_legacy_id', pid);
                if (fbErr) throw new Error(`Stok düşme hatası (${itemNames[pid]}): ` + fbErr.message);
              }
            }
          } finally {
            release();
          }
        }

        for (const order of newOrders) {
          if (order.customer_id && (order.payment_method === 'veresiye' || order.payment_method === 'mixed')) {
            const amount = Number(order.total || 0);
            await supabase.from('customer_transactions').insert({
              tenant_id: tenantId,
              customer_id: order.customer_id,
              amount: amount,
              type: 'purchase',
              reference_id: null,
              notes: `Satış Noktası Sipariş: #${order.order_number}`
            });

            const { data: customer } = await supabase
              .from('customers')
              .select('balance')
              .eq('id', order.customer_id)
              .single();
            if (customer) {
              const newBal = Number(customer.balance || 0) + amount;
              await supabase
                .from('customers')
                .update({ balance: newBal, updated_at: new Date().toISOString() })
                .eq('id', order.customer_id);
            }
          }

          if (order.register_id && order.payment_method === 'cash') {
            const amount = Number(order.total || 0);
            const { data: regSession } = await supabase
              .from('register_sessions')
              .select('expected_cash')
              .eq('id', order.register_id)
              .single();
            
            if (regSession) {
              const newExpected = Number(regSession.expected_cash || 0) + amount;
              await supabase
                .from('register_sessions')
                .update({ expected_cash: newExpected })
                .eq('id', order.register_id);
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

    case 'customers': {
      const rows = (Array.isArray(body) ? body : []).map(c => ({
        id:         c.id || undefined,
        tenant_id:  tenantId,
        full_name:  c.name || '',
        phone:      c.phone || null,
        email:      c.email || null,
        notes:      c.notes || '',
        balance:    Number(c.balance || 0),
        updated_at: new Date().toISOString()
      }));

      const incomingIds = new Set(rows.map((r: any) => r.id).filter(Boolean));
      const { data: existing, error: fetchErr } = await supabase
        .from('customers')
        .select('id')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null);
      
      if (!fetchErr && existing) {
        const deletedIds = (existing || []).map((r: any) => r.id).filter((id: any) => !incomingIds.has(id));
        if (deletedIds.length > 0) {
          await supabase
            .from('customers')
            .update({ deleted_at: new Date().toISOString() })
            .in('id', deletedIds);
        }
      }

      if (rows.length > 0) {
        const { error } = await supabase
          .from('customers')
          .upsert(rows, { onConflict: 'id' });
        if (error) throw new Error('customers write: ' + error.message);
      }
      return;
    }

    case 'customer_transactions': {
      const items = Array.isArray(body) ? body : [body];
      const rows = items.map(t => ({
        tenant_id:    tenantId,
        customer_id:  t.customerId,
        amount:       Number(t.amount || 0),
        type:         t.type || 'payment',
        reference_id: t.referenceId || null,
        notes:        t.notes || '',
        created_at:   t.ts ? new Date(t.ts).toISOString() : new Date().toISOString()
      }));

      if (!rows.length) return;
      const { error } = await supabase
        .from('customer_transactions')
        .insert(rows);
      if (error) throw new Error('customer_transactions write: ' + error.message);

      for (const row of rows) {
        const { data: customer } = await supabase
          .from('customers')
          .select('balance')
          .eq('id', row.customer_id)
          .single();
        if (customer) {
          const newBal = Number(customer.balance || 0) + row.amount;
          await supabase
            .from('customers')
            .update({ balance: newBal, updated_at: new Date().toISOString() })
            .eq('id', row.customer_id);
        }
      }
      return;
    }

    case 'register_sessions': {
      const items = Array.isArray(body) ? body : [body];
      const rows = items.map(s => ({
        id:            s.id || undefined,
        tenant_id:     tenantId,
        branch_id:     s.branchId || activeBranch,
        opened_by:     s.openedBy || null,
        opened_at:     s.openedAt ? new Date(s.openedAt).toISOString() : new Date().toISOString(),
        closed_at:     s.closedAt ? new Date(s.closedAt).toISOString() : null,
        opening_cash:  Number(s.openingCash || 0),
        expected_cash: Number(s.expectedCash || 0),
        actual_cash:   Number(s.actualCash || 0),
        status:        s.status || 'open',
        notes:         s.notes || ''
      }));

      if (!rows.length) return;
      const { error } = await supabase
        .from('register_sessions')
        .upsert(rows, { onConflict: 'id' });
      if (error) throw new Error('register_sessions write: ' + error.message);
      return;
    }

    case 'stock_transfers': {
      const items = Array.isArray(body) ? body : [body];
      const rows = items.map(t => ({
        id:             t.id || undefined,
        tenant_id:      tenantId,
        from_branch_id: t.fromBranchId,
        to_branch_id:   t.toBranchId,
        status:         t.status || 'pending',
        items:          t.items || [],
        notes:          t.notes || '',
        created_at:     t.createdAt ? new Date(t.createdAt).toISOString() : new Date().toISOString(),
        completed_at:   t.completedAt ? new Date(t.completedAt).toISOString() : null
      }));

      if (!rows.length) return;

      for (const row of rows) {
        if (row.status === 'completed' && row.id) {
          const { data: currentTransfer } = await supabase
            .from('stock_transfers')
            .select('status')
            .eq('id', row.id)
            .single();
          
          if (currentTransfer && currentTransfer.status !== 'completed') {
            for (const item of (row.items || [])) {
              const legacyId = Number(item.id || item.legacy_id);
              const qty = Number(item.qty || item.quantity || 0);

              if (legacyId && qty > 0) {
                const { data: sStock } = await supabase
                  .from('product_stock')
                  .select('qty')
                  .eq('tenant_id', tenantId)
                  .eq('branch_id', row.from_branch_id)
                  .eq('product_legacy_id', legacyId)
                  .single();
                
                const sQty = Number(sStock?.qty || 0);
                await supabase
                  .from('product_stock')
                  .upsert({
                    tenant_id: tenantId,
                    branch_id: row.from_branch_id,
                    product_legacy_id: legacyId,
                    qty: Math.max(0, sQty - qty),
                    updated_at: new Date().toISOString()
                  }, { onConflict: 'tenant_id,branch_id,product_legacy_id' });

                const { data: tStock } = await supabase
                  .from('product_stock')
                  .select('qty')
                  .eq('tenant_id', tenantId)
                  .eq('branch_id', row.to_branch_id)
                  .eq('product_legacy_id', legacyId)
                  .single();
                
                const tQty = Number(tStock?.qty || 0);
                await supabase
                  .from('product_stock')
                  .upsert({
                    tenant_id: tenantId,
                    branch_id: row.to_branch_id,
                    product_legacy_id: legacyId,
                    qty: tQty + qty,
                    updated_at: new Date().toISOString()
                  }, { onConflict: 'tenant_id,branch_id,product_legacy_id' });
              }
            }
            row.completed_at = new Date().toISOString();
          }
        }
      }

      const { error } = await supabase
        .from('stock_transfers')
        .upsert(rows, { onConflict: 'id' });
      if (error) throw new Error('stock_transfers write: ' + error.message);
      return;
    }

    case 'branches': {
      const items = Array.isArray(body) ? body : [body];
      const rows = items.map(b => ({
        id: b.id || crypto.randomUUID(),
        tenant_id: tenantId,
        name: b.name,
        slug: (b.slug || b.name || '')
          .toString()
          .toLowerCase()
          .trim()
          .replace(/[çÇ]/g, 'c')
          .replace(/[ğĞ]/g, 'g')
          .replace(/[ıİ]/g, 'i')
          .replace(/[öÖ]/g, 'o')
          .replace(/[şŞ]/g, 's')
          .replace(/[üÜ]/g, 'u')
          .replace(/[^a-z0-9\-]/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-+|-+$/g, '') || 'sube',
        address: b.address || null,
        phone: b.phone || null,
        is_active: b.is_active ?? b.isActive ?? true
      }));
      if (!rows.length) return;
      const { error } = await supabase.from('branches').upsert(rows, { onConflict: 'id' });
      if (error) {
        if (error.message.includes('slug') || error.message.includes('column') || error.message.includes('schema cache')) {
          const fallbackRows = rows.map(r => ({
            id: r.id,
            tenant_id: r.tenant_id,
            name: r.name,
            address: r.address,
            phone: r.phone,
            is_active: r.is_active
          }));
          const { error: fErr } = await supabase.from('branches').upsert(fallbackRows, { onConflict: 'id' });
          if (fErr) throw new Error('branches write fallback: ' + fErr.message);
          return;
        }
        throw new Error('branches write: ' + error.message);
      }
      return;
    }

    case 'products': {
      const { data: categories, error: catError } = await supabase
        .from('categories')
        .select('id, slug')
        .eq('tenant_id', tenantId);
      if (catError) throw new Error('Kategoriler sorgulanamadı: ' + catError.message);
      
      const categoryMap: Record<string, string> = {};
      (categories || []).forEach((c: any) => {
        if (c.slug) categoryMap[c.slug] = c.id;
      });

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
      const { data: existing, error: fetchErr } = await supabase
        .from('categories')
        .select('id, slug')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null);
      if (fetchErr) throw new Error('Kategoriler sorgulanamadı: ' + fetchErr.message);

      const uuidMap: Record<string, string> = {};
      (existing || []).forEach((r: any) => {
        if (r.slug) uuidMap[r.slug] = r.id;
      });

      const incomingCategories = (Array.isArray(body) ? body : []);
      const incomingSlugs = new Set(incomingCategories.map(c => c.slug).filter(Boolean));

      const deletedUuids = Object.entries(uuidMap)
        .filter(([slug]) => !incomingSlugs.has(slug))
        .map(([, uuid]) => uuid);

      if (deletedUuids.length > 0) {
        const { error: deleteErr } = await supabase
          .from('categories')
          .update({ deleted_at: new Date().toISOString(), is_active: false })
          .in('id', deletedUuids);
        if (deleteErr) throw new Error('Kategori silme hatası: ' + deleteErr.message);
      }

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
        branch_id:         activeBranch,
        product_legacy_id: parseInt(legacyId, 10),
        qty:               s.qty ?? 50,
        min_qty:           s.min ?? 5,
        updated_at:        new Date().toISOString(),
      })).filter(r => !isNaN(r.product_legacy_id));
      if (!rows.length) return;
      const { error } = await supabase
        .from('product_stock')
        .upsert(rows, { onConflict: 'tenant_id,branch_id,product_legacy_id' });
      if (error) {
        if (error.code === '42703' || error.message.includes('column "branch_id"')) {
          const oldRows = rows.map(r => {
            const { branch_id, ...rest } = r as any;
            return rest;
          });
          const { error: oldErr } = await supabase
            .from('product_stock')
            .upsert(oldRows, { onConflict: 'tenant_id,product_legacy_id' });
          if (oldErr) throw new Error('stock write fallback: ' + oldErr.message);
          return;
        }
        throw new Error('stock write: ' + error.message);
      }
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

    default: {
      const items = Array.isArray(body) ? body : [body];
      const rows = items.map((row: any) => ({
        ...row,
        tenant_id: tenantId,
        updated_at: new Date().toISOString()
      }));
      
      const { error } = await supabase
        .from(coll)
        .upsert(rows);
      if (error) {
        if (error.code === '42P01' || error.message.includes('relation') || error.message.includes('does not exist')) {
          const fs = require('fs');
          const dbFile = `c:/AYDIN GROS/db_${coll}.json`;
          fs.writeFileSync(dbFile, JSON.stringify(body));
          return;
        }
        throw new Error(`${coll} write: ` + error.message);
      }
      return;
    }
  }
}

export async function GET(req: NextRequest) {
  const coll = req.nextUrl.searchParams.get('coll');

  if (!coll || !/^[a-z0-9_-]+$/i.test(coll)) {
    return NextResponse.json({ error: 'Geçersiz koleksiyon adı' }, { status: 400 });
  }

  const auth = await checkAuth(req);
  const isStaff = auth.isAuthenticated && ['admin', 'manager', 'branch_manager', 'cashier', 'warehouse_person'].includes(auth.role);

  const publicReadCollections = ['products', 'categories', 'campaigns', 'promos', 'settings', 'stock'];
  if (!isStaff && !publicReadCollections.includes(coll)) {
    return NextResponse.json({ error: 'Bu koleksiyonu okumak için yetkiniz yok' }, { status: 403 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase yapılandırılmamış' }, { status: 503 });
  }

  let tenantIdToUse = auth.tenantId || TENANT_ID;
  if (auth.role === 'admin') {
    const override = req.nextUrl.searchParams.get('tenantId') || req.nextUrl.searchParams.get('tenant_id') || req.headers.get('x-tenant-id');
    if (override) tenantIdToUse = override;
  }
  console.log('[api/db] GET request:', { coll, role: auth.role, tenantIdToUse });
  const branchId = req.nextUrl.searchParams.get('branchId') || req.nextUrl.searchParams.get('branch_id') || '22222222-2222-2222-2222-222222222222';

  try {
    const data = await supabaseRead(coll, supabase, tenantIdToUse, branchId);
    return NextResponse.json(data, {
      headers: {
        'X-Backend': 'supabase',
      },
    });
  } catch (error: any) {
    console.error(`[api/db] GET ${coll} hatası:`, error.message);
    const msg = error.message || '';
    if (msg.includes('Could not find') || msg.includes('relation') || msg.includes('does not exist')) {
      return NextResponse.json(coll === 'stock' ? {} : [], {
        headers: {
          'X-Backend': 'fallback',
        },
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const coll = req.nextUrl.searchParams.get('coll');

  if (!coll || !/^[a-z0-9_-]+$/i.test(coll)) {
    return NextResponse.json({ error: 'Geçersiz koleksiyon adı' }, { status: 400 });
  }

  const auth = await checkAuth(req);
  const isStaff = auth.isAuthenticated && ['admin', 'manager', 'branch_manager', 'cashier', 'warehouse_person'].includes(auth.role);

  const publicWriteCollections = ['orders'];
  if (!isStaff && !publicWriteCollections.includes(coll)) {
    return NextResponse.json({ error: 'Bu koleksiyonu yazmak için yetkiniz yok' }, { status: 403 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase yapılandırılmamış' }, { status: 503 });
  }

  let tenantIdToUse = auth.tenantId || TENANT_ID;
  if (auth.role === 'admin') {
    const override = req.nextUrl.searchParams.get('tenantId') || req.nextUrl.searchParams.get('tenant_id') || req.headers.get('x-tenant-id');
    if (override) tenantIdToUse = override;
  }
  const branchId = req.nextUrl.searchParams.get('branchId') || req.nextUrl.searchParams.get('branch_id') || '22222222-2222-2222-2222-222222222222';
  if (coll !== 'seed') {
    const license = await isLicenseActive(tenantIdToUse);
    if (!license.active) {
      return NextResponse.json({ error: license.reason }, { status: 403 });
    }
  }

  try {
    const body = await req.json();
    await supabaseWrite(coll, body, supabase, tenantIdToUse, branchId);
    return NextResponse.json({ success: true }, {
      headers: {
        'X-Backend': 'supabase',
      },
    });
  } catch (error: any) {
    console.error(`[api/db] POST ${coll} hatası:`, error.message);
    const msg = error.message || '';
    if (msg.includes('Could not find') || msg.includes('relation') || msg.includes('does not exist')) {
      return NextResponse.json({ success: true, warning: 'Schema updates missing, simulated write successful' }, {
        headers: {
          'X-Backend': 'fallback',
        },
      });
    }
    const status = error.message.includes('Stok yetersiz') ? 400 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}

export async function PUT(req: NextRequest) {
  return POST(req);
}

export const dynamic = 'force-dynamic';
