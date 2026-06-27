-- =============================================================================
-- MODULE 05 — CUSTOMERS
-- Tables: customers, customer_addresses
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 18. customers
-- ---------------------------------------------------------------------------

CREATE TABLE customers (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  full_name           VARCHAR(255)  NOT NULL,
  phone               VARCHAR(50),
  email               VARCHAR(255),
  notes               TEXT,
  tags                TEXT[]        NOT NULL DEFAULT '{}',
  is_active           BOOLEAN       NOT NULL DEFAULT TRUE,
  total_order_count   INTEGER       NOT NULL DEFAULT 0,
  total_order_amount  DECIMAL(12,2) NOT NULL DEFAULT 0,
  last_order_at       TIMESTAMPTZ,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ,

  CONSTRAINT chk_customers_name   CHECK (LENGTH(TRIM(full_name)) > 0),
  CONSTRAINT chk_customers_count  CHECK (total_order_count >= 0),
  CONSTRAINT chk_customers_amount CHECK (total_order_amount >= 0)
);

-- Phone uniqueness per tenant when provided
CREATE UNIQUE INDEX uq_customers_phone
  ON customers (tenant_id, phone)
  WHERE phone IS NOT NULL AND deleted_at IS NULL;

CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ---------------------------------------------------------------------------
-- 19. customer_addresses
-- ---------------------------------------------------------------------------

CREATE TABLE customer_addresses (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  UUID         NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  tenant_id    UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  label        VARCHAR(50)  NOT NULL DEFAULT 'home', -- home | work | other
  full_address TEXT         NOT NULL,
  district     VARCHAR(100),
  city         VARCHAR(100),
  latitude     DECIMAL(10,8),
  longitude    DECIMAL(11,8),
  is_default   BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ,

  CONSTRAINT chk_customer_address_label CHECK (label IN ('home', 'work', 'other')),
  CONSTRAINT chk_customer_address_addr  CHECK (LENGTH(TRIM(full_address)) > 0)
);

CREATE TRIGGER trg_customer_addresses_updated_at
  BEFORE UPDATE ON customer_addresses
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- Only one default address per customer
CREATE UNIQUE INDEX uq_customer_default_address
  ON customer_addresses (customer_id)
  WHERE is_default = TRUE AND deleted_at IS NULL;
