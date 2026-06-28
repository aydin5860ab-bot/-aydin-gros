import { createServerClient } from '../lib/supabase/server.js'

// ---------------------------------------------------------------------------
// Sabitler
// ---------------------------------------------------------------------------

const JSONBLOB_URL =
  process.env.JSONBLOB_URL ||
  'https://jsonblob.com/api/jsonBlob/019f0673-4992-7b6d-916a-3a0dd2181397'

const TENANT_ID =
  process.env.SUPABASE_TENANT_ID ||
  '11111111-1111-1111-1111-111111111111'

// Sprint 3F: tüm koleksiyonlar Supabase'den okunuyor.
// JSONBlob sadece Supabase başarısız olursa fallback olarak devrede.
const JSONBLOB_ONLY = new Set([])

// ---------------------------------------------------------------------------
// JSONBlob yardımcıları (fallback)
// ---------------------------------------------------------------------------

async function jsonblobRead(coll) {
  const r = await fetch(JSONBLOB_URL, { headers: { Accept: 'application/json' } })
  if (!r.ok) throw new Error(`JSONBlob GET ${r.status}`)
  const data = await r.json()
  return coll ? (data[coll] ?? null) : data
}

async function jsonblobWrite(coll, body) {
  const r = await fetch(JSONBLOB_URL, { headers: { Accept: 'application/json' } })
  let full = r.ok ? await r.json() : {}
  if (coll) full[coll] = body
  else full = body
  const put = await fetch(JSONBLOB_URL, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(full),
  })
  if (!put.ok) throw new Error(`JSONBlob PUT ${put.status}`)
}

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

