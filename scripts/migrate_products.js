#!/usr/bin/env node
/**
 * scripts/migrate_products.js
 *
 * index.html'deki 1084 ürünü Supabase products tablosuna migrate eder.
 *
 * Kullanım:
 *   node scripts/migrate_products.js --dry-run          # Dry run (yazma yok)
 *   node scripts/migrate_products.js                    # Gerçek migration
 *   node scripts/migrate_products.js --batch=50         # Batch boyutunu değiştir
 *   node scripts/migrate_products.js --from-batch=5     # 5. batch'ten devam et
 *
 * Güvenlik:
 *   - Mevcut kayıtları overwrite etmez (legacy_id kontrolü)
 *   - Dry run'da Supabase'e hiçbir şey yazılmaz
 *   - Her batch sonunda ilerleme dosyasına yazar (resume)
 *   - Hata olursa 3 sn bekler ve devam eder
 */

'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const PROGRESS_FILE = path.join(__dirname, '.migrate_progress.json');

// ---------------------------------------------------------------------------
// .env.local yükle
// ---------------------------------------------------------------------------
function loadEnv() {
  const envPath = path.join(ROOT, '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq > 0) {
      const k = t.slice(0, eq).trim();
      const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[k]) process.env[k] = v;
    }
  }
}
loadEnv();

// ---------------------------------------------------------------------------
// CLI argümanları
// ---------------------------------------------------------------------------
const ARGS = process.argv.slice(2);
const DRY_RUN    = ARGS.includes('--dry-run');
const batchArg   = ARGS.find(a => a.startsWith('--batch='));
const fromArg    = ARGS.find(a => a.startsWith('--from-batch='));
const BATCH_SIZE = batchArg  ? Math.max(1, parseInt(batchArg.split('=')[1], 10))  : 100;
const FROM_BATCH = fromArg   ? Math.max(0, parseInt(fromArg.split('=')[1], 10) - 1) : null;

// ---------------------------------------------------------------------------
// Sabitler
// ---------------------------------------------------------------------------
const TENANT_ID = process.env.SUPABASE_TENANT_ID || '11111111-1111-1111-1111-111111111111';

const CATEGORY_DEFS = [
  { slug: 'manav',         name: 'Manav',           display_order: 1  },
  { slug: 'kasap',         name: 'Kasap',           display_order: 2  },
  { slug: 'temel-gida',    name: 'Temel Gıda',      display_order: 3  },
  { slug: 'sut-sarkuteri', name: 'Süt & Şarküteri', display_order: 4  },
  { slug: 'atistirmalik',  name: 'Atıştırmalık',    display_order: 5  },
  { slug: 'temizlik',      name: 'Temizlik',        display_order: 6  },
  { slug: 'icecek',        name: 'İçecek',          display_order: 7  },
  { slug: 'kozmetik',      name: 'Kozmetik',        display_order: 8  },
  { slug: 'anne-bebek',    name: 'Anne & Bebek',    display_order: 9  },
  { slug: 'ev-gerecleri',  name: 'Ev Gereçleri',    display_order: 10 },
  { slug: 'kahvaltilik',   name: 'Kahvaltılık',     display_order: 11 },
];

