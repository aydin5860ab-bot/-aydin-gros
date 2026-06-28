'use strict';
const fs = require('fs'), path = require('path');
const envPath = path.join(__dirname, '../.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const t = line.trim(); if (!t || t.startsWith('#')) continue;
  const eq = t.indexOf('='); if (eq < 1) continue;
  const k = t.slice(0, eq).trim(), v = t.slice(eq + 1).trim();
  if (!process.env[k]) process.env[k] = v;
}

const TENANT_ID = process.env.SUPABASE_TENANT_ID || '11111111-1111-1111-1111-111111111111';
const DEFAULT_QTY = 50;
const DEFAULT_MIN = 5;
const BATCH = 200;

function log(msg) { process.stdout.write(msg + '\n'); }

async function main() {
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } });

  // Ürünleri al
  log('Ürünler okunuyor...');
  const { data: products, error: prodErr } = await sb
    .from('products').select('legacy_id').eq('tenant_id', TENANT_ID).not('legacy_id', 'is', null);
  if (prodErr) throw new Error('products okunamadı: ' + prodErr.message);
  log(`✓ ${products.length} ürün bulundu`);

  // Mevcut stok kayıtlarını kontrol et
  const { count: existing } = await sb
    .from('product_stock').select('*', { count: 'exact', head: true }).eq('tenant_id', TENANT_ID);
  log(`Mevcut stok kaydı: ${existing ?? 0}`);

  if (existing > 0) {
    log('⚠  Stok zaten mevcut. Sadece eksik olanlar eklenecek...');
    const { data: existingIds } = await sb
      .from('product_stock').select('product_legacy_id').eq('tenant_id', TENANT_ID);
    const seen = new Set((existingIds || []).map(r => r.product_legacy_id));
    const missing = products.filter(p => !seen.has(p.legacy_id));
    log(`Eksik: ${missing.length} ürün`);
    if (!missing.length) { log('✓ Tüm stok kayıtları mevcut.'); return; }
    await insertBatches(sb, missing.map(p => p.legacy_id));
  } else {
    await insertBatches(sb, products.map(p => p.legacy_id));
  }
}

async function insertBatches(sb, legacyIds) {
  let inserted = 0;
  for (let i = 0; i < legacyIds.length; i += BATCH) {
    const batch = legacyIds.slice(i, i + BATCH).map(id => ({
      tenant_id:         TENANT_ID,
      product_legacy_id: id,
      qty:               DEFAULT_QTY,
      min_qty:           DEFAULT_MIN,
      updated_at:        new Date().toISOString(),
    }));
    const { error } = await sb.from('product_stock')
      .upsert(batch, { onConflict: 'tenant_id,product_legacy_id' });
    if (error) throw new Error(`Batch ${i} hatası: ` + error.message);
    inserted += batch.length;
    log(`  ${inserted}/${legacyIds.length} eklendi...`);
  }
  log(`✓ ${inserted} stok kaydı oluşturuldu (qty=${DEFAULT_QTY}, min=${DEFAULT_MIN})`);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
