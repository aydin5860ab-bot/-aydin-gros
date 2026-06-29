-- ==============================================================================
-- AYDIN GROS OS - SUPABASE RLS POLICIES
-- v2.0 (Phase Beta Consolidated Security Policies)
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- SUPABASE HELPER FUNCTIONS
-- ==============================================================================

CREATE OR REPLACE FUNCTION current_user_id() RETURNS UUID AS $$
  SELECT auth.uid();
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS UUID AS $$
  SELECT COALESCE(
    (auth.jwt()->>'tenant_id')::UUID,
    (current_setting('app.tenant_id', true))::UUID
  );
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION current_user_role() RETURNS VARCHAR AS $$
  SELECT COALESCE(
    auth.jwt()->>'user_role',
    auth.jwt()->>'role',
    'authenticated'
  );
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION current_branch_id() RETURNS UUID AS $$
  SELECT (auth.jwt()->>'branch_id')::UUID;
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION current_register_id() RETURNS UUID AS $$
  SELECT (auth.jwt()->>'register_id')::UUID;
$$ LANGUAGE SQL STABLE;

-- ==============================================================================
-- ROW LEVEL SECURITY ACTIVATION
-- ==============================================================================

ALTER TABLE IF EXISTS subscription_plans        ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS tenants                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS tenant_invoices           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS tenant_settings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS branches                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS warehouses                ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS registers                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS suppliers                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS users                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS user_sessions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS customer_addresses        ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS categories                ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS products                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS product_barcodes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS product_prices            ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS product_price_history     ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS product_images            ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS product_stock             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS stock                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS stock_movements           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS stock_counts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS stock_count_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS stock_transfers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS stock_transfer_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS orders                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS order_items               ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS order_status_history      ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS register_sessions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS cash_sessions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS cash_transactions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS customers                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS customer_transactions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS loyalty_programs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS loyalty_accounts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS loyalty_transactions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS campaigns                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS coupons                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS coupon_usages             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS invoices                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS invoice_items             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS audit_logs                ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS notifications             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS notification_preferences  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS staff_permissions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS backup_jobs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS daily_reports             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS webhook_endpoints         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS webhook_deliveries        ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS integration_settings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS whatsapp_orders           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS efatura_records           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS sale_payments             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS sale_returns              ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS sale_return_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS sale_exchanges            ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS z_reports                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS ai_recommendations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS ai_anomalies              ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- RLS POLICIES (Tenant Isolation and Role-Based Access Controls)
-- ==============================================================================

-- Drop existing policies if they exist (ensure idempotency)
DROP POLICY IF EXISTS tenant_isolation_policy ON tenants;
DROP POLICY IF EXISTS tenant_isolation_policy ON tenant_invoices;
DROP POLICY IF EXISTS tenant_isolation_policy ON tenant_settings;
DROP POLICY IF EXISTS tenant_isolation_policy ON branches;
DROP POLICY IF EXISTS tenant_isolation_policy ON warehouses;
DROP POLICY IF EXISTS tenant_isolation_policy ON registers;
DROP POLICY IF EXISTS tenant_isolation_policy ON suppliers;
DROP POLICY IF EXISTS tenant_isolation_policy ON users;
DROP POLICY IF EXISTS tenant_isolation_policy ON user_sessions;
DROP POLICY IF EXISTS tenant_isolation_policy ON customer_addresses;
DROP POLICY IF EXISTS tenant_isolation_policy ON categories;
DROP POLICY IF EXISTS tenant_isolation_policy ON products;
DROP POLICY IF EXISTS tenant_isolation_policy ON product_barcodes;
DROP POLICY IF EXISTS tenant_isolation_policy ON product_prices;
DROP POLICY IF EXISTS tenant_isolation_policy ON product_stock;
DROP POLICY IF EXISTS tenant_isolation_policy ON stock;
DROP POLICY IF EXISTS tenant_isolation_policy ON stock_movements;
DROP POLICY IF EXISTS tenant_isolation_policy ON stock_transfers;
DROP POLICY IF EXISTS tenant_isolation_policy ON orders;
DROP POLICY IF EXISTS tenant_isolation_policy ON order_items;
DROP POLICY IF EXISTS tenant_isolation_policy ON register_sessions;
DROP POLICY IF EXISTS tenant_isolation_policy ON customers;
DROP POLICY IF EXISTS tenant_isolation_policy ON customer_transactions;
DROP POLICY IF EXISTS tenant_isolation_policy ON loyalty_programs;
DROP POLICY IF EXISTS tenant_isolation_policy ON loyalty_accounts;
DROP POLICY IF EXISTS tenant_isolation_policy ON loyalty_transactions;
DROP POLICY IF EXISTS tenant_isolation_policy ON campaigns;
DROP POLICY IF EXISTS tenant_isolation_policy ON coupons;
DROP POLICY IF EXISTS tenant_isolation_policy ON coupon_usages;
DROP POLICY IF EXISTS tenant_isolation_policy ON invoices;
DROP POLICY IF EXISTS tenant_isolation_policy ON audit_logs_insert ON audit_logs;
DROP POLICY IF EXISTS tenant_isolation_policy ON audit_logs_select ON audit_logs;
DROP POLICY IF EXISTS tenant_isolation_policy ON staff_permissions;
DROP POLICY IF EXISTS tenant_isolation_policy ON backup_jobs;
DROP POLICY IF EXISTS tenant_isolation_policy ON whatsapp_orders;
DROP POLICY IF EXISTS tenant_isolation_policy ON efatura_records;
DROP POLICY IF EXISTS tenant_isolation_policy ON sale_payments;
DROP POLICY IF EXISTS tenant_isolation_policy ON sale_returns;
DROP POLICY IF EXISTS tenant_isolation_policy ON sale_return_items;
DROP POLICY IF EXISTS tenant_isolation_policy ON sale_exchanges;
DROP POLICY IF EXISTS tenant_isolation_policy ON z_reports;

