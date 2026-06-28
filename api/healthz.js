import { createServerClient } from '../lib/supabase/server.js'

const TENANT_ID = process.env.SUPABASE_TENANT_ID || '11111111-1111-1111-1111-111111111111'

export default async function handler(req, res) {
  const sb = createServerClient()
  if (!sb) return res.status(503).json({ error: 'no_supabase_config' })

  const checks = {}

  // Her tabloyu test et
  for (const tbl of ['products','categories','orders','campaigns','coupons','product_stock','tenant_settings','invoices']) {
    const { count, error } = await sb.from(tbl)
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', TENANT_ID)
    checks[tbl] = error ? `ERR: ${error.message}` : count
  }

  // Hangi key kullanılıyor (prefix göster)
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  const anonKey = process.env.SUPABASE_ANON_KEY || ''
  const keyUsed = svcKey ? `svc:${svcKey.slice(0,12)}...` : (anonKey ? `anon:${anonKey.slice(0,12)}...` : 'none')

  res.status(200).json({ tenant: TENANT_ID, keyUsed, checks })
}
