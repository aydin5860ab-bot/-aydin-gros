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

// stock ve invoices henüz Supabase'e geçmedi (integer ID bağımlılıkları var).
// products Sprint 3C ile Supabase'den okunuyor (legacy_id → id adaptörü ile).
const JSONBLOB_ONLY = new Set(['stock', 'invoices'])

// ---------------------------------------------------------------------------
// JSONBlob yardımcıları
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
// Supabase format adaptörleri  (Supabase satırı → eski frontend formatı)
// ---------------------------------------------------------------------------

const ORDER_STATUS = {
  pending: 0, confirmed: 1, preparing: 1, ready: 1,
  out_for_delivery: 2, delivered: 2, cancelled: -1, refunded: -1,
}

const SETTINGS_KEY_MAP = {
  free_delivery_threshold: 'threshold',
  whatsapp_number: 'waNumber',
  branch1_name: 'branch1Name',
  branch1_address: 'branch1Addr',
  branch2_name: 'branch2Name',
  branch2_address: 'branch2Addr',
}

/**
 * Supabase koleksiyonunu sorgular ve eski frontend formatına dönüştürür.
 * Hata durumunda veya sonuç boşsa null döner → çağıran JSONBlob'a düşer.
 */
async function supabaseRead(coll, supabase) {
  switch (coll) {
    case 'orders': {
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(*), customers(full_name, phone)')
        .eq('tenant_id', TENANT_ID)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error || !data?.length) return null
      return data.map(r => ({
        no: r.order_number,
        name: r.customers?.full_name || '',
        phone: r.customers?.phone || '',
        addr: r.delivery_address || '',
        items: (r.order_items || []).map(i => ({
          id: i.product_id,
          name: i.product_name,
          qty: i.quantity,
          quantity: i.quantity,
          price: Number(i.unit_price),
        })),
        total: Number(r.total),
        ts: new Date(r.created_at).getTime(),
        status: ORDER_STATUS[r.status] ?? 0,
      }))
    }

    case 'settings': {
      const { data, error } = await supabase
        .from('tenant_settings')
        .select('key, value')
        .eq('tenant_id', TENANT_ID)
      if (error || !data?.length) return null
      return data.reduce((acc, { key, value }) => {
        const mapped = SETTINGS_KEY_MAP[key]
        if (mapped) acc[mapped] = isNaN(value) ? value : Number(value)
        return acc
      }, {})
    }

    case 'campaigns': {
      const { data, error } = await supabase
        .from('campaigns')
        .select('id, name, type, value, is_active, starts_at, ends_at, min_order_amount')
        .eq('tenant_id', TENANT_ID)
        .is('deleted_at', null)
      if (error || !data?.length) return null
      return data.map(r => ({
        id: r.id,
        name: r.name,
        type: r.type,
        value: r.value,
        active: r.is_active,
        start: r.starts_at,
        end: r.ends_at,
        minAmount: r.min_order_amount,
      }))
    }

    case 'products': {
      // legacy_id → id adaptörü: frontend integer ID bekler.
      // emoji/badge metadata JSONB'de, kategori slug categories tablosundan JOIN ile.
      const { data, error } = await supabase
        .from('products')
        .select('legacy_id, name, price, unit, image_url, is_active, metadata, categories(slug)')
        .eq('tenant_id', TENANT_ID)
        .is('deleted_at', null)
        .not('legacy_id', 'is', null)
        .order('legacy_id')
      if (error || !data?.length) return null
      return data.map(r => ({
        id: r.legacy_id,
        name: r.name,
        price: Number(r.price),
        cat: r.categories?.slug || '',
        img: r.image_url || '',
        emoji: r.metadata?.emoji || '',
        badge: r.metadata?.badge || '',
        unit: r.unit || 'adet',
        active: r.is_active !== false,
      }))
    }

    case 'promos': {
      const { data, error } = await supabase
        .from('coupons')
        .select('code, type, value, description, is_active, gift_product_id')
        .eq('tenant_id', TENANT_ID)
        .is('deleted_at', null)
      if (error || !data?.length) return null
      return data.reduce((acc, r) => {
        acc[r.code] = {
          pct: r.type === 'percentage' ? Number(r.value) : 0,
          gift: r.type === 'gift' ? r.description : null,
          freeShip: r.type === 'free_shipping',
          active: r.is_active,
        }
        return acc
      }, {})
    }

    default:
      return null
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
      // 1. JSONBlob-only koleksiyonlar (veri migrasyonu tamamlanmadı)
      if (!coll || JSONBLOB_ONLY.has(coll)) {
        const data = await jsonblobRead(coll)
        res.setHeader('X-Backend', 'jsonblob')
        return res.status(200).json(data)
      }

      // 2. Supabase dene
      const supabase = createServerClient()
      if (supabase) {
        try {
          const result = await supabaseRead(coll, supabase)
          if (result !== null) {
            res.setHeader('X-Backend', 'supabase')
            return res.status(200).json(result)
          }
        } catch (sbErr) {
          // Supabase başarısız (tablo yok, ağ hatası vb.) → devam et
          console.warn('[api/db] Supabase hatası, JSONBlob\'a düşülüyor:', sbErr.message)
        }
      }

      // 3. JSONBlob fallback
      const data = await jsonblobRead(coll)
      res.setHeader('X-Backend', 'jsonblob')
      return res.status(200).json(data)
    }

    // ── POST / PUT ─────────────────────────────────────────────────────────
    if (req.method === 'POST' || req.method === 'PUT') {
      // Şimdilik tüm yazmalar JSONBlob'a gider.
      // Supabase yazmaları bir sonraki sprint'te koleksiyon bazında eklenecek.
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
