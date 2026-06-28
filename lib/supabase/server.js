import { createClient } from '@supabase/supabase-js'

/**
 * Vercel serverless fonksiyonları için Supabase istemcisi (RLS aktiftir).
 * İsteğe bağlı token parametresi alırsa, sorguları o kullanıcının kimliğiyle çalıştırır.
 */
export function createServerClient(token = null) {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY

  if (!url || !key) return null

  const globalHeaders = token ? { Authorization: `Bearer ${token}` } : {}

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: globalHeaders,
    },
  })
}

/**
 * RLS kurallarını aşması gereken sunucu tarafı işlemleri için özel admin istemcisi.
 * Bu istemci yalnızca yetkilendirilmiş personel işlemlerinde kullanılmalıdır.
 */
export function createAdminClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) return null

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
