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

  // Tüm ürünleri paginate ile al (Supabase'in 1000 satır limitini aş)
  log('Ürünler okunuyor...');
  const allProducts = [];
  let from = 0;
  while (true) {
    const { data, error } = await sb
      .from('products').select('legacy_id').eq('tenant_id', TENANT_ID).not('legacy_id', 'is', null)
      .range(from, from + BATCH - 1);
    if (error) throw new Error('products okunamadı: ' + error.message);
    if (!data || !data.length) break;
    allProducts.push(...data);
    if (data.length < BATCH) break;
    from += BATCH;
  }
  log(`✓ ${allProducts.length} ürün bulundu`);

  // Mevcut stok kayıtlarını kontrol et (paginate)
  const existingSet = new Set();
  from = 0;
  while (true) {
    const { data } = await sb
      .from('product_stock').select('product_legacy_id').eq('tenant_id', TENANT_ID)
      .range(from, from + BATCH - 1);
    if (!data || !data.length) break;
    data.forEach(r => existingSet.add(r.product_legacy_id));
    if (data.length < BATCH) break;
    from += BATCH;
  }
  log(`Mevcut stok kaydı: ${existingSet.size}`);

  const missing = allProducts.filter(p => !existingSet.has(p.legacy_id));
  if (!missing.length) { log('✓ Tüm stok kayıtları zaten mevcut.'); return; }
  log(`Eksik: ${missing.length} ürün ekleniyor...`);
  await insertBatches(sb, missing.map(p => p.legacy_id));
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