// ---------------------------------------------------------------------------
// Log helper
// ---------------------------------------------------------------------------
function log(...args) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}]`, ...args);
}

// ---------------------------------------------------------------------------
// Ürünleri index.html'den çıkar
// ---------------------------------------------------------------------------
function extractProducts() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

  const startMarker = '? _lsProducts : [';
  const si = html.indexOf(startMarker);
  if (si === -1) throw new Error('index.html içinde products array marker bulunamadı');

  // '[' karakterinin konumu
  const arrayStart = si + startMarker.length - 1;

  // Bracket sayacı ile dizinin sonunu bul
  let depth = 0;
  let end = -1;
  for (let i = arrayStart; i < html.length; i++) {
    if (html[i] === '[') depth++;
    else if (html[i] === ']') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end === -1) throw new Error('Products dizisi sonlandırılamadı (bracket eşleşmesi yok)');

  const arrayStr = html.slice(arrayStart, end + 1);

  let products;
  try {
    // Sadece veri literal içerdiğinden Function() güvenli
    products = new Function('return ' + arrayStr)();
  } catch (e) {
    throw new Error('Products array parse edilemedi: ' + e.message);
  }

  if (!Array.isArray(products) || products.length === 0) {
    throw new Error('Geçersiz products array: ' + typeof products);
  }

  return products;
}

// ---------------------------------------------------------------------------
// Supabase client (lazy, ESM uyumlu)
// ---------------------------------------------------------------------------
let _sb = null;
async function getSupabase() {
  if (_sb) return _sb;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      '.env.local içinde SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY (veya SUPABASE_ANON_KEY) gerekli'
    );
  }
  const { createClient } = await import('@supabase/supabase-js');
  _sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return _sb;
}

// ---------------------------------------------------------------------------
// Kategorileri Supabase'de garantiye al
// ---------------------------------------------------------------------------
async function ensureCategories(sb) {
  log('Kategoriler kontrol ediliyor...');

  const { data: existing, error } = await sb
    .from('categories')
    .select('id, slug')
    .eq('tenant_id', TENANT_ID)
    .is('deleted_at', null);

  if (error) throw new Error('categories okunamadı: ' + error.message);

  const catMap = {};
  (existing || []).forEach(c => { catMap[c.slug] = c.id; });

  const missing = CATEGORY_DEFS.filter(c => !catMap[c.slug]);

  if (missing.length === 0) {
    log(`✓ Tüm kategoriler mevcut (${Object.keys(catMap).length} adet)`);
    return catMap;
  }

  if (DRY_RUN) {
    log(`[DRY RUN] ${missing.length} kategori oluşturulacaktı: ${missing.map(c => c.slug).join(', ')}`);
    missing.forEach(c => { catMap[c.slug] = `dry-${c.slug}`; });
    return catMap;
  }

  log(`  ${missing.length} eksik kategori oluşturuluyor: ${missing.map(c => c.slug).join(', ')}`);
  const { data: inserted, error: insertErr } = await sb
    .from('categories')
    .insert(missing.map(c => ({
      tenant_id: TENANT_ID,
      slug: c.slug,
      name: c.name,
      display_order: c.display_order,
      is_active: true,
    })))
    .select('id, slug');

  if (insertErr) throw new Error('categories insert hatası: ' + insertErr.message);
  (inserted || []).forEach(c => { catMap[c.slug] = c.id; });
  log(`✓ ${(inserted || []).length} yeni kategori oluşturuldu`);

  return catMap;
}

// ---------------------------------------------------------------------------
// Mevcut legacy_id'leri getir (duplicate önlemi)
// ---------------------------------------------------------------------------
async function getExistingLegacyIds(sb) {
  const { data, error } = await sb
    .from('products')
    .select('legacy_id')
    .eq('tenant_id', TENANT_ID)
    .not('legacy_id', 'is', null);

  if (error) throw new Error('Mevcut products okunamadı: ' + error.message);
  return new Set((data || []).map(r => r.legacy_id));
}

// ---------------------------------------------------------------------------
// Ürünü Supabase formatına dönüştür
// ---------------------------------------------------------------------------
function toRow(p, catMap) {
  const categoryId = catMap[p.cat];
  if (!categoryId) {
    throw new Error(`Bilinmeyen kategori: "${p.cat}" (legacy_id:${p.id}, "${p.name}")`);
  }
  return {
    tenant_id:      TENANT_ID,
    category_id:    categoryId,
    legacy_id:      p.id,
    sku:            `LEG-${String(p.id).padStart(5, '0')}`,
    name:           p.name,
    unit:           p.unit || 'adet',
    price:          p.price,
    image_url:      p.img || null,
    is_active:      true,
    tags:           [],
    min_stock_level: 0,
    metadata: {
      badge:     p.badge  || null,
      btype:     p.btype  || null,
      old_price: p.old    || null,
      feat:      p.feat   || false,
    },
  };
}

// ---------------------------------------------------------------------------
// İlerleme dosyası
// ---------------------------------------------------------------------------
function saveProgress(data) {
  try { fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2)); } catch (_) {}
}
function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    }
  } catch (_) {}
  return null;
}
function clearProgress() {
  try { if (fs.existsSync(PROGRESS_FILE)) fs.unlinkSync(PROGRESS_FILE); } catch (_) {}
}

// ---------------------------------------------------------------------------
// Batch doğrulama
// ---------------------------------------------------------------------------
async function verifyFinal(sb, expectedTotal) {
  const { count, error } = await sb
    .from('products')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID)
    .is('deleted_at', null);

  if (error) {
    log('⚠️  Doğrulama sorgusu başarısız: ' + error.message);
    return;
  }

  log(`🔢 Supabase toplam kayıt: ${count} / Beklenen: ${expectedTotal}`);
  if (count >= expectedTotal) {
    log('✅ Doğrulama başarılı: Tüm ürünler Supabase\'de mevcut.');
  } else {
    log(`⚠️  Eksik kayıt: ${expectedTotal - count} ürün migrate edilememiş olabilir.`);
    log('   Scripti tekrar çalıştırın — kaldığı yerden devam eder.');
  }
}

// ---------------------------------------------------------------------------
// ANA AKIŞ
// ---------------------------------------------------------------------------
async function main() {
  console.log('');
  log('═══════════════════════════════════════════════');
  log('  AydınGros — Ürün Migration Scripti');
  log(`  Mod      : ${DRY_RUN ? '🔍 DRY RUN (Supabase yazma yok)' : '🚀 GERÇEK MİGRATION'}`);
  log(`  Batch    : ${BATCH_SIZE} ürün`);
  if (FROM_BATCH !== null) log(`  Başlangıç: Batch ${FROM_BATCH + 1}'den`);
  log('═══════════════════════════════════════════════');

  // 1. Ürünleri çıkar
  log('index.html\'den ürünler çıkarılıyor...');
  const allProducts = extractProducts();
  log(`✓ ${allProducts.length} ürün bulundu (id ${allProducts[0].id} – ${allProducts[allProducts.length - 1].id})`);

  // 2. Supabase (dry run'da bağlantı gerektirmez)
  let sb = null;
  if (!DRY_RUN) {
    log('Supabase bağlantısı kuruluyor...');
    sb = await getSupabase();
    log('✓ Supabase bağlantısı kuruldu');
  } else {
    log('[DRY RUN] Supabase bağlantısı atlandı');
  }

  // 3. Kategoriler
  const catMap = DRY_RUN
    ? Object.fromEntries(CATEGORY_DEFS.map(c => [c.slug, `dry-${c.slug}`]))
    : await ensureCategories(sb);
  if (DRY_RUN) log(`[DRY RUN] ${CATEGORY_DEFS.length} kategori simüle edildi`);

  // 4. Mevcut kayıt kontrolü
  const existingIds = new Set();
  if (!DRY_RUN) {
    log('Supabase\'de mevcut kayıtlar kontrol ediliyor...');
    const ids = await getExistingLegacyIds(sb);
    ids.forEach(id => existingIds.add(id));
  }
  if (existingIds.size > 0) {
    log(`  ℹ️  ${existingIds.size} ürün zaten var, atlanacak`);
  }

  // 5. Dönüştür ve filtrele
  const rows = [];
  const skipped = [];
  for (const p of allProducts) {
    if (existingIds.has(p.id)) {
      skipped.push(p.id);
    } else {
      rows.push(toRow(p, catMap));
    }
  }
  log(`✓ Eklenecek: ${rows.length}, Atlanacak (zaten var): ${skipped.length}`);

  if (rows.length === 0) {
    log('');
    log('✅ Tüm ürünler zaten migrate edilmiş. İşlem tamamlandı.');
    clearProgress();
    return;
  }

  // 6. Batch listesi
  const batches = [];
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    batches.push(rows.slice(i, i + BATCH_SIZE));
  }
  log(`📦 ${batches.length} batch oluşturuldu (${BATCH_SIZE} ürün/batch)`);

  // 7. Başlangıç batch'ini belirle (resume)
  let startBatch = 0;
  if (FROM_BATCH !== null) {
    startBatch = FROM_BATCH;
  } else {
    const prev = loadProgress();
    if (prev && prev.sourceLength === allProducts.length && (prev.completedBatches || 0) > 0) {
      startBatch = prev.completedBatches;
      log(`⏭  İlerleme dosyası bulundu: Batch ${startBatch + 1}'den devam ediliyor`);
    }
  }

  // 8. Batch işlemi
  let insertedTotal = 0;
  let errorCount = 0;

  log('');
  for (let bIdx = startBatch; bIdx < batches.length; bIdx++) {
    const batch     = batches[bIdx];
    const batchNum  = bIdx + 1;
    const rangeFrom = bIdx * BATCH_SIZE + 1;
    const rangeTo   = rangeFrom + batch.length - 1;

    log(`─── Batch ${batchNum}/${batches.length}  (sıra ${rangeFrom}–${rangeTo}, legacy_id ${batch[0].legacy_id}–${batch[batch.length - 1].legacy_id}) ───`);

    if (DRY_RUN) {
      batch.slice(0, 3).forEach(r => log(`  + ${r.legacy_id} "${r.name}" ${r.price}₺`));
      if (batch.length > 3) log(`  ... ve ${batch.length - 3} ürün daha`);
      insertedTotal += batch.length;
      continue;
    }

    try {
      const { data, error } = await sb
        .from('products')
        .insert(batch)
        .select('id, legacy_id');

      if (error) {
        log(`❌ Batch ${batchNum} HATA: ${error.message}`);
        errorCount++;
        saveProgress({ sourceLength: allProducts.length, completedBatches: bIdx, insertedTotal, errorCount });
        // Kısa bekleme ve devam
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }

      const added = (data || []).length;
      insertedTotal += added;
      log(`✓ ${added} kayıt eklendi  |  Toplam: ${insertedTotal}`);
      saveProgress({ sourceLength: allProducts.length, completedBatches: batchNum, insertedTotal, errorCount });

    } catch (err) {
      log(`❌ Batch ${batchNum} beklenmeyen hata: ${err.message}`);
      errorCount++;
      saveProgress({ sourceLength: allProducts.length, completedBatches: bIdx, insertedTotal, errorCount });
      await new Promise(r => setTimeout(r, 3000));
    }

    // Rate-limiting için bekleme (son batch hariç)
    if (bIdx < batches.length - 1) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  // 9. Özet
  log('');
  log('═══════════════════════════════════════════════');
  log('📊 SONUÇ');
  log(`   Eklenen   : ${insertedTotal}`);
  log(`   Atlanan   : ${skipped.length} (zaten vardı)`);
  log(`   Batch err : ${errorCount}`);

  if (DRY_RUN) {
    log('');
    log('🔍 DRY RUN tamamlandı — Supabase\'e hiçbir şey yazılmadı.');
    log('   Gerçek migration için: node scripts/migrate_products.js');
    return;
  }

  // 10. Doğrulama
  log('');
  log('Doğrulama yapılıyor...');
  await verifyFinal(sb, allProducts.length - skipped.length + existingIds.size);

  if (errorCount === 0) {
    clearProgress();
    log('');
    log('✅ Migration başarıyla tamamlandı!');
  } else {
    log('');
    log(`⚠️  ${errorCount} batch hatası oluştu.`);
    log('   Devam etmek için tekrar çalıştırın:');
    log('   node scripts/migrate_products.js');
  }
}

main().catch(err => {
  console.error('\n[FATAL]', err.message);
  process.exit(1);
});
