-- =============================================================================
-- MODULE 14 — AUDIT LOG
-- Table: audit_logs
-- Immutable append-only table — no UPDATE, no DELETE ever
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 43. audit_logs
-- ---------------------------------------------------------------------------

CREATE TABLE audit_logs (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id        UUID         REFERENCES users(id) ON DELETE SET NULL,
  action         audit_action NOT NULL,
  resource_type  VARCHAR(100) NOT NULL,  -- table/entity name: 'orders', 'products', etc.
  resource_id    UUID,                   -- PK of the affected row
  old_values     JSONB,                  -- snapshot before change (NULL for create)
  new_values     JSONB,                  -- snapshot after change (NULL for delete)
  ip_address     INET,
  user_agent     TEXT,
  metadata       JSONB        NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_audit_resource_type CHECK (LENGTH(TRIM(resource_type)) > 0)
);

-- Prevent any modification or deletion — audit log is immutable
CREATE RULE audit_logs_no_update AS ON UPDATE TO audit_logs DO INSTEAD NOTHING;
CREATE RULE audit_logs_no_delete AS ON DELETE TO audit_logs DO INSTEAD NOTHING;

-- ---------------------------------------------------------------------------
-- Audit trigger helper
-- Usage: SELECT fn_create_audit_trigger('orders');
-- Generates before/after triggers that write to audit_logs automatically
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_audit_trigger()
RETURNS TRIGGER AS $$
DECLARE
  v_old_data JSONB;
  v_new_data JSONB;
  v_action   audit_action;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action   := 'create';
    v_old_data := NULL;
    v_new_data := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_action   := 'update';
    v_old_data := to_jsonb(OLD);
    v_new_data := to_jsonb(NEW);
  ELSIF TG_OP = 'DELETE' THEN
    v_action   := 'delete';
    v_old_data := to_jsonb(OLD);
    v_new_data := NULL;
  END IF;

  INSERT INTO audit_logs (
    tenant_id,
    action,
    resource_type,
    resource_id,
    old_values,
    new_values
  )
  VALUES (
    COALESCE(NEW.tenant_id, OLD.tenant_id),
    v_action,
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    v_old_data,
    v_new_data
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION fn_create_audit_trigger(p_table TEXT)
RETURNS VOID AS $$
BEGIN
  EXECUTE FORMAT(
    'CREATE TRIGGER trg_%I_audit
     AFTER INSERT OR UPDATE OR DELETE ON %I
     FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger()',
    p_table, p_table
  );
END;
$$ LANGUAGE plpgsql;

-- Enable audit on sensitive tables:
SELECT fn_create_audit_trigger('orders');
SELECT fn_create_audit_trigger('products');
SELECT fn_create_audit_trigger('coupons');
SELECT fn_create_audit_trigger('users');
SELECT fn_create_audit_trigger('stock');
SELECT fn_create_audit_trigger('payments');
