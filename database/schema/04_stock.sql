-- =============================================================================
-- MODULE 04 — STOCK
-- Tables: stock, stock_movements, stock_count_sessions, stock_count_items
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 14. stock
-- One row per product per branch — source of truth for current quantities
-- ---------------------------------------------------------------------------

CREATE TABLE stock (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id        UUID          NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  branch_id         UUID          NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  tenant_id         UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  quantity          DECIMAL(12,3) NOT NULL DEFAULT 0,
  reserved_quantity DECIMAL(12,3) NOT NULL DEFAULT 0,  -- in-flight orders
  avco_cost         DECIMAL(12,4),                     -- weighted average cost (AVCO)
  last_counted_at   TIMESTAMPTZ,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_stock_product_branch  UNIQUE (product_id, branch_id),
  CONSTRAINT chk_stock_quantity       CHECK (quantity >= 0),
  CONSTRAINT chk_stock_reserved       CHECK (reserved_quantity >= 0),
  CONSTRAINT chk_stock_reserved_lte   CHECK (reserved_quantity <= quantity),
  CONSTRAINT chk_stock_avco           CHECK (avco_cost IS NULL OR avco_cost >= 0)
);

CREATE TRIGGER trg_stock_updated_at
  BEFORE UPDATE ON stock
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- available_quantity view helper (not a generated column — reserved can change atomically)
-- Use: quantity - reserved_quantity in queries

-- ---------------------------------------------------------------------------
-- 15. stock_movements
-- Append-only ledger — every quantity change is recorded here
-- ---------------------------------------------------------------------------

CREATE TABLE stock_movements (
  id              UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID                 NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  branch_id       UUID                 NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  tenant_id       UUID                 NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type            stock_movement_type  NOT NULL,
  quantity        DECIMAL(12,3)        NOT NULL,   -- always positive; type gives direction
  unit_cost       DECIMAL(12,4),                   -- cost per unit at time of movement
  total_cost      DECIMAL(12,4),                   -- unit_cost * quantity
  reference_type  VARCHAR(50),                     -- 'order' | 'purchase_order' | 'adjustment' | 'count'
  reference_id    UUID,                            -- FK to the source record
  notes           TEXT,
  performed_by    UUID                 REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ          NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_stock_movements_qty  CHECK (quantity > 0),
  CONSTRAINT chk_stock_movements_cost CHECK (unit_cost IS NULL OR unit_cost >= 0)
);

-- ---------------------------------------------------------------------------
-- 16. stock_count_sessions
-- Represents one physical inventory count event (kör sayım session)
-- ---------------------------------------------------------------------------

CREATE TABLE stock_count_sessions (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id    UUID         NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name         VARCHAR(255) NOT NULL,
  status       VARCHAR(20)  NOT NULL DEFAULT 'draft',
  blind_mode   BOOLEAN      NOT NULL DEFAULT TRUE,  -- kör sayım: counters cannot see system qty
  started_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by   UUID         REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ,

  CONSTRAINT chk_stock_count_status CHECK (
    status IN ('draft', 'in_progress', 'completed', 'cancelled')
  ),
  CONSTRAINT chk_stock_count_dates CHECK (
    completed_at IS NULL OR started_at IS NULL OR completed_at >= started_at
  )
);

CREATE TRIGGER trg_stock_count_sessions_updated_at
  BEFORE UPDATE ON stock_count_sessions
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ---------------------------------------------------------------------------
-- 17. stock_count_items
-- One row per product per counting session
-- ---------------------------------------------------------------------------

CREATE TABLE stock_count_items (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        UUID          NOT NULL REFERENCES stock_count_sessions(id) ON DELETE CASCADE,
  product_id        UUID          NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  tenant_id         UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  expected_quantity DECIMAL(12,3),               -- NULL in blind mode
  counted_quantity  DECIMAL(12,3),               -- NULL until counted
  notes             TEXT,
  counted_by        UUID          REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_stock_count_items           UNIQUE (session_id, product_id),
  CONSTRAINT chk_stock_count_items_expected CHECK (expected_quantity IS NULL OR expected_quantity >= 0),
  CONSTRAINT chk_stock_count_items_counted  CHECK (counted_quantity  IS NULL OR counted_quantity  >= 0)
);

CREATE TRIGGER trg_stock_count_items_updated_at
  BEFORE UPDATE ON stock_count_items
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
