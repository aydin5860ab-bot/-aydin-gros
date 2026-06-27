-- =============================================================================
-- MODULE 11 — NOTIFICATIONS
-- Tables: notification_templates, notification_logs, notification_rules
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 36. notification_templates
-- ---------------------------------------------------------------------------

CREATE TABLE notification_templates (
  id          UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID                 NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        VARCHAR(255)         NOT NULL,
  channel     notification_channel NOT NULL,
  subject     VARCHAR(500),                    -- used for email channel
  body        TEXT                 NOT NULL,   -- supports {{variable}} placeholders
  variables   TEXT[]               NOT NULL DEFAULT '{}', -- list of supported {{vars}}
  is_active   BOOLEAN              NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ,

  CONSTRAINT uq_notification_templates_name UNIQUE (tenant_id, name),
  CONSTRAINT chk_notification_templates_name CHECK (LENGTH(TRIM(name)) > 0),
  CONSTRAINT chk_notification_templates_body CHECK (LENGTH(TRIM(body)) > 0)
);

CREATE TRIGGER trg_notification_templates_updated_at
  BEFORE UPDATE ON notification_templates
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ---------------------------------------------------------------------------
-- 37. notification_logs
-- Append-only delivery record
-- ---------------------------------------------------------------------------

CREATE TABLE notification_logs (
  id                UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID                 NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_id       UUID                 REFERENCES notification_templates(id) ON DELETE SET NULL,
  channel           notification_channel NOT NULL,
  recipient         VARCHAR(255)         NOT NULL, -- phone number or email address
  subject           VARCHAR(500),
  body              TEXT                 NOT NULL,
  status            VARCHAR(20)          NOT NULL DEFAULT 'pending',
  reference_type    VARCHAR(50),                   -- 'order' | 'customer' | 'stock_alert'
  reference_id      UUID,
  provider_response JSONB                NOT NULL DEFAULT '{}',
  sent_at           TIMESTAMPTZ,
  failed_at         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ          NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_notification_logs_status CHECK (
    status IN ('pending', 'sent', 'failed', 'delivered', 'read')
  ),
  CONSTRAINT chk_notification_logs_recipient CHECK (LENGTH(TRIM(recipient)) > 0)
);

-- ---------------------------------------------------------------------------
-- 38. notification_rules
-- Automated trigger rules (e.g. send WhatsApp when order confirmed)
-- ---------------------------------------------------------------------------

CREATE TABLE notification_rules (
  id              UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID                 NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name            VARCHAR(255)         NOT NULL,
  trigger_event   VARCHAR(100)         NOT NULL, -- 'order_confirmed' | 'stock_low' | etc.
  channel         notification_channel NOT NULL,
  template_id     UUID                 NOT NULL REFERENCES notification_templates(id),
  conditions      JSONB                NOT NULL DEFAULT '{}', -- optional filter conditions
  is_active       BOOLEAN              NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,

  CONSTRAINT chk_notification_rules_name    CHECK (LENGTH(TRIM(name)) > 0),
  CONSTRAINT chk_notification_rules_event   CHECK (LENGTH(TRIM(trigger_event)) > 0)
);

CREATE TRIGGER trg_notification_rules_updated_at
  BEFORE UPDATE ON notification_rules
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
