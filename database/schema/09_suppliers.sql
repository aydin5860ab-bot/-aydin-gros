-- =============================================================================
-- MODULE 09 — SUPPLIERS & PURCHASE ORDERS
-- Tables: suppliers, purchase_orders, purchase_order_items
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 30. suppliers
-- ---------------------------------------------------------------------------

CREATE TABLE suppliers (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          VARCHAR(255) NOT NULL,
  contact_name  VARCHAR(255),
  phone         VARCHAR(50),
  email         VARCHAR(255),
  address       TEXT,
  tax_number    VARCHAR(50),
  payment_terms TEXT,        -- e.g. "30 gün vadeli", "peşin"
  notes         TEXT,
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ,

  CONSTRAINT chk_suppliers_name  CHECK (LENGTH(TRIM(name)) > 0)
);

CREATE TRIGGER trg_suppliers_updated_at
  BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ---------------------------------------------------------------------------
-- 31. purchase_orders
-- ---------------------------------------------------------------------------

CREATE TABLE purchase_orders (
  id                      UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID                  NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id               UUID                  NOT NULL REFERENCES branches(id),
  supplier_id             UUID                  NOT NULL REFERENCES suppliers(id),
  order_number            VARCHAR(30)           NOT NULL DEFAULT fn_generate_po_number(),
  status                  purchase_order_status NOT NULL DEFAULT 'draft',
  order_date              DATE                  NOT NULL DEFAULT CURRENT_DATE,
  expected_delivery_date  DATE,
  actual_delivery_date    DATE,
  subtotal                DECIMAL(12,2)         NOT NULL DEFAULT 0,
  tax_amount              DECIMAL(12,2)         NOT NULL DEFAULT 0,
  total                   DECIMAL(12,2)         NOT NULL DEFAULT 0,
  notes                   TEXT,
  created_by              UUID                  REFERENCES users(id) ON DELETE SET NULL,
  received_by             UUID                  REFERENCES users(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
  deleted_at              TIMESTAMPTZ,

  CONSTRAINT uq_purchase_orders_number UNIQUE (tenant_id, order_number),
  CONSTRAINT chk_po_subtotal           CHECK (subtotal >= 0),
  CONSTRAINT chk_po_tax                CHECK (tax_amount >= 0),
  CONSTRAINT chk_po_total              CHECK (total >= 0),
  CONSTRAINT chk_po_delivery_dates     CHECK (
    actual_delivery_date IS NULL OR
    expected_delivery_date IS NULL OR
    actual_delivery_date >= order_date
  )
);

CREATE TRIGGER trg_purchase_orders_updated_at
  BEFORE UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ---------------------------------------------------------------------------
-- 32. purchase_order_items
-- ---------------------------------------------------------------------------

CREATE TABLE purchase_order_items (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID          NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  tenant_id         UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id        UUID          REFERENCES products(id) ON DELETE SET NULL,

  -- Snapshots
  product_name      VARCHAR(500)  NOT NULL,
  quantity_ordered  DECIMAL(12,3) NOT NULL,
  quantity_received DECIMAL(12,3) NOT NULL DEFAULT 0,
  unit_cost         DECIMAL(12,4) NOT NULL,
  total_cost        DECIMAL(12,4) NOT NULL,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_po_items_qty_ordered  CHECK (quantity_ordered > 0),
  CONSTRAINT chk_po_items_qty_received CHECK (quantity_received >= 0),
  CONSTRAINT chk_po_items_unit_cost    CHECK (unit_cost >= 0),
  CONSTRAINT chk_po_items_total_cost   CHECK (total_cost >= 0)
);

CREATE TRIGGER trg_purchase_order_items_updated_at
  BEFORE UPDATE ON purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
