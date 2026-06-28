'use strict';
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const eq = t.indexOf('=');
  if (eq > 0) {
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
console.log('URL  :', URL);
console.log('KEY  :', KEY ? KEY.slice(0, 20) + '...' : '(YOK)');

async function main() {
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  // categories tablosunun gerçek kolonlarını öğren
  // information_schema yerine sadece bilinen kolon isimlerini tek tek dene
  const catCols = ['id', 'tenant_id', 'name', 'slug', 'emoji', 'is_active', 'display_order', 'sort_order'];
  console.log('\n--- categories kolonları ---');
  for (const col of catCols) {
    const { error } = await sb.from('categories').select(col).limit(1);
    const exists = !error || !error.message.includes('does not exist');
    console.log(`  ${col}: ${exists ? '✓ VAR' : '✗ YOK  (' + error.message + ')'}`);
  }

  // products tablosunun kritik kolonlarını dene
  const prodCols = ['id', 'tenant_id', 'name', 'unit', 'sku', 'price', 'legacy_id', 'image_url', 'metadata', 'tags', 'min_stock_level', 'is_active'];
  console.log('\n--- products kolonları ---');
  for (const col of prodCols) {
    const { error } = await sb.from('products').select(col).limit(1);
    const exists = !error || !error.message.includes('does not exist');
    console.log(`  ${col}: ${exists ? '✓ VAR' : '✗ YOK  (' + (error && error.message) + ')'}`);
  }

  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
