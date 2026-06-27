-- =============================================================================
-- MODULE 12 — WORKFLOW ENGINE
-- Tables: workflow_rules, workflow_executions
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 39. workflow_rules
-- Business rule definitions (if trigger + conditions → run actions)
-- ---------------------------------------------------------------------------

CREATE TABLE workflow_rules (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name               VARCHAR(255) NOT NULL,
  description        TEXT,
  trigger_event      VARCHAR(100) NOT NULL,  -- 'order_created' | 'stock_below_min' | etc.
  trigger_conditions JSONB       NOT NULL DEFAULT '{}', -- conditions on the event payload
  actions            JSONB       NOT NULL DEFAULT '[]', -- array of action descriptors
  is_active          BOOLEAN     NOT NULL DEFAULT TRUE,
  priority           INTEGER     NOT NULL DEFAULT 0,    -- higher = runs first
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at         TIMESTAMPTZ,

  CONSTRAINT chk_workflow_rules_name    CHECK (LENGTH(TRIM(name)) > 0),
  CONSTRAINT chk_workflow_rules_event   CHECK (LENGTH(TRIM(trigger_event)) > 0),
  CONSTRAINT chk_workflow_rules_actions CHECK (jsonb_typeof(actions) = 'array')

  -- Example trigger_events:
  --   order_created, order_status_changed, order_delivered,
  --   stock_below_minimum, stock_below_zero,
  --   purchase_order_received,
  --   customer_registered, coupon_used,
  --   loyalty_tier_upgraded, payment_received

  -- Example action descriptor:
  --   {"type": "send_notification", "template_id": "...", "channel": "whatsapp"}
  --   {"type": "create_purchase_order", "supplier_id": "...", "auto_approve": false}
  --   {"type": "update_order_status", "to_status": "confirmed"}
);

CREATE TRIGGER trg_workflow_rules_updated_at
  BEFORE UPDATE ON workflow_rules
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ---------------------------------------------------------------------------
-- 40. workflow_executions
-- Execution history — append-only per rule per trigger event
-- ---------------------------------------------------------------------------

CREATE TABLE workflow_executions (
  id             UUID                      PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id        UUID                      NOT NULL REFERENCES workflow_rules(id) ON DELETE CASCADE,
  tenant_id      UUID                      NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  trigger_data   JSONB                     NOT NULL DEFAULT '{}', -- sanitized snapshot of event payload
  status         workflow_execution_status NOT NULL DEFAULT 'pending',
  started_at     TIMESTAMPTZ,
  completed_at   TIMESTAMPTZ,
  error_message  TEXT,
  actions_taken  JSONB                     NOT NULL DEFAULT '[]', -- execution log of each action
  created_at     TIMESTAMPTZ               NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_workflow_exec_dates CHECK (
    completed_at IS NULL OR started_at IS NULL OR completed_at >= started_at
  )
);
