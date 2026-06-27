-- =============================================================================
-- MODULE 10 — FINANCE
-- Tables: invoices, invoice_items, payments
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 33. invoices
-- ---------------------------------------------------------------------------

CREATE TABLE invoices (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id         UUID          NOT NULL REFERENCES branches(id),
  order_id          UUID          REFERENCES orders(id) ON DELETE SET NULL,
  purchase_order_id UUID          REFERENCES purchase_orders(id) ON DELETE SET NULL,
  customer_id       UUID          REFERENCES customers(id) ON DELETE SET NULL,
  supplier_id       UUID          REFERENCES suppliers(id) ON DELETE SET NULL,
  invoice_number    VARCHAR(30)   NOT NULL DEFAULT fn_generate_invoice_number(),
  type              invoice_type  NOT NULL,
  status            VARCHAR(20)   NOT NULL DEFAULT 'draft',
  issue_date        DATE          NOT NULL DEFAULT CURRENT_DATE,
  due_date          DATE,
  subtotal          DECIMAL(12,2) NOT NULL DEFAULT 0,
  tax_rate          DECIMAL(5,2)  NOT NULL DEFAULT 0,
  tax_amount        DECIMAL(12,2) NOT NULL DEFAULT 0,
  total             DECIMAL(12,2) NOT NULL DEFAULT 0,
  notes             TEXT,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ,

  CONSTRAINT uq_invoices_number      UNIQUE (tenant_id, invoice_number),
  CONSTRAINT chk_invoices_status     CHECK (status IN ('draft', 'sent', 'paid', 'cancelled', 'overdue')),
  CONSTRAINT chk_invoices_subtotal   CHECK (subtotal >= 0),
  CONSTRAINT chk_invoices_tax_rate   CHECK (tax_rate BETWEEN 0 AND 100),
  CONSTRAINT chk_invoices_tax_amount CHECK (tax_amount >= 0),
  CONSTRAINT chk_invoices_total      CHECK (total >= 0),
  CONSTRAINT chk_invoices_due_date   CHECK (due_date IS NULL OR due_date >= issue_date),
  -- An invoice must reference either an order or a purchase order, not both
  CONSTRAINT chk_invoices_reference  CHECK (
    NOT (order_id IS NOT NULL AND purchase_order_id IS NOT NULL)
  )
);

CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ---------------------------------------------------------------------------
-- 34. invoice_items
-- ---------------------------------------------------------------------------

CREATE TABLE invoice_items (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  UUID          NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  tenant_id   UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id  UUID          REFERENCES products(id) ON DELETE SET NULL,
  description TEXT          NOT NULL,
  quantity    DECIMAL(12,3) NOT NULL,
  unit_price  DECIMAL(12,2) NOT NULL,
  tax_rate    DECIMAL(5,2)  NOT NULL DEFAULT 0,
  tax_amount  DECIMAL(12,2) NOT NULL DEFAULT 0,
  total       DECIMAL(12,2) NOT NULL,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_invoice_items_qty       CHECK (quantity > 0),
  CONSTRAINT chk_invoice_items_price     CHECK (unit_price >= 0),
  CONSTRAINT chk_invoice_items_tax_rate  CHECK (tax_rate BETWEEN 0 AND 100),
  CONSTRAINT chk_invoice_items_total     CHECK (total >= 0)
);

CREATE TRIGGER trg_invoice_items_updated_at
  BEFORE UPDATE ON invoice_items
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ---------------------------------------------------------------------------
-- 35. payments
-- ---------------------------------------------------------------------------

CREATE TABLE payments (
  id             UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID           NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id      UUID           NOT NULL REFERENCES branches(id),
  order_id       UUID           REFERENCES orders(id) ON DELETE SET NULL,
  invoice_id     UUID           REFERENCES invoices(id) ON DELETE SET NULL,
  amount         DECIMAL(12,2)  NOT NULL,
  method         payment_method NOT NULL,
  status         payment_status NOT NULL DEFAULT 'pending',
  reference_code VARCHAR(255),  -- POS slip no, bank transfer ref, etc.
  processed_at   TIMESTAMPTZ,
  notes          TEXT,
  processed_by   UUID           REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_payments_amount   CHECK (amount > 0),
  CONSTRAINT chk_payments_ref      CHECK (
    NOT (order_id IS NOT NULL AND invoice_id IS NOT NULL)
  )
);

CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
