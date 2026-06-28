#!/usr/bin/env node
// Geçici tanılama scripti — categories tablosunun mevcut kolonlarını listeler
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '../.env.local')

// .env.local oku (boş satır ve yorum satırlarını atla)
const env = {}
readFileSync(envPath, 'utf8').split('\n').forEach(line => {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) return
  const eqIdx = trimmed.indexOf('=')
  if (eqIdx < 1) return
  const key = trimmed.slice(0, eqIdx).trim()
  const val = trimmed.slice(eqIdx + 1).trim()
  if (key && val) env[key] = val
})

const SUPABASE_URL = env.SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
const TENANT_ID = env.SUPABASE_TENANT_ID || '11111111-1111-1111-1111-111111111111'

const { createClient } = await import('@supabase/supabase-js')
const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

console.log('URL:', SUPABASE_URL)
console.log('')

// categories tablosundaki ilk satırı çek
const { data, error } = await sb
  .from('categories')
  .select('*')
  .limit(3)

if (error) {
  console.log('HATA:', error.message)
} else {
  console.log('Mevcut satır sayısı:', data.length)
  if (data.length > 0) {
    console.log('Kolonlar:', Object.keys(data[0]).join(', '))
    console.log('\nİlk satır:', JSON.stringify(data[0], null, 2))
  } else {
    // Tablo boş — kolon bilgisi için PostgreSQL system catalog deneyelim
    console.log('Tablo boş, şema bilgisi için sorgu deneniyor...')
    const { data: d2, error: e2 } = await sb.rpc('exec_sql', {
      query: "SELECT column_name FROM information_schema.columns WHERE table_name='categories' ORDER BY ordinal_position"
    })
    if (e2) console.log('RPC hata:', e2.message)
    else console.log('Kolonlar:', d2)
  }
}

// products tablosunu da kontrol et
const { data: pd, error: pe } = await sb
  .from('products')
  .select('count')
  .eq('tenant_id', TENANT_ID)
  .single()

console.log('\nProducts count:', pe ? 'HATA: ' + pe.message : JSON.stringify(pd))

process.exit(0)
