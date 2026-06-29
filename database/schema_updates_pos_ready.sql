-- ==============================================================================
-- AYDIN GROS OS - SCHEMA UPDATES FOR PRODUCTION READY STATE (Phase Beta)
-- ==============================================================================

-- 1. Orders table columns mapping fix
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name VARCHAR(100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(20);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS items_data JSONB;

-- 2. Product barcodes columns structure fix
ALTER TABLE product_barcodes ADD COLUMN IF NOT EXISTS barcode_type VARCHAR(20) NOT NULL DEFAULT 'EAN13';
ALTER TABLE product_barcodes ADD COLUMN IF NOT EXISTS product_legacy_id INTEGER;

-- 3. Index for barcode lookup by legacy product id
CREATE INDEX IF NOT EXISTS idx_product_barcodes_legacy_id ON product_barcodes(tenant_id, product_legacy_id);