async function supabaseRead(coll, supabase) {
  switch (coll) {

    case 'products': {
      const { data, error } = await supabase
        .from('products')
        .select('legacy_id, name, price, unit, image_url, is_active, metadata, categories(slug)')
        .eq('tenant_id', TENANT_ID)
        .is('deleted_at', null)
        .not('legacy_id', 'is', null)
        .order('legacy_id')
      if (error || !data?.length) return null
      return data.map(r => ({
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
        .eq('tenant_id', TENANT_ID)
        .is('deleted_at', null)
        .eq('is_active', true)
        .order('display_order')
      if (error || !data?.length) return null
      return data.map(r => ({
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
        .eq('tenant_id', TENANT_ID)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) return null
      if (!data?.length) return []
      return data.map(r => ({
        no:     r.order_number,
        name:   r.customer_name || '',
        phone:  r.customer_phone || '',
        addr:   r.delivery_address || '',
        items:  (r.items_data || []).map(i => ({
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
        .eq('tenant_id', TENANT_ID)
      if (error) return null
      if (!data?.length) return {}
      return data.reduce((acc, { key, value }) => {
        const mapped = SETTINGS_KEY_MAP[key]
        if (mapped) acc[mapped] = isNaN(value) ? value : Number(value)
        return acc
      }, {})
    }

    case 'campaigns': {
      const { data, error } = await supabase
        .from('campaigns')
        .select('id, name, type, discount_value, is_active, start_date, end_date')
        .eq('tenant_id', TENANT_ID)
        .is('deleted_at', null)
      if (error) return null
      if (!data?.length) return []
      return data.map(r => ({
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
        .eq('tenant_id', TENANT_ID)
        .is('deleted_at', null)
      if (error) return null
      if (!data?.length) return {}
      return data.reduce((acc, r) => {
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
      const { data, error } = await supabase
        .from('product_stock')
        .select('product_legacy_id, qty, min_qty')
        .eq('tenant_id', TENANT_ID)
      if (error) return null
      if (!data?.length) return {}
      return data.reduce((acc, r) => {
        acc[r.product_legacy_id] = { qty: r.qty, min: r.min_qty }
        return acc
      }, {})
    }

    case 'invoices': {
      const { data, error } = await supabase
        .from('invoices')
        .select('data, created_at')
        .eq('tenant_id', TENANT_ID)
        .not('data', 'is', null)
        .order('created_at', { ascending: false })
      if (error) return null
      if (!data?.length) return []
      return data.map(r => r.data)
    }

    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// Supabase WRITE
// ---------------------------------------------------------------------------

async function supabaseWrite(coll, body, supabase) {
  switch (coll) {

    case 'orders': {
      const rows = (Array.isArray(body) ? body : []).map(o => ({
        tenant_id:     TENANT_ID,
        order_number:  o.no,
        customer_name: o.name || '',
        customer_phone:o.phone || '',
        delivery_address: o.addr || '',
        total:         o.total || 0,
        subtotal:      o.total || 0,
        status:        STATUS_FROM_INT[o.status] || 'pending',
        items_data:    o.items || [],
        created_at:    o.ts ? new Date(o.ts).toISOString() : new Date().toISOString(),
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
          tenant_id: TENANT_ID,
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
      await supabase.from('campaigns').delete().eq('tenant_id', TENANT_ID)
      const rows = (Array.isArray(body) ? body : []).map(c => ({
        tenant_id:      TENANT_ID,
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
      await supabase.from('coupons').delete().eq('tenant_id', TENANT_ID)
      const rows = Object.entries(body || {}).map(([code, p]) => ({
        tenant_id:      TENANT_ID,
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
        tenant_id:         TENANT_ID,
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
      await supabase.from('invoices').delete().eq('tenant_id', TENANT_ID)
      const rows = (Array.isArray(body) ? body : []).map(inv => ({
        tenant_id:  TENANT_ID,
        data:       inv,
        created_at: inv.ts ? new Date(inv.ts).toISOString() : new Date().toISOString(),
      }))
      if (!rows.length) return
      const { error } = await supabase.from('invoices').insert(rows)
      if (error) throw new Error('invoices write: ' + error.message)
      return
    }

    default:
      return null // bilinmeyen koleksiyon → JSONBlob'a düşer
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default async function handler(req, res) {
  const coll = req.query.coll

  if (coll && !/^[a-z0-9_-]+$/i.test(coll)) {
    return res.status(400).json({ error: 'Geçersiz koleksiyon adı' })
  }

  try {
    // ── GET ────────────────────────────────────────────────────────────────
    if (req.method === 'GET') {
      if (!coll || JSONBLOB_ONLY.has(coll)) {
        const data = await jsonblobRead(coll)
        res.setHeader('X-Backend', 'jsonblob')
        return res.status(200).json(data)
      }

      const supabase = createServerClient()
      if (supabase) {
        try {
          const result = await supabaseRead(coll, supabase)
          if (result !== null) {
            res.setHeader('X-Backend', 'supabase')
            return res.status(200).json(result)
          }
        } catch (sbErr) {
          console.warn('[api/db] Supabase okuma hatası, JSONBlob fallback:', sbErr.message)
        }
      }

      const data = await jsonblobRead(coll)
      res.setHeader('X-Backend', 'jsonblob')
      return res.status(200).json(data)
    }

    // ── POST / PUT ─────────────────────────────────────────────────────────
    if (req.method === 'POST' || req.method === 'PUT') {
      const supabase = createServerClient()
      if (supabase && coll) {
        try {
          const result = await supabaseWrite(coll, req.body, supabase)
          if (result !== null) {          // null = bilinmeyen koleksiyon
            res.setHeader('X-Backend', 'supabase')
            return res.status(200).json({ success: true })
          }
        } catch (sbErr) {
          console.warn('[api/db] Supabase yazma hatası, JSONBlob fallback:', sbErr.message)
        }
      }

      await jsonblobWrite(coll, req.body)
      res.setHeader('X-Backend', 'jsonblob')
      return res.status(200).json({ success: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    console.error('[api/db] Hata:', error.message)
    return res.status(500).json({ error: error.message })
  }
}
