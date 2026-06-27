-- =============================================================================
-- MODULE 06 — ORDERS
-- Tables: orders, order_items, order_status_history
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 20. orders
-- ---------------------------------------------------------------------------

CREATE TABLE orders (
  id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID            NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id           UUID            NOT NULL REFERENCES branches(id),
  customer_id         UUID            REFERENCES customers(id) ON DELETE SET NULL,
  order_number        VARCHAR(30)     NOT NULL DEFAULT fn_generate_order_number(),
  status              order_status    NOT NULL DEFAULT 'pending',
  delivery_type       delivery_type   NOT NULL DEFAULT 'delivery',
  delivery_address    TEXT,
  delivery_address_id UUID            REFERENCES customer_addresses(id) ON DELETE SET NULL,

  -- Pricing snapshot
  subtotal            DECIMAL(12,2)   NOT NULL DEFAULT 0,
  discount_amount     DECIMAL(12,2)   NOT NULL DEFAULT 0,
  coupon_id           UUID            REFERENCES coupons(id) ON DELETE SET NULL,
  coupon_code         VARCHAR(50),                             -- snapshot
  coupon_discount     DECIMAL(12,2)   NOT NULL DEFAULT 0,
  total               DECIMAL(12,2)   NOT NULL DEFAULT 0,

  -- Payment
  payment_method      payment_method  NOT NULL DEFAULT 'cash',
  payment_status      payment_status  NOT NULL DEFAULT 'pending',

  notes               TEXT,
  whatsapp_message_id VARCHAR(255),

  -- Lifecycle timestamps
  confirmed_at        TIMESTAMPTZ,
  prepared_at         TIMESTAMPTZ,
  delivered_at        TIMESTAMPTZ,
  cancelled_at        TIMESTAMPTZ,
  cancellation_reason TEXT,
  prepared_by         UUID            REFERENCES users(id) ON DELETE SET NULL,

  created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ,

  CONSTRAINT uq_orders_number         UNIQUE (tenant_id, order_number),
  CONSTRAINT chk_orders_subtotal      CHECK (subtotal >= 0),
  CONSTRAINT chk_orders_discount      CHECK (discount_amount >= 0),
  CONSTRAINT chk_orders_coupon_disc   CHECK (coupon_discount >= 0),
  CONSTRAINT chk_orders_total         CHECK (total >= 0),
  CONSTRAINT chk_orders_delivery_addr CHECK (
    delivery_type = 'pickup' OR delivery_address IS NOT NULL
  )
);

CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ---------------------------------------------------------------------------
-- 21. order_items
-- ---------------------------------------------------------------------------

CREATE TABLE order_items (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID          NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  tenant_id     UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id    UUID          REFERENCES products(id) ON DELETE SET NULL,

  -- Snapshots — captured at order time, survives product edits
  product_name  VARCHAR(500)  NOT NULL,
  product_sku   VARCHAR(50)   NOT NULL,
  unit          VARCHAR(50)   NOT NULL,
  unit_price    DECIMAL(12,2) NOT NULL,

  quantity      DECIMAL(12,3) NOT NULL,
  total_price   DECIMAL(12,2) NOT NULL,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_order_items_qty      CHECK (quantity > 0),
  CONSTRAINT chk_order_items_price    CHECK (unit_price >= 0),
  CONSTRAINT chk_order_items_total    CHECK (total_price >= 0)
);

CREATE TRIGGER trg_order_items_updated_at
  BEFORE UPDATE ON order_items
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ---------------------------------------------------------------------------
-- 22. order_status_history
-- Append-only — never UPDATE or DELETE
-- ---------------------------------------------------------------------------

CREATE TABLE order_status_history (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID         NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  tenant_id   UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  from_status order_status,
  to_status   order_status NOT NULL,
  notes       TEXT,
  changed_by  UUID         REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
