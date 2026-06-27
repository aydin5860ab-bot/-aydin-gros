-- =============================================================================
-- MODULE 07 — CAMPAIGNS & COUPONS
-- Tables: campaigns, campaign_conditions, coupons, coupon_usages
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 23. campaigns
-- ---------------------------------------------------------------------------

CREATE TABLE campaigns (
  id                    UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID           NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id             UUID           REFERENCES branches(id) ON DELETE CASCADE, -- NULL = all branches
  name                  VARCHAR(255)   NOT NULL,
  description           TEXT,
  type                  campaign_type  NOT NULL,
  value                 DECIMAL(12,2),           -- percentage or fixed amount; NULL for gift/bxgy
  gift_product_id       UUID           REFERENCES products(id) ON DELETE SET NULL,
  starts_at             TIMESTAMPTZ    NOT NULL,
  ends_at               TIMESTAMPTZ,
  is_active             BOOLEAN        NOT NULL DEFAULT TRUE,
  min_order_amount      DECIMAL(12,2),
  max_uses              INTEGER,                 -- NULL = unlimited
  current_uses          INTEGER        NOT NULL DEFAULT 0,
  applicable_categories UUID[]         NOT NULL DEFAULT '{}', -- empty = all categories
  applicable_products   UUID[]         NOT NULL DEFAULT '{}', -- empty = all products
  metadata              JSONB          NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ,

  CONSTRAINT chk_campaigns_name        CHECK (LENGTH(TRIM(name)) > 0),
  CONSTRAINT chk_campaigns_value       CHECK (value IS NULL OR value > 0),
  CONSTRAINT chk_campaigns_dates       CHECK (ends_at IS NULL OR ends_at > starts_at),
  CONSTRAINT chk_campaigns_max_uses    CHECK (max_uses IS NULL OR max_uses > 0),
  CONSTRAINT chk_campaigns_current     CHECK (current_uses >= 0),
  CONSTRAINT chk_campaigns_pct_max     CHECK (
    type != 'percentage_discount' OR (value IS NOT NULL AND value <= 100)
  )
);

CREATE TRIGGER trg_campaigns_updated_at
  BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ---------------------------------------------------------------------------
-- 24. campaign_conditions
-- Extra conditions beyond min_order_amount (time-of-day, day-of-week, etc.)
-- ---------------------------------------------------------------------------

CREATE TABLE campaign_conditions (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id      UUID         NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  tenant_id        UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  condition_type   VARCHAR(50)  NOT NULL, -- min_quantity | day_of_week | time_range | customer_tag
  condition_value  JSONB        NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_campaign_conditions_type CHECK (
    condition_type IN ('min_quantity', 'day_of_week', 'time_range', 'customer_tag', 'min_amount')
  )
);

CREATE TRIGGER trg_campaign_conditions_updated_at
  BEFORE UPDATE ON campaign_conditions
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ---------------------------------------------------------------------------
-- 25. coupons
-- ---------------------------------------------------------------------------

CREATE TABLE coupons (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id         UUID          REFERENCES branches(id) ON DELETE CASCADE, -- NULL = all branches
  code              VARCHAR(50)   NOT NULL,
  type              coupon_type   NOT NULL,
  value             DECIMAL(12,2),          -- pct or fixed amount; NULL for gift/free_shipping
  gift_product_id   UUID          REFERENCES products(id) ON DELETE SET NULL,
  description       TEXT,
  is_active         BOOLEAN       NOT NULL DEFAULT TRUE,
  starts_at         TIMESTAMPTZ,
  ends_at           TIMESTAMPTZ,
  max_uses          INTEGER,                -- NULL = unlimited
  current_uses      INTEGER       NOT NULL DEFAULT 0,
  per_customer_limit INTEGER      NOT NULL DEFAULT 1,
  min_order_amount  DECIMAL(12,2),
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ,

  CONSTRAINT uq_coupons_code         UNIQUE (tenant_id, code),
  CONSTRAINT chk_coupons_code        CHECK (LENGTH(TRIM(code)) > 0),
  CONSTRAINT chk_coupons_value       CHECK (value IS NULL OR value > 0),
  CONSTRAINT chk_coupons_pct_max     CHECK (type != 'percentage' OR (value IS NOT NULL AND value <= 100)),
  CONSTRAINT chk_coupons_dates       CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at),
  CONSTRAINT chk_coupons_uses        CHECK (current_uses >= 0),
  CONSTRAINT chk_coupons_per_cust    CHECK (per_customer_limit >= 1)
);

CREATE TRIGGER trg_coupons_updated_at
  BEFORE UPDATE ON coupons
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ---------------------------------------------------------------------------
-- 26. coupon_usages
-- ---------------------------------------------------------------------------

CREATE TABLE coupon_usages (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id        UUID          NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  order_id         UUID          NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  customer_id      UUID          REFERENCES customers(id) ON DELETE SET NULL,
  tenant_id        UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  discount_applied DECIMAL(12,2) NOT NULL DEFAULT 0,
  used_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_coupon_usages           UNIQUE (coupon_id, order_id),
  CONSTRAINT chk_coupon_usages_discount CHECK (discount_applied >= 0)
);
