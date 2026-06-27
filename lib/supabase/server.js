import { createClient } from '@supabase/supabase-js'

/**
 * Vercel serverless fonksiyonları için Supabase istemcisi.
 * Service role key varsa onu, yoksa anon key'i kullanır.
 * Env var yoksa null döner — çağıran taraf fallback uygular.
 */
export function createServerClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY

  if (!url || !key) return null

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
