-- =============================================================================
-- MODULE 00 — EXTENSIONS, TYPES, UTILITY FUNCTIONS
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "pgcrypto";    -- gen_random_uuid() fallback
CREATE EXTENSION IF NOT EXISTS "pg_trgm";     -- Turkish text trigram search
CREATE EXTENSION IF NOT EXISTS "unaccent";    -- Accent-insensitive search (ğ,ş,ü,ö,ç,ı)

-- ---------------------------------------------------------------------------
-- ENUM Types
-- ---------------------------------------------------------------------------

CREATE TYPE user_status AS ENUM (
  'active',
  'inactive',
  'suspended',
  'pending_verification'
);

CREATE TYPE order_status AS ENUM (
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'out_for_delivery',
  'delivered',
  'cancelled',
  'refunded'
);

CREATE TYPE delivery_type AS ENUM (
  'delivery',
  'pickup'
);

CREATE TYPE payment_method AS ENUM (
  'cash',
  'card',
  'online',
  'bank_transfer',
  'loyalty_points',
  'mixed'
);

CREATE TYPE payment_status AS ENUM (
  'pending',
  'paid',
  'failed',
  'refunded',
  'partial'
);

CREATE TYPE stock_movement_type AS ENUM (
  'purchase',
  'sale',
  'adjustment_increase',
  'adjustment_decrease',
  'return_from_customer',
  'return_to_supplier',
  'waste',
  'transfer_in',
  'transfer_out',
  'initial_count'
);

CREATE TYPE campaign_type AS ENUM (
  'percentage_discount',
  'fixed_discount',
  'buy_x_get_y',
  'free_shipping',
  'gift_product'
);

CREATE TYPE coupon_type AS ENUM (
  'percentage',
  'fixed',
  'gift',
  'free_shipping'
);

CREATE TYPE notification_channel AS ENUM (
  'whatsapp',
  'sms',
  'email',
  'push',
  'in_app'
);

CREATE TYPE invoice_type AS ENUM (
  'sale',
  'purchase',
  'return',
  'credit_note'
);

CREATE TYPE purchase_order_status AS ENUM (
  'draft',
  'sent',
  'confirmed',
  'partially_received',
  'received',
  'cancelled'
);

CREATE TYPE ai_request_status AS ENUM (
  'pending',
  'processing',
  'completed',
  'failed',
  'rate_limited'
);

CREATE TYPE audit_action AS ENUM (
  'create',
  'update',
  'delete',
  'restore',
  'login',
  'logout',
  'export',
  'import',
  'view_sensitive'
);

CREATE TYPE workflow_execution_status AS ENUM (
  'pending',
  'running',
  'completed',
  'failed',
  'skipped'
);

CREATE TYPE loyalty_transaction_type AS ENUM (
  'earn',
  'redeem',
  'expire',
  'adjust_increase',
  'adjust_decrease',
  'bonus'
);

-- ---------------------------------------------------------------------------
-- Utility: auto-update updated_at
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Utility: generate order number
-- Format: ORD-YYYYMMDD-NNNNN (per tenant per day, resets at midnight)
-- ---------------------------------------------------------------------------

CREATE SEQUENCE IF NOT EXISTS seq_order_number START 1;

CREATE OR REPLACE FUNCTION fn_generate_order_number()
RETURNS TEXT AS $$
BEGIN
  RETURN 'ORD-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
         LPAD(NEXTVAL('seq_order_number')::TEXT, 5, '0');
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Utility: generate invoice number
-- ---------------------------------------------------------------------------

CREATE SEQUENCE IF NOT EXISTS seq_invoice_number START 1;

CREATE OR REPLACE FUNCTION fn_generate_invoice_number()
RETURNS TEXT AS $$
BEGIN
  RETURN 'INV-' || TO_CHAR(NOW(), 'YYYY') || '-' ||
         LPAD(NEXTVAL('seq_invoice_number')::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Utility: generate purchase order number
-- ---------------------------------------------------------------------------

CREATE SEQUENCE IF NOT EXISTS seq_po_number START 1;

CREATE OR REPLACE FUNCTION fn_generate_po_number()
RETURNS TEXT AS $$
BEGIN
  RETURN 'PO-' || TO_CHAR(NOW(), 'YYYYMM') || '-' ||
         LPAD(NEXTVAL('seq_po_number')::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Macro: apply updated_at trigger to a table
-- Usage: SELECT fn_apply_updated_at_trigger('table_name');
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_apply_updated_at_trigger(p_table TEXT)
RETURNS VOID AS $$
BEGIN
  EXECUTE FORMAT(
    'CREATE TRIGGER trg_%I_updated_at
     BEFORE UPDATE ON %I
     FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at()',
    p_table, p_table
  );
END;
$$ LANGUAGE plpgsql;
