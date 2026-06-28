import { createServerClient, createAdminClient } from '../lib/supabase/server.js'

// ---------------------------------------------------------------------------
// Sabitler
// ---------------------------------------------------------------------------

const TENANT_ID =
  process.env.SUPABASE_TENANT_ID ||
  '11111111-1111-1111-1111-111111111111'

// ---------------------------------------------------------------------------
// Supabase format adaptörleri
// ---------------------------------------------------------------------------

const ORDER_STATUS = {
  pending: 0, confirmed: 1, preparing: 1, ready: 1,
  out_for_delivery: 2, delivered: 2, cancelled: -1, refunded: -1,
}
const STATUS_FROM_INT = ['pending', 'confirmed', 'out_for_delivery', 'delivered', 'cancelled']

const SETTINGS_KEY_MAP = {
  free_delivery_threshold: 'threshold',
  whatsapp_number:         'waNumber',
  branch1_name:            'branch1Name',
  branch1_address:         'branch1Addr',
  branch2_name:            'branch2Name',
  branch2_address:         'branch2Addr',
}
const SETTINGS_KEY_REVERSE = Object.fromEntries(
  Object.entries(SETTINGS_KEY_MAP).map(([k, v]) => [v, k])
)

// ---------------------------------------------------------------------------
// Supabase READ
// ---------------------------------------------------------------------------

async function supabaseRead(coll, supabase, tenantId) {
  switch (coll) {

    case 'products': {
      const rows = []
      let from = 0
      while (true) {
        const { data, error } = await supabase
          .from('products')
          .select('legacy_id, name, price, unit, image_url, is_active, metadata, categories(slug)')
          .eq('tenant_id', tenantId)
          .is('deleted_at', null)
          .not('legacy_id', 'is', null)
          .order('legacy_id')
          .range(from, from + 499)
        if (error) throw new Error('products: ' + error.message)
        if (!data?.length) break
        rows.push(...data)
        if (data.length < 500) break
        from += 500
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
      }))
    }

    case 'categories': {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name, slug, display_order, is_active')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .eq('is_active', true)
        .order('display_order')
      if (error) throw new Error('categories: ' + error.message)
      return (data || []).map(r => ({
        id:    r.id,
        name:  r.name,
        slug:  r.slug,
        order: r.display_order,
      }))
    }

    case 'orders': {
      const { data, error } = await supabase
        .from('orders')
        .select('id, order_number, customer_name, customer_phone, delivery_address, total, status, items_data, created_at')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw new Error('orders: ' + error.message)
      return (data || []).map(r => ({
        no:    r.order_number,
        name:  r.customer_name || '',
        phone: r.customer_phone || '',
        addr:  r.delivery_address || '',
        items: (r.items_data || []).map(i => ({
          id:       i.id,
          name:     i.name,
          qty:      Number(i.qty || i.quantity || 1),
          quantity: Number(i.qty || i.quantity || 1),
          price:    Number(i.price),
        })),
        total:  Number(r.total),
        ts:     new Date(r.created_at).getTime(),
        status: ORDER_STATUS[r.status] ?? 0,
      }))
    }

    case 'settings': {
      const { data, error } = await supabase
        .from('tenant_settings')
        .select('key, value')
        .eq('tenant_id', tenantId)
      if (error) throw new Error('settings: ' + error.message)
      return (data || []).reduce((acc, { key, value }) => {
        const mapped = SETTINGS_KEY_MAP[key]
        if (mapped) acc[mapped] = isNaN(value) ? value : Number(value)
        return acc
      }, {})
    }

    case 'campaigns': {
      const { data, error } = await supabase
        .from('campaigns')
        .select('id, name, type, discount_value, is_active, start_date, end_date')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
      if (error) throw new Error('campaigns: ' + error.message)
      return (data || []).map(r => ({
        id:        r.id,
        name:      r.name,
        type:      r.type,
        value:     r.discount_value,
        active:    r.is_active,
        start:     r.start_date,
        end:       r.end_date,
        minAmount: 0,
      }))
    }

    case 'promos': {
      const { data, error } = await supabase
        .from('coupons')
        .select('code, type, discount_value, is_active')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
      if (error) throw new Error('promos: ' + error.message)
      return (data || []).reduce((acc, r) => {
        acc[r.code] = {
          pct:      r.type === 'percentage' ? Number(r.discount_value) : 0,
          gift:     null,
          freeShip: r.type === 'free_shipping',
          active:   r.is_active,
        }
        return acc
      }, {})
    }

    case 'stock': {
      const rows = []
      let from = 0
      while (true) {
        const { data, error } = await supabase
          .from('product_stock')
          .select('product_legacy_id, qty, min_qty')
          .eq('tenant_id', tenantId)
          .range(from, from + 499)
        if (error) throw new Error('stock: ' + error.message)
        if (!data?.length) break
        rows.push(...data)
        if (data.length < 500) break
        from += 500
      }
      return rows.reduce((acc, r) => {
        acc[r.product_legacy_id] = { qty: r.qty, min: r.min_qty }
        return acc
      }, {})
    }

    case 'invoices': {
      const { data, error } = await supabase
        .from('invoices')
        .select('data, created_at')
        .eq('tenant_id', tenantId)
        .not('data', 'is', null)
        .order('created_at', { ascending: false })
      if (error) throw new Error('invoices: ' + error.message)
      return (data || []).map(r => r.data)
    }

    default:
      throw new Error(`Bilinmeyen koleksiyon: ${coll}`)
  }
}

