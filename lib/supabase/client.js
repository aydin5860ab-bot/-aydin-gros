/**
 * Tarayıcı Supabase istemcisi — Auth sprint'te aktif edilecek.
 *
 * Kullanım (HTML'e CDN ekledikten sonra):
 *   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>
 *   import { createBrowserClient } from '/lib/supabase/client.js'
 *   const sb = createBrowserClient()
 *
 * URL ve anon key /api/config endpoint'ten gelecek (Auth sprint).
 */

export const SUPABASE_CDN =
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js'

export function createBrowserClient(url, anonKey) {
  if (typeof window === 'undefined') {
    throw new Error('createBrowserClient sadece tarayıcıda çalışır')
  }
  if (!window.supabase?.createClient) {
    throw new Error(`Supabase CDN yüklenmemiş. Sayfaya ekle: ${SUPABASE_CDN}`)
  }
  if (!url || !anonKey) {
    throw new Error('SUPABASE_URL ve SUPABASE_ANON_KEY gerekli')
  }
  return window.supabase.createClient(url, anonKey)
}
