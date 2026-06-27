-- =============================================================================
-- MODULE 01 — TENANTS, BRANCHES
-- Tables: tenants, tenant_settings, branches, branch_settings
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. tenants
-- ---------------------------------------------------------------------------

CREATE TABLE tenants (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         VARCHAR(100) NOT NULL,
  name         VARCHAR(255) NOT NULL,
  plan         VARCHAR(50)  NOT NULL DEFAULT 'starter', -- starter | pro | enterprise
  is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
  trial_ends_at TIMESTAMPTZ,
  metadata     JSONB        NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ,

  CONSTRAINT uq_tenants_slug      UNIQUE (slug),
  CONSTRAINT chk_tenants_slug     CHECK (slug ~ '^[a-z0-9\-]+$'),
  CONSTRAINT chk_tenants_name     CHECK (LENGTH(TRIM(name)) > 0),
  CONSTRAINT chk_tenants_plan     CHECK (plan IN ('starter', 'pro', 'enterprise'))
);

CREATE TRIGGER trg_tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. tenant_settings
-- Key/value store for per-tenant configuration
-- ---------------------------------------------------------------------------

CREATE TABLE tenant_settings (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key        VARCHAR(100) NOT NULL,
  value      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_tenant_settings_key UNIQUE (tenant_id, key),
  CONSTRAINT chk_tenant_settings_key CHECK (LENGTH(TRIM(key)) > 0)
);

CREATE TRIGGER trg_tenant_settings_updated_at
  BEFORE UPDATE ON tenant_settings
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- Seed: default keys are
--   free_delivery_threshold, whatsapp_number, announcement_text,
--   default_tax_rate, currency, timezone, language

-- ---------------------------------------------------------------------------
-- 3. branches
-- ---------------------------------------------------------------------------

CREATE TABLE branches (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name             VARCHAR(255) NOT NULL,
  slug             VARCHAR(100) NOT NULL,
  address          TEXT,
  phone            VARCHAR(50),
  whatsapp_number  VARCHAR(50),
  is_main          BOOLEAN      NOT NULL DEFAULT FALSE,
  is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
  latitude         DECIMAL(10,8),
  longitude        DECIMAL(11,8),
  operating_hours  JSONB        NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ,

  CONSTRAINT uq_branches_slug        UNIQUE (tenant_id, slug),
  CONSTRAINT chk_branches_name       CHECK (LENGTH(TRIM(name)) > 0),
  CONSTRAINT chk_branches_slug       CHECK (slug ~ '^[a-z0-9\-]+$'),
  CONSTRAINT chk_branches_latitude   CHECK (latitude  IS NULL OR (latitude  BETWEEN -90  AND 90)),
  CONSTRAINT chk_branches_longitude  CHECK (longitude IS NULL OR (longitude BETWEEN -180 AND 180))
);

CREATE TRIGGER trg_branches_updated_at
  BEFORE UPDATE ON branches
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. branch_settings
-- ---------------------------------------------------------------------------

CREATE TABLE branch_settings (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id  UUID         NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  tenant_id  UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key        VARCHAR(100) NOT NULL,
  value      TEXT,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_branch_settings_key UNIQUE (branch_id, key),
  CONSTRAINT chk_branch_settings_key CHECK (LENGTH(TRIM(key)) > 0)
);

CREATE TRIGGER trg_branch_settings_updated_at
  BEFORE UPDATE ON branch_settings
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