// ---------------------------------------------------------------------------
// Supabase WRITE
// ---------------------------------------------------------------------------

async function supabaseWrite(coll, body, supabase, tenantId) {
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
      }))
      if (!rows.length) return
      const { error } = await supabase
        .from('orders')
        .upsert(rows, { onConflict: 'order_number' })
      if (error) throw new Error('orders write: ' + error.message)
      return
    }

    case 'settings': {
      const entries = Object.entries(body || {})
        .filter(([k]) => SETTINGS_KEY_REVERSE[k])
        .map(([k, v]) => ({
          tenant_id: tenantId,
          key:       SETTINGS_KEY_REVERSE[k],
          value:     String(v),
        }))
      if (!entries.length) return
      const { error } = await supabase
        .from('tenant_settings')
        .upsert(entries, { onConflict: 'tenant_id,key' })
      if (error) throw new Error('settings write: ' + error.message)
      return
    }

    case 'campaigns': {
      await supabase.from('campaigns').delete().eq('tenant_id', tenantId)
      const rows = (Array.isArray(body) ? body : []).map(c => ({
        tenant_id:      tenantId,
        name:           c.name || 'Kampanya',
        type:           c.type || 'pct',
        discount_value: c.value || 0,
        is_active:      c.active !== false,
        start_date:     c.start || null,
        end_date:       c.end   || null,
      }))
      if (!rows.length) return
      const { error } = await supabase.from('campaigns').insert(rows)
      if (error) throw new Error('campaigns write: ' + error.message)
      return
    }

    case 'promos': {
      await supabase.from('coupons').delete().eq('tenant_id', tenantId)
      const rows = Object.entries(body || {}).map(([code, p]) => ({
        tenant_id:      tenantId,
        code,
        type:           p.pct > 0 ? 'percentage' : (p.freeShip ? 'free_shipping' : 'gift'),
        discount_value: p.pct || 0,
        is_active:      p.active !== false,
      }))
      if (!rows.length) return
      const { error } = await supabase.from('coupons').insert(rows)
      if (error) throw new Error('promos write: ' + error.message)
      return
    }

    case 'stock': {
      const rows = Object.entries(body || {}).map(([legacyId, s]) => ({
        tenant_id:         tenantId,
        product_legacy_id: parseInt(legacyId, 10),
        qty:               s.qty ?? 50,
        min_qty:           s.min ?? 5,
        updated_at:        new Date().toISOString(),
      })).filter(r => !isNaN(r.product_legacy_id))
      if (!rows.length) return
      const { error } = await supabase
        .from('product_stock')
        .upsert(rows, { onConflict: 'tenant_id,product_legacy_id' })
      if (error) throw new Error('stock write: ' + error.message)
      return
    }

    case 'invoices': {
      await supabase.from('invoices').delete().eq('tenant_id', tenantId)
      const rows = (Array.isArray(body) ? body : []).map(inv => ({
        tenant_id:  tenantId,
        data:       inv,
        created_at: inv.ts ? new Date(inv.ts).toISOString() : new Date().toISOString(),
      }))
      if (!rows.length) return
      const { error } = await supabase.from('invoices').insert(rows)
      if (error) throw new Error('invoices write: ' + error.message)
      return
    }

    default:
      throw new Error(`Bilinmeyen koleksiyon: ${coll}`)
  }
}

