-- =============================================================================
-- MODULE 03 — PRODUCTS, CATEGORIES, PRICE HISTORY
-- Tables: categories, products, product_price_history
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 11. categories
-- ---------------------------------------------------------------------------

CREATE TABLE categories (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  parent_id     UUID         REFERENCES categories(id) ON DELETE SET NULL,
  name          VARCHAR(255) NOT NULL,
  slug          VARCHAR(100) NOT NULL,
  description   TEXT,
  image_url     TEXT,
  display_order INTEGER      NOT NULL DEFAULT 0,
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ,

  CONSTRAINT uq_categories_slug  UNIQUE (tenant_id, slug),
  CONSTRAINT chk_categories_name CHECK (LENGTH(TRIM(name)) > 0),
  CONSTRAINT chk_categories_no_self_parent CHECK (id != parent_id)
);

CREATE TRIGGER trg_categories_updated_at
  BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- Seed slugs: manav, temel-gida, sut-sarkuteri, kozmetik, icecek,
--             atistirmalik, temizlik, kasap, ev-gerecleri, kahvaltilik, anne-bebek

-- ---------------------------------------------------------------------------
-- 12. products
-- ---------------------------------------------------------------------------

CREATE TABLE products (
  id              UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID           NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category_id     UUID           NOT NULL REFERENCES categories(id),
  sku             VARCHAR(50)    NOT NULL,
  name            VARCHAR(500)   NOT NULL,
  description     TEXT,
  unit            VARCHAR(50)    NOT NULL DEFAULT 'adet',
  price           DECIMAL(12,2)  NOT NULL,
  cost_price      DECIMAL(12,2),               -- last known purchase cost
  barcode         VARCHAR(100),
  image_url       TEXT,
  tags            TEXT[]         NOT NULL DEFAULT '{}',
  min_stock_level DECIMAL(12,3)  NOT NULL DEFAULT 0,
  is_active       BOOLEAN        NOT NULL DEFAULT TRUE,
  metadata        JSONB          NOT NULL DEFAULT '{}',
  legacy_id       INTEGER,                     -- original index.html product ID
  created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,

  CONSTRAINT uq_products_sku     UNIQUE (tenant_id, sku),
  CONSTRAINT chk_products_name   CHECK (LENGTH(TRIM(name)) > 0),
  CONSTRAINT chk_products_price  CHECK (price >= 0),
  CONSTRAINT chk_products_cost   CHECK (cost_price IS NULL OR cost_price >= 0),
  CONSTRAINT chk_products_unit   CHECK (LENGTH(TRIM(unit)) > 0),
  CONSTRAINT chk_products_min_stock CHECK (min_stock_level >= 0)
);

-- Barcode uniqueness only when barcode is not null
CREATE UNIQUE INDEX uq_products_barcode
  ON products (tenant_id, barcode)
  WHERE barcode IS NOT NULL AND deleted_at IS NULL;

CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ---------------------------------------------------------------------------
-- 13. product_price_history
-- Append-only — never UPDATE or DELETE rows
-- ---------------------------------------------------------------------------

CREATE TABLE product_price_history (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID          NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  tenant_id   UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id   UUID          REFERENCES branches(id) ON DELETE CASCADE, -- NULL = all branches
  old_price   DECIMAL(12,2) NOT NULL,
  new_price   DECIMAL(12,2) NOT NULL,
  changed_by  UUID          REFERENCES users(id) ON DELETE SET NULL,
  reason      TEXT,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_price_history_old   CHECK (old_price >= 0),
  CONSTRAINT chk_price_history_new   CHECK (new_price >= 0),
  CONSTRAINT chk_price_history_diff  CHECK (old_price != new_price)
);
