-- Sprint 3F: Kalan modüller için şema güncellemesi

-- orders: branch_id nullable yap, customer + items_data ekle
ALTER TABLE orders ALTER COLUMN branch_id DROP NOT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS items_data JSONB;

-- tenant_settings (settings modülü)
CREATE TABLE IF NOT EXISTS public.tenant_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  key VARCHAR(100) NOT NULL,
  value TEXT,
  UNIQUE(tenant_id, key)
);
GRANT ALL ON TABLE public.tenant_settings TO service_role, authenticated, anon;

-- product_stock (stock modülü)
CREATE TABLE IF NOT EXISTS public.product_stock (
  tenant_id UUID NOT NULL,
  product_legacy_id INTEGER NOT NULL,
  qty INTEGER NOT NULL DEFAULT 50,
  min_qty INTEGER NOT NULL DEFAULT 5,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, product_legacy_id)
);
GRANT ALL ON TABLE public.product_stock TO service_role, authenticated, anon;

-- invoices: JSONB data kolonu ekle
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS data JSONB;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Doğrulama
SELECT 'orders.customer_name'   AS kontrol, EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='orders'          AND column_name='customer_name') AS ok
UNION ALL
SELECT 'tenant_settings',                   EXISTS(SELECT 1 FROM information_schema.tables  WHERE table_name='tenant_settings')
UNION ALL
SELECT 'product_stock',                     EXISTS(SELECT 1 FROM information_schema.tables  WHERE table_name='product_stock')
UNION ALL
SELECT 'invoices.data',                     EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='invoices'         AND column_name='data');