// ---------------------------------------------------------------------------
// Kimlik Doğrulama Katmanı
// ---------------------------------------------------------------------------

async function checkAuth(req) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return { isAuthenticated: false, role: 'anon', tenantId: null }
  }
  const token = authHeader.substring(7)
  if (!token) {
    return { isAuthenticated: false, role: 'anon', tenantId: null }
  }

  // Token doğrulaması için standard anon istemcisini kullanırız
  const anonClient = createServerClient()
  if (!anonClient) {
    return { isAuthenticated: false, role: 'anon', tenantId: null }
  }

  try {
    const { data: { user }, error } = await anonClient.auth.getUser(token)
    if (error || !user) {
      return { isAuthenticated: false, role: 'anon', tenantId: null }
    }

    const meta = user.user_metadata || {}
    const appMeta = user.app_metadata || {}
    const role = meta.role || appMeta.role || 'viewer'
    const tenantId = meta.tenant_id || appMeta.tenant_id || null

    return { isAuthenticated: true, role, tenantId, user }
  } catch (e) {
    return { isAuthenticated: false, role: 'anon', tenantId: null }
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default async function handler(req, res) {
  const coll = req.query.coll

  if (!coll || !/^[a-z0-9_-]+$/i.test(coll)) {
    return res.status(400).json({ error: 'Geçersiz koleksiyon adı' })
  }

  // 1. Yetki ve Rol doğrulaması yap
  const auth = await checkAuth(req)
  const isStaff = auth.isAuthenticated && ['admin', 'manager', 'branch_manager', 'cashier', 'warehouse_person'].includes(auth.role)

  // Anonim (Public) erişim izin matrisi
  const publicReadCollections = ['products', 'categories', 'campaigns', 'promos', 'settings', 'stock']
  const publicWriteCollections = ['orders']

  if (req.method === 'GET') {
    if (!isStaff && !publicReadCollections.includes(coll)) {
      return res.status(403).json({ error: 'Bu koleksiyonu okumak için yetkiniz yok.' })
    }
  } else if (req.method === 'POST' || req.method === 'PUT') {
    if (!isStaff && !publicWriteCollections.includes(coll)) {
      return res.status(403).json({ error: 'Bu koleksiyonu yazmak için yetkiniz yok.' })
    }
  } else {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // 2. Supabase Admin istemcisini başlat
  const supabase = createAdminClient()
  if (!supabase) {
    return res.status(503).json({ error: 'Supabase yapılandırılmamış' })
  }

  // Kullanıcının kendi tenant_id'si varsa onu kullan, yoksa varsayılana düş
  const tenantIdToUse = auth.tenantId || TENANT_ID

  res.setHeader('X-Backend', 'supabase')

  try {
    if (req.method === 'GET') {
      const data = await supabaseRead(coll, supabase, tenantIdToUse)
      return res.status(200).json(data)
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      await supabaseWrite(coll, req.body, supabase, tenantIdToUse)
      return res.status(200).json({ success: true })
    }
  } catch (error) {
    console.error(`[api/db] ${coll} hatası:`, error.message)
    return res.status(500).json({ error: error.message })
  }
}
