-- =============================================================================
-- MODULE 13 — AI SERVICE LAYER (HERMES)
-- Tables: ai_request_logs, ai_audit_logs
--
-- Architecture rule: Hermes AI never reads DB directly.
-- All AI access flows through: Request Validator → Data Fetcher →
-- Payload Builder → AI Gateway → Response Validator → Audit Log
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 41. ai_request_logs
-- Every AI call is logged here — append-only
-- ---------------------------------------------------------------------------

CREATE TABLE ai_request_logs (
  id              UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID             NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id         UUID             REFERENCES users(id) ON DELETE SET NULL,
  branch_id       UUID             REFERENCES branches(id) ON DELETE SET NULL,
  request_type    VARCHAR(100)     NOT NULL,  -- 'product_recommendation' | 'inventory_insight'
                                              -- | 'order_analysis' | 'price_suggestion'
                                              -- | 'demand_forecast' | 'anomaly_detection'
  input_payload   JSONB            NOT NULL DEFAULT '{}',  -- sanitized; NO PII, NO secrets
  output_payload  JSONB            NOT NULL DEFAULT '{}',  -- AI response (sanitized)
  model_used      VARCHAR(100),
  tokens_input    INTEGER,
  tokens_output   INTEGER,
  latency_ms      INTEGER,
  status          ai_request_status NOT NULL DEFAULT 'pending',
  error_message   TEXT,
  created_at      TIMESTAMPTZ      NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_ai_request_type   CHECK (LENGTH(TRIM(request_type)) > 0),
  CONSTRAINT chk_ai_tokens_input   CHECK (tokens_input  IS NULL OR tokens_input  >= 0),
  CONSTRAINT chk_ai_tokens_output  CHECK (tokens_output IS NULL OR tokens_output >= 0),
  CONSTRAINT chk_ai_latency        CHECK (latency_ms    IS NULL OR latency_ms    >= 0)
);

-- ---------------------------------------------------------------------------
-- 42. ai_audit_logs
-- Records exactly what data was fetched for each AI request — compliance
-- Append-only, immutable
-- ---------------------------------------------------------------------------

CREATE TABLE ai_audit_logs (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  request_id        UUID        NOT NULL REFERENCES ai_request_logs(id) ON DELETE CASCADE,
  data_accessed     JSONB       NOT NULL DEFAULT '{}', -- describes tables/fields queried
  access_validated  BOOLEAN     NOT NULL DEFAULT FALSE, -- did validator approve?
  tenant_scope_ok   BOOLEAN     NOT NULL DEFAULT FALSE, -- was tenant_id enforced?
  pii_excluded      BOOLEAN     NOT NULL DEFAULT FALSE, -- was PII stripped?
  validator_notes   TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
