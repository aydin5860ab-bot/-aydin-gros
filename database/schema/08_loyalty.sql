-- =============================================================================
-- MODULE 08 — LOYALTY
-- Tables: loyalty_programs, loyalty_accounts, loyalty_transactions
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 27. loyalty_programs
-- ---------------------------------------------------------------------------

CREATE TABLE loyalty_programs (
  id                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name                 VARCHAR(255)  NOT NULL,
  description          TEXT,
  points_per_currency  DECIMAL(8,4)  NOT NULL DEFAULT 1.0000, -- points earned per 1 TL spent
  currency_per_point   DECIMAL(8,4)  NOT NULL DEFAULT 0.1000, -- TL value of 1 point
  min_redeem_points    INTEGER       NOT NULL DEFAULT 100,
  is_active            BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at           TIMESTAMPTZ,

  CONSTRAINT chk_loyalty_program_name    CHECK (LENGTH(TRIM(name)) > 0),
  CONSTRAINT chk_loyalty_ppc            CHECK (points_per_currency > 0),
  CONSTRAINT chk_loyalty_cpp            CHECK (currency_per_point > 0),
  CONSTRAINT chk_loyalty_min_redeem     CHECK (min_redeem_points >= 0)
);

CREATE TRIGGER trg_loyalty_programs_updated_at
  BEFORE UPDATE ON loyalty_programs
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ---------------------------------------------------------------------------
-- 28. loyalty_accounts
-- One account per customer per program
-- ---------------------------------------------------------------------------

CREATE TABLE loyalty_accounts (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     UUID         NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  tenant_id       UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  program_id      UUID         NOT NULL REFERENCES loyalty_programs(id) ON DELETE CASCADE,
  points_balance  INTEGER      NOT NULL DEFAULT 0,
  total_earned    INTEGER      NOT NULL DEFAULT 0,
  total_redeemed  INTEGER      NOT NULL DEFAULT 0,
  tier            VARCHAR(20)  NOT NULL DEFAULT 'bronze', -- bronze | silver | gold | platinum
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_loyalty_accounts         UNIQUE (customer_id, program_id),
  CONSTRAINT chk_loyalty_account_balance CHECK (points_balance >= 0),
  CONSTRAINT chk_loyalty_account_earned  CHECK (total_earned >= 0),
  CONSTRAINT chk_loyalty_account_redeem  CHECK (total_redeemed >= 0),
  CONSTRAINT chk_loyalty_account_tier    CHECK (tier IN ('bronze', 'silver', 'gold', 'platinum'))
);

CREATE TRIGGER trg_loyalty_accounts_updated_at
  BEFORE UPDATE ON loyalty_accounts
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ---------------------------------------------------------------------------
-- 29. loyalty_transactions
-- Append-only ledger
-- ---------------------------------------------------------------------------

CREATE TABLE loyalty_transactions (
  id          UUID                     PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID                     NOT NULL REFERENCES loyalty_accounts(id) ON DELETE CASCADE,
  customer_id UUID                     NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  tenant_id   UUID                     NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type        loyalty_transaction_type NOT NULL,
  points      INTEGER                  NOT NULL,  -- positive = earned/bonus; negative = redeemed/expired
  order_id    UUID                     REFERENCES orders(id) ON DELETE SET NULL,
  reference   VARCHAR(255),
  notes       TEXT,
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ              NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_loyalty_tx_points CHECK (points != 0)
);
