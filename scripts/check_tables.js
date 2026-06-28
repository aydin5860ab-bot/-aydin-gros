'use strict';
const fs = require('fs'), path = require('path');
const envPath = path.join(__dirname, '../.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const t = line.trim(); if (!t || t.startsWith('#')) continue;
  const eq = t.indexOf('='); if (eq < 1) continue;
  const k = t.slice(0, eq).trim(), v = t.slice(eq + 1).trim();
  if (!process.env[k]) process.env[k] = v;
}
async function main() {
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } });

  const tables = [
    { name: 'orders',          cols: ['id','tenant_id','order_number','status','total','delivery_address','customer_id'] },
    { name: 'order_items',     cols: ['id','order_id','product_id','product_name','quantity','unit_price'] },
    { name: 'customers',       cols: ['id','tenant_id','full_name','phone'] },
    { name: 'tenant_settings', cols: ['id','tenant_id','key','value'] },
    { name: 'campaigns',       cols: ['id','tenant_id','name','type','value','is_active'] },
    { name: 'coupons',         cols: ['id','tenant_id','code','type','value','is_active'] },
    { name: 'product_stock',   cols: ['tenant_id','product_legacy_id','qty','min_qty'] },
    { name: 'invoices',        cols: ['id','tenant_id'] },
  ];

  for (const t of tables) {
    process.stdout.write(`\n[${t.name}]\n`);
    const { data, error } = await sb.from(t.name).select(t.cols[0]).limit(1);
    if (error) {
      process.stdout.write(`  HATA: ${error.message}\n`);
      continue;
    }
    process.stdout.write(`  ✓ Tablo mevcut. Kayıt sayısı kontrolü...\n`);
    const { count } = await sb.from(t.name).select('*', { count: 'exact', head: true });
    process.stdout.write(`  Kayıt: ${count ?? '?'}\n`);
    // kolon kontrol
    for (const col of t.cols.slice(1)) {
      const { error: ce } = await sb.from(t.name).select(col).limit(1);
      const ok = !ce || !ce.message.includes('does not exist');
      process.stdout.write(`  ${col}: ${ok ? '✓' : '✗ YOK'}\n`);
    }
  }
  process.exit(0);
}
main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
