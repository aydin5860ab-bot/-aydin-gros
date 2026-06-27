-- =============================================================================
-- MODULE 02 — USERS, ROLES, PERMISSIONS
-- Tables: users, user_sessions, roles, permissions,
--         role_permissions, user_role_assignments
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 5. users
-- ---------------------------------------------------------------------------

CREATE TABLE users (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email               VARCHAR(255) NOT NULL,
  phone               VARCHAR(50),
  full_name           VARCHAR(255) NOT NULL,
  password_hash       TEXT,                        -- NULL = OAuth-only user
  status              user_status  NOT NULL DEFAULT 'pending_verification',
  avatar_url          TEXT,
  last_login_at       TIMESTAMPTZ,
  email_verified_at   TIMESTAMPTZ,
  phone_verified_at   TIMESTAMPTZ,
  metadata            JSONB        NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ,

  CONSTRAINT uq_users_email   UNIQUE (tenant_id, email),
  CONSTRAINT chk_users_email  CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  CONSTRAINT chk_users_name   CHECK (LENGTH(TRIM(full_name)) > 0)
);

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ---------------------------------------------------------------------------
-- 6. user_sessions
-- Refresh token registry — one row per active device/session
-- ---------------------------------------------------------------------------

CREATE TABLE user_sessions (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id           UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  token_hash          TEXT         NOT NULL UNIQUE,  -- SHA-256 of access token
  refresh_token_hash  TEXT         UNIQUE,           -- SHA-256 of refresh token
  ip_address          INET,
  user_agent          TEXT,
  expires_at          TIMESTAMPTZ  NOT NULL,
  last_used_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_user_sessions_expiry CHECK (expires_at > created_at)
);

-- ---------------------------------------------------------------------------
-- 7. roles
-- ---------------------------------------------------------------------------

CREATE TABLE roles (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  is_system   BOOLEAN      NOT NULL DEFAULT FALSE, -- system roles cannot be deleted
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ,

  CONSTRAINT uq_roles_name UNIQUE (tenant_id, name),
  CONSTRAINT chk_roles_name CHECK (LENGTH(TRIM(name)) > 0)
);

CREATE TRIGGER trg_roles_updated_at
  BEFORE UPDATE ON roles
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- Seed system roles: tenant_admin, branch_manager, cashier, warehouse, viewer

-- ---------------------------------------------------------------------------
-- 8. permissions
-- Global permission registry — not tenant-scoped (fixed set per deployment)
-- ---------------------------------------------------------------------------

CREATE TABLE permissions (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  resource    VARCHAR(100) NOT NULL,  -- e.g. 'orders', 'products', 'stock'
  action      VARCHAR(50)  NOT NULL,  -- e.g. 'create', 'read', 'update', 'delete'
  description TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_permissions_resource_action UNIQUE (resource, action),
  CONSTRAINT chk_permissions_resource CHECK (LENGTH(TRIM(resource)) > 0),
  CONSTRAINT chk_permissions_action   CHECK (LENGTH(TRIM(action)) > 0)
);

-- ---------------------------------------------------------------------------
-- 9. role_permissions
-- ---------------------------------------------------------------------------

CREATE TABLE role_permissions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id       UUID        NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID        NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_role_permissions UNIQUE (role_id, permission_id)
);

-- ---------------------------------------------------------------------------
-- 10. user_role_assignments
-- A user can have different roles per branch (or tenant-wide when branch_id IS NULL)
-- ---------------------------------------------------------------------------

CREATE TABLE user_role_assignments (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id     UUID        NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id   UUID        REFERENCES branches(id) ON DELETE CASCADE, -- NULL = tenant-wide
  granted_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_user_role_assignments_updated_at
  BEFORE UPDATE ON user_role_assignments
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- Partial unique: one role per user per scope
-- Tenant-wide scope (branch_id IS NULL)
CREATE UNIQUE INDEX uq_user_role_tenant_wide
  ON user_role_assignments (user_id, role_id)
  WHERE branch_id IS NULL;

-- Branch-specific scope
CREATE UNIQUE INDEX uq_user_role_branch_specific
  ON user_role_assignments (user_id, role_id, branch_id)
  WHERE branch_id IS NOT NULL;