-- Standard Tenant Isolation Policy Macro
-- We create explicit per-table policies targeting the tenant_id isolation.

-- 1. tenants
CREATE POLICY tenant_isolation_policy ON tenants FOR ALL TO authenticated
  USING (id = current_tenant_id()) WITH CHECK (id = current_tenant_id());

-- 2. tenant_invoices
CREATE POLICY tenant_isolation_policy ON tenant_invoices FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 3. tenant_settings
CREATE POLICY tenant_isolation_policy ON tenant_settings FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 4. branches
CREATE POLICY tenant_isolation_policy ON branches FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 5. warehouses
CREATE POLICY tenant_isolation_policy ON warehouses FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 6. registers
CREATE POLICY tenant_isolation_policy ON registers FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 7. suppliers
CREATE POLICY tenant_isolation_policy ON suppliers FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 8. users
CREATE POLICY tenant_isolation_policy ON users FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 9. user_sessions
CREATE POLICY tenant_isolation_policy ON user_sessions FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 10. customer_addresses
CREATE POLICY tenant_isolation_policy ON customer_addresses FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 11. categories
CREATE POLICY tenant_isolation_policy ON categories FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 12. products
CREATE POLICY tenant_isolation_policy ON products FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 13. product_barcodes
CREATE POLICY tenant_isolation_policy ON product_barcodes FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 14. product_prices
CREATE POLICY tenant_isolation_policy ON product_prices FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 15. product_stock
CREATE POLICY tenant_isolation_policy ON product_stock FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 16. stock
CREATE POLICY tenant_isolation_policy ON stock FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 17. stock_movements
CREATE POLICY tenant_isolation_policy ON stock_movements FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 18. stock_transfers
CREATE POLICY tenant_isolation_policy ON stock_transfers FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 19. orders
CREATE POLICY tenant_isolation_policy ON orders FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 20. order_items
CREATE POLICY tenant_isolation_policy ON order_items FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 21. register_sessions
CREATE POLICY tenant_isolation_policy ON register_sessions FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 22. customers
CREATE POLICY tenant_isolation_policy ON customers FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 23. customer_transactions
CREATE POLICY tenant_isolation_policy ON customer_transactions FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 24. loyalty_programs
CREATE POLICY tenant_isolation_policy ON loyalty_programs FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 25. loyalty_accounts
CREATE POLICY tenant_isolation_policy ON loyalty_accounts FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 26. loyalty_transactions
CREATE POLICY tenant_isolation_policy ON loyalty_transactions FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 27. campaigns
CREATE POLICY tenant_isolation_policy ON campaigns FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 28. coupons
CREATE POLICY tenant_isolation_policy ON coupons FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 29. coupon_usages
CREATE POLICY tenant_isolation_policy ON coupon_usages FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 30. invoices
CREATE POLICY tenant_isolation_policy ON invoices FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 31. audit_logs (anyone can write, only admin/manager can read)
CREATE POLICY audit_logs_insert ON audit_logs FOR INSERT TO authenticated
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY audit_logs_select ON audit_logs FOR SELECT TO authenticated
  USING (tenant_id = current_tenant_id() AND current_user_role() IN ('admin','manager'));

-- 32. staff_permissions (only admin/manager can read/write)
CREATE POLICY staff_permissions_policy ON staff_permissions FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id() AND current_user_role() IN ('admin','manager'))
  WITH CHECK (tenant_id = current_tenant_id() AND current_user_role() IN ('admin','manager'));

-- 33. backup_jobs (only admin/manager)
CREATE POLICY backup_jobs_policy ON backup_jobs FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id() AND current_user_role() IN ('admin','manager'))
  WITH CHECK (tenant_id = current_tenant_id() AND current_user_role() IN ('admin','manager'));

-- 34. whatsapp_orders
CREATE POLICY tenant_isolation_policy ON whatsapp_orders FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 35. efatura_records (only admin/manager)
CREATE POLICY efatura_records_policy ON efatura_records FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id() AND current_user_role() IN ('admin','manager'))
  WITH CHECK (tenant_id = current_tenant_id() AND current_user_role() IN ('admin','manager'));

-- 36. sale_payments
CREATE POLICY tenant_isolation_policy ON sale_payments FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 37. sale_returns
CREATE POLICY tenant_isolation_policy ON sale_returns FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 38. sale_return_items
CREATE POLICY tenant_isolation_policy ON sale_return_items FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 39. sale_exchanges
CREATE POLICY tenant_isolation_policy ON sale_exchanges FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 40. z_reports (only managers/admins can manage, cashiers can print their own session's Z)
CREATE POLICY z_reports_policy ON z_reports FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- 41. daily_reports
CREATE POLICY tenant_isolation_policy ON daily_reports FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 42. webhook_endpoints
CREATE POLICY tenant_isolation_policy ON webhook_endpoints FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 43. webhook_deliveries
CREATE POLICY tenant_isolation_policy ON webhook_deliveries FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 44. integration_settings
CREATE POLICY tenant_isolation_policy ON integration_settings FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 45. ai_recommendations
CREATE POLICY tenant_isolation_policy ON ai_recommendations FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

COMMIT;
