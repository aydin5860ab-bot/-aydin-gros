-- =============================================================================
-- MODULE 99 — INDEXES
-- All performance indexes consolidated here.
-- PK indexes are created automatically with PRIMARY KEY constraints.
-- UNIQUE indexes already created inline in table definitions.
-- This file adds query-path indexes only.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- TENANTS
-- ---------------------------------------------------------------------------

CREATE INDEX idx_tenants_slug        ON tenants (slug) WHERE deleted_at IS NULL;
CREATE INDEX idx_tenants_is_active   ON tenants (is_active) WHERE deleted_at IS NULL;

CREATE INDEX idx_tenant_settings_tenant ON tenant_settings (tenant_id);

CREATE INDEX idx_branches_tenant      ON branches (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_branches_is_active   ON branches (tenant_id, is_active) WHERE deleted_at IS NULL;
CREATE INDEX idx_branches_is_main     ON branches (tenant_id, is_main) WHERE deleted_at IS NULL;

CREATE INDEX idx_branch_settings_branch ON branch_settings (branch_id);
CREATE INDEX idx_branch_settings_tenant ON branch_settings (tenant_id);

-- ---------------------------------------------------------------------------
-- USERS
-- ---------------------------------------------------------------------------

CREATE INDEX idx_users_tenant        ON users (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_email         ON users (tenant_id, email) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_status        ON users (tenant_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_phone         ON users (tenant_id, phone) WHERE phone IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_user_sessions_user     ON user_sessions (user_id);
CREATE INDEX idx_user_sessions_token    ON user_sessions (token_hash);
CREATE INDEX idx_user_sessions_expires  ON user_sessions (expires_at);

CREATE INDEX idx_roles_tenant           ON roles (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_role_permissions_role  ON role_permissions (role_id);
CREATE INDEX idx_role_permissions_perm  ON role_permissions (permission_id);

CREATE INDEX idx_user_roles_user        ON user_role_assignments (user_id);
CREATE INDEX idx_user_roles_role        ON user_role_assignments (role_id);
CREATE INDEX idx_user_roles_tenant      ON user_role_assignments (tenant_id);
CREATE INDEX idx_user_roles_branch      ON user_role_assignments (branch_id) WHERE branch_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- PRODUCTS
-- ---------------------------------------------------------------------------

CREATE INDEX idx_categories_tenant      ON categories (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_categories_parent      ON categories (parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX idx_categories_active      ON categories (tenant_id, is_active) WHERE deleted_at IS NULL;
CREATE INDEX idx_categories_order       ON categories (tenant_id, display_order) WHERE deleted_at IS NULL;

CREATE INDEX idx_products_tenant        ON products (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_products_category      ON products (tenant_id, category_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_products_sku           ON products (tenant_id, sku) WHERE deleted_at IS NULL;
CREATE INDEX idx_products_active        ON products (tenant_id, is_active) WHERE deleted_at IS NULL;
CREATE INDEX idx_products_legacy_id     ON products (tenant_id, legacy_id) WHERE legacy_id IS NOT NULL;
CREATE INDEX idx_products_name_trgm     ON products USING gin (name gin_trgm_ops);  -- Turkish text search
CREATE INDEX idx_products_tags          ON products USING gin (tags);

CREATE INDEX idx_price_history_product  ON product_price_history (product_id);
CREATE INDEX idx_price_history_tenant   ON product_price_history (tenant_id);
CREATE INDEX idx_price_history_created  ON product_price_history (product_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- STOCK
-- ---------------------------------------------------------------------------

CREATE INDEX idx_stock_tenant           ON stock (tenant_id);
CREATE INDEX idx_stock_branch           ON stock (branch_id);
CREATE INDEX idx_stock_product          ON stock (product_id);
CREATE INDEX idx_stock_low              ON stock (tenant_id, branch_id, quantity)
  WHERE quantity <= 5;  -- fast low-stock queries

CREATE INDEX idx_stock_movements_product  ON stock_movements (product_id);
CREATE INDEX idx_stock_movements_branch   ON stock_movements (branch_id);
CREATE INDEX idx_stock_movements_tenant   ON stock_movements (tenant_id);
CREATE INDEX idx_stock_movements_type     ON stock_movements (tenant_id, type);
CREATE INDEX idx_stock_movements_ref      ON stock_movements (reference_type, reference_id)
  WHERE reference_id IS NOT NULL;
CREATE INDEX idx_stock_movements_created  ON stock_movements (tenant_id, created_at DESC);

CREATE INDEX idx_count_sessions_tenant    ON stock_count_sessions (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_count_sessions_branch    ON stock_count_sessions (branch_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_count_sessions_status    ON stock_count_sessions (tenant_id, status) WHERE deleted_at IS NULL;

CREATE INDEX idx_count_items_session      ON stock_count_items (session_id);
CREATE INDEX idx_count_items_product      ON stock_count_items (product_id);

-- ---------------------------------------------------------------------------
-- CUSTOMERS
-- ---------------------------------------------------------------------------

CREATE INDEX idx_customers_tenant       ON customers (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_customers_phone        ON customers (tenant_id, phone) WHERE phone IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_customers_active       ON customers (tenant_id, is_active) WHERE deleted_at IS NULL;
CREATE INDEX idx_customers_last_order   ON customers (tenant_id, last_order_at DESC NULLS LAST)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_customers_name_trgm    ON customers USING gin (full_name gin_trgm_ops);

CREATE INDEX idx_customer_addresses_customer ON customer_addresses (customer_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_customer_addresses_default  ON customer_addresses (customer_id) WHERE is_default = TRUE AND deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- ORDERS
-- ---------------------------------------------------------------------------

CREATE INDEX idx_orders_tenant          ON orders (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_orders_branch          ON orders (branch_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_orders_customer        ON orders (customer_id) WHERE customer_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_orders_status          ON orders (tenant_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_orders_payment_status  ON orders (tenant_id, payment_status) WHERE deleted_at IS NULL;
CREATE INDEX idx_orders_number          ON orders (tenant_id, order_number) WHERE deleted_at IS NULL;
CREATE INDEX idx_orders_created         ON orders (tenant_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_orders_branch_created  ON orders (branch_id, created_at DESC) WHERE deleted_at IS NULL;

CREATE INDEX idx_order_items_order      ON order_items (order_id);
CREATE INDEX idx_order_items_product    ON order_items (product_id) WHERE product_id IS NOT NULL;
CREATE INDEX idx_order_items_tenant     ON order_items (tenant_id);

CREATE INDEX idx_order_history_order    ON order_status_history (order_id);
CREATE INDEX idx_order_history_created  ON order_status_history (order_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- CAMPAIGNS & COUPONS
-- ---------------------------------------------------------------------------

CREATE INDEX idx_campaigns_tenant       ON campaigns (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_campaigns_active       ON campaigns (tenant_id, is_active, starts_at, ends_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_campaigns_branch       ON campaigns (branch_id) WHERE branch_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_coupons_tenant         ON coupons (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_coupons_code           ON coupons (tenant_id, code) WHERE deleted_at IS NULL;
CREATE INDEX idx_coupons_active         ON coupons (tenant_id, is_active) WHERE deleted_at IS NULL;

CREATE INDEX idx_coupon_usages_coupon   ON coupon_usages (coupon_id);
CREATE INDEX idx_coupon_usages_order    ON coupon_usages (order_id);
CREATE INDEX idx_coupon_usages_customer ON coupon_usages (customer_id) WHERE customer_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- LOYALTY
-- ---------------------------------------------------------------------------

CREATE INDEX idx_loyalty_programs_tenant   ON loyalty_programs (tenant_id) WHERE deleted_at IS NULL;

CREATE INDEX idx_loyalty_accounts_customer ON loyalty_accounts (customer_id);
CREATE INDEX idx_loyalty_accounts_tenant   ON loyalty_accounts (tenant_id);
CREATE INDEX idx_loyalty_accounts_program  ON loyalty_accounts (program_id);

CREATE INDEX idx_loyalty_tx_account        ON loyalty_transactions (account_id);
CREATE INDEX idx_loyalty_tx_customer       ON loyalty_transactions (customer_id);
CREATE INDEX idx_loyalty_tx_order          ON loyalty_transactions (order_id) WHERE order_id IS NOT NULL;
CREATE INDEX idx_loyalty_tx_created        ON loyalty_transactions (account_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- SUPPLIERS
-- ---------------------------------------------------------------------------

CREATE INDEX idx_suppliers_tenant          ON suppliers (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_suppliers_active          ON suppliers (tenant_id, is_active) WHERE deleted_at IS NULL;

CREATE INDEX idx_purchase_orders_tenant    ON purchase_orders (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_purchase_orders_branch    ON purchase_orders (branch_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_purchase_orders_supplier  ON purchase_orders (supplier_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_purchase_orders_status    ON purchase_orders (tenant_id, status) WHERE deleted_at IS NULL;

CREATE INDEX idx_po_items_po               ON purchase_order_items (purchase_order_id);
CREATE INDEX idx_po_items_product          ON purchase_order_items (product_id) WHERE product_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- FINANCE
-- ---------------------------------------------------------------------------

CREATE INDEX idx_invoices_tenant           ON invoices (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_invoices_branch           ON invoices (branch_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_invoices_order            ON invoices (order_id) WHERE order_id IS NOT NULL;
CREATE INDEX idx_invoices_customer         ON invoices (customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX idx_invoices_status           ON invoices (tenant_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_invoices_due_date         ON invoices (tenant_id, due_date) WHERE status NOT IN ('paid','cancelled') AND deleted_at IS NULL;

CREATE INDEX idx_invoice_items_invoice     ON invoice_items (invoice_id);
CREATE INDEX idx_invoice_items_product     ON invoice_items (product_id) WHERE product_id IS NOT NULL;

CREATE INDEX idx_payments_tenant           ON payments (tenant_id);
CREATE INDEX idx_payments_branch           ON payments (branch_id);
CREATE INDEX idx_payments_order            ON payments (order_id) WHERE order_id IS NOT NULL;
CREATE INDEX idx_payments_status           ON payments (tenant_id, status);
CREATE INDEX idx_payments_created          ON payments (tenant_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- NOTIFICATIONS
-- ---------------------------------------------------------------------------

CREATE INDEX idx_notification_tmpl_tenant  ON notification_templates (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_notification_logs_tenant  ON notification_logs (tenant_id);
CREATE INDEX idx_notification_logs_status  ON notification_logs (tenant_id, status);
CREATE INDEX idx_notification_logs_ref     ON notification_logs (reference_type, reference_id)
  WHERE reference_id IS NOT NULL;
CREATE INDEX idx_notification_logs_created ON notification_logs (tenant_id, created_at DESC);

CREATE INDEX idx_notification_rules_tenant ON notification_rules (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_notification_rules_event  ON notification_rules (tenant_id, trigger_event) WHERE is_active = TRUE AND deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- WORKFLOW
-- ---------------------------------------------------------------------------

CREATE INDEX idx_workflow_rules_tenant     ON workflow_rules (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_workflow_rules_event      ON workflow_rules (tenant_id, trigger_event) WHERE is_active = TRUE AND deleted_at IS NULL;
CREATE INDEX idx_workflow_rules_priority   ON workflow_rules (tenant_id, priority DESC) WHERE is_active = TRUE AND deleted_at IS NULL;

CREATE INDEX idx_workflow_exec_rule        ON workflow_executions (rule_id);
CREATE INDEX idx_workflow_exec_tenant      ON workflow_executions (tenant_id);
CREATE INDEX idx_workflow_exec_status      ON workflow_executions (tenant_id, status);
CREATE INDEX idx_workflow_exec_created     ON workflow_executions (tenant_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- AI
-- ---------------------------------------------------------------------------

CREATE INDEX idx_ai_request_tenant         ON ai_request_logs (tenant_id);
CREATE INDEX idx_ai_request_user           ON ai_request_logs (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_ai_request_type           ON ai_request_logs (tenant_id, request_type);
CREATE INDEX idx_ai_request_status         ON ai_request_logs (tenant_id, status);
CREATE INDEX idx_ai_request_created        ON ai_request_logs (tenant_id, created_at DESC);

CREATE INDEX idx_ai_audit_tenant           ON ai_audit_logs (tenant_id);
CREATE INDEX idx_ai_audit_request          ON ai_audit_logs (request_id);

-- ---------------------------------------------------------------------------
-- AUDIT
-- ---------------------------------------------------------------------------

CREATE INDEX idx_audit_logs_tenant         ON audit_logs (tenant_id);
CREATE INDEX idx_audit_logs_user           ON audit_logs (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_audit_logs_resource       ON audit_logs (resource_type, resource_id) WHERE resource_id IS NOT NULL;
CREATE INDEX idx_audit_logs_action         ON audit_logs (tenant_id, action);
CREATE INDEX idx_audit_logs_created        ON audit_logs (tenant_id, created_at DESC);
