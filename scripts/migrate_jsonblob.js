'use strict';
const fs = require('fs'), path = require('path');
for (const line of fs.readFileSync(path.join(__dirname,'../.env.local'),'utf8').split('\n')) {
  const t=line.trim(); if(!t||t.startsWith('#'))continue;
  const eq=t.indexOf('='); if(eq<1)continue;
  const k=t.slice(0,eq).trim(), v=t.slice(eq+1).trim();
  if(!process.env[k]) process.env[k]=v;
}

const JSONBLOB_URL = process.env.JSONBLOB_URL;
const TENANT_ID    = process.env.SUPABASE_TENANT_ID || '11111111-1111-1111-1111-111111111111';

function log(msg) { process.stdout.write(msg + '\n'); }

// --- Supabase column name maps (aynı api/db.js logic'i) ---
const ORDER_STATUS = { pending:0, confirmed:1, preparing:1, ready:1, out_for_delivery:2, delivered:2, cancelled:-1, refunded:-1 };
const STATUS_FROM_INT = ['pending','confirmed','out_for_delivery','delivered','cancelled'];
const SETTINGS_KEY_REVERSE = {
  threshold: 'free_delivery_threshold',
  waNumber:  'whatsapp_number',
  branch1Name: 'branch1_name',
  branch1Addr: 'branch1_address',
  branch2Name: 'branch2_name',
  branch2Addr: 'branch2_address',
};

async function main() {
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth:{ persistSession:false, autoRefreshToken:false } });

  // 1. Önce JSONBlob'dan dene, 404 ise backup kullan
  let blob = {};
  log('JSONBlob okunuyor...');
  try {
    const res = await fetch(JSONBLOB_URL, { headers:{ Accept:'application/json' } });
    if (res.ok) { blob = await res.json(); log('✓ JSONBlob verisi alındı.'); }
    else         { throw new Error('HTTP ' + res.status); }
  } catch (e) {
    log('⚠ JSONBlob erişilemiyor (' + e.message + '), backup kullanılıyor...');
    const backupPath = path.join(__dirname, '../data/backup/jsonblob_raw_20260627.json');
    blob = JSON.parse(fs.readFileSync(backupPath, 'utf8').replace(/^﻿/, ''));
    log('✓ Backup yüklendi.');
  }

  // Settings backup'ı da oku (ayrı dosya)
  let settingsBackup = {};
  try {
    const sp = path.join(__dirname, '../data/backup/admin_settings_20260627.json');
    settingsBackup = JSON.parse(fs.readFileSync(sp, 'utf8').replace(/^﻿/, '')).data || {};
    log('✓ Settings backup yüklendi.');
  } catch(_) {}

  // Settings'i birleştir
  blob.settings = Object.assign({}, settingsBackup, blob.settings || {});
  log('Anahtarlar: ' + Object.keys(blob).join(', '));

  // 2. ORDERS
  const orders = blob.orders || [];
  log(`\n[orders] ${orders.length} sipariş bulundu`);
  if (orders.length > 0) {
    const rows = orders.map(o => ({
      tenant_id:        TENANT_ID,
      order_number:     o.no,
      customer_name:    o.name || '',
      customer_phone:   o.phone || '',
      delivery_address: o.addr || '',
      total:            Number(o.total) || 0,
      subtotal:         Number(o.total) || 0,
      status:           STATUS_FROM_INT[o.status] || 'pending',
      items_data:       o.items || [],
      created_at:       o.ts ? new Date(o.ts).toISOString() : new Date().toISOString(),
    })).filter(r => r.order_number);
    const { error } = await sb.from('orders')
      .upsert(rows, { onConflict: 'order_number' });
    if (error) log('  ✗ HATA: ' + error.message);
    else       log(`  ✓ ${rows.length} sipariş Supabase'e aktarıldı`);
  }

  // 3. SETTINGS
  const settings = blob.settings || {};
  log(`\n[settings] ${Object.keys(settings).length} ayar bulundu`);
  const settingRows = Object.entries(settings)
    .filter(([k]) => SETTINGS_KEY_REVERSE[k])
    .map(([k, v]) => ({ tenant_id: TENANT_ID, key: SETTINGS_KEY_REVERSE[k], value: String(v) }));
  if (settingRows.length > 0) {
    const { error } = await sb.from('tenant_settings')
      .upsert(settingRows, { onConflict: 'tenant_id,key' });
    if (error) log('  ✗ HATA: ' + error.message);
    else       log(`  ✓ ${settingRows.length} ayar Supabase'e aktarıldı`);
  } else {
    log('  — aktarılacak ayar yok (bilinmeyen key\'ler atlandı)');
  }

  // 4. CAMPAIGNS
  const campaigns = blob.campaigns || [];
  log(`\n[campaigns] ${campaigns.length} kampanya bulundu`);
  if (campaigns.length > 0) {
    // Önce mevcut kampanyaları sil
    await sb.from('campaigns').delete().eq('tenant_id', TENANT_ID);
    const rows = campaigns.map(c => ({
      tenant_id:      TENANT_ID,
      name:           c.name || 'Kampanya',
      type:           c.type || 'pct',
      discount_value: Number(c.value) || 0,
      is_active:      c.active !== false,
      start_date:     c.start || null,
      end_date:       c.end   || null,
    }));
    const { error } = await sb.from('campaigns').insert(rows);
    if (error) log('  ✗ HATA: ' + error.message);
    else       log(`  ✓ ${rows.length} kampanya Supabase'e aktarıldı`);
  }

  // 5. PROMOS (coupons)
  const promos = blob.promos || {};
  const promoCodes = Object.keys(promos);
  log(`\n[promos] ${promoCodes.length} kupon bulundu`);
  if (promoCodes.length > 0) {
    await sb.from('coupons').delete().eq('tenant_id', TENANT_ID);
    const rows = promoCodes.map(code => {
      const p = promos[code];
      return {
        tenant_id:      TENANT_ID,
        code,
        type:           p.pct > 0 ? 'percentage' : (p.freeShip ? 'free_shipping' : 'gift'),
        discount_value: Number(p.pct) || 0,
        is_active:      p.active !== false,
      };
    });
    const { error } = await sb.from('coupons').insert(rows);
    if (error) log('  ✗ HATA: ' + error.message);
    else       log(`  ✓ ${rows.length} kupon Supabase'e aktarıldı`);
  }

  // 6. INVOICES
  const invoices = blob.invoices || [];
  log(`\n[invoices] ${invoices.length} fatura bulundu`);
  if (invoices.length > 0) {
    await sb.from('invoices').delete().eq('tenant_id', TENANT_ID);
    const rows = invoices.map(inv => ({
      tenant_id:  TENANT_ID,
      data:       inv,
      created_at: inv.ts ? new Date(inv.ts).toISOString() : new Date().toISOString(),
    }));
    const { error } = await sb.from('invoices').insert(rows);
    if (error) log('  ✗ HATA: ' + error.message);
    else       log(`  ✓ ${rows.length} fatura Supabase'e aktarıldı`);
  }

  // 7. ÖZET
  log('\n══════════════════════════════════');
  log('Migration tamamlandı!');
  log('  orders:    ' + orders.length);
  log('  settings:  ' + settingRows.length);
  log('  campaigns: ' + campaigns.length);
  log('  promos:    ' + promoCodes.length);
  log('  invoices:  ' + invoices.length);
  log('══════════════════════════════════');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
