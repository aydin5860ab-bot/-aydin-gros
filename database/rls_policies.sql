-- ==============================================================================
-- AYDIN GROS OS - SUPABASE RLS POLICIES
-- v2.0 (Supabase JWT Uyumlu)
-- ==============================================================================

-- ==============================================================================
-- SUPABASE HELPER FUNCTIONS
-- ==============================================================================

CREATE OR REPLACE FUNCTION current_user_id() RETURNS UUID AS $$
  SELECT auth.uid();
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS UUID AS $$
  SELECT (auth.jwt()->>'tenant_id')::UUID;
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION current_user_role() RETURNS VARCHAR AS $$
  SELECT auth.jwt()->>'role';
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION current_branch_id() RETURNS UUID AS $$
  SELECT (auth.jwt()->>'branch_id')::UUID;
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION current_register_id() RETURNS UUID AS $$
  SELECT (auth.jwt()->>'register_id')::UUID;
$$ LANGUAGE SQL STABLE;

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenants_select ON tenants FOR SELECT USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager', 'cashier', 'warehouse_person')
        ));
CREATE POLICY tenants_insert ON tenants FOR INSERT WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY tenants_update ON tenants FOR UPDATE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager', 'cashier', 'warehouse_person')
        )) WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY tenants_delete ON tenants FOR DELETE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));

ALTER TABLE tenant_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_invoices_select ON tenant_invoices FOR SELECT USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager', 'cashier', 'warehouse_person')
        ));
CREATE POLICY tenant_invoices_insert ON tenant_invoices FOR INSERT WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY tenant_invoices_update ON tenant_invoices FOR UPDATE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager', 'cashier', 'warehouse_person')
        )) WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY tenant_invoices_delete ON tenant_invoices FOR DELETE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));

ALTER TABLE branches ENABLE ROW LEVEL SECURITY;

CREATE POLICY branches_select ON branches FOR SELECT USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager', 'cashier', 'warehouse_person')
        ));
CREATE POLICY branches_insert ON branches FOR INSERT WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY branches_update ON branches FOR UPDATE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager', 'cashier', 'warehouse_person')
        )) WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY branches_delete ON branches FOR DELETE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));

ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;

CREATE POLICY warehouses_select ON warehouses FOR SELECT USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'warehouse_person')
            OR (current_user_role() IN ('branch_manager', 'cashier')) -- read access
        ));
CREATE POLICY warehouses_insert ON warehouses FOR INSERT WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'warehouse_person')
            OR (current_user_role() = 'branch_manager' AND branch_id = current_branch_id())
        ));
CREATE POLICY warehouses_update ON warehouses FOR UPDATE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'warehouse_person')
            OR (current_user_role() IN ('branch_manager', 'cashier')) -- read access
        )) WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'warehouse_person')
            OR (current_user_role() = 'branch_manager' AND branch_id = current_branch_id())
        ));
CREATE POLICY warehouses_delete ON warehouses FOR DELETE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'warehouse_person')
            OR (current_user_role() = 'branch_manager' AND branch_id = current_branch_id())
        ));

ALTER TABLE registers ENABLE ROW LEVEL SECURITY;

CREATE POLICY registers_select ON registers FOR SELECT USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager', 'cashier', 'warehouse_person')
        ));
CREATE POLICY registers_insert ON registers FOR INSERT WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY registers_update ON registers FOR UPDATE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager', 'cashier', 'warehouse_person')
        )) WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY registers_delete ON registers FOR DELETE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY suppliers_select ON suppliers FOR SELECT USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager', 'cashier', 'warehouse_person')
        ));
CREATE POLICY suppliers_insert ON suppliers FOR INSERT WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY suppliers_update ON suppliers FOR UPDATE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager', 'cashier', 'warehouse_person')
        )) WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY suppliers_delete ON suppliers FOR DELETE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_select ON users FOR SELECT USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager') 
            OR (current_user_role() = 'customer' AND id = current_user_id())));
CREATE POLICY users_insert ON users FOR INSERT WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() = 'admin' 
            OR (current_user_role() = 'manager' AND role NOT IN ('admin', 'super_admin'))
        ));
CREATE POLICY users_update ON users FOR UPDATE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager') 
            OR (current_user_role() = 'customer' AND id = current_user_id()))) WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() = 'admin' 
            OR (current_user_role() = 'manager' AND role NOT IN ('admin', 'super_admin'))
        ));
CREATE POLICY users_delete ON users FOR DELETE USING (tenant_id = current_tenant_id() AND (
            current_user_role() = 'admin' 
            OR (current_user_role() = 'manager' AND role NOT IN ('admin', 'super_admin'))
        ));

ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_sessions_select ON user_sessions FOR SELECT USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager') 
            OR (current_user_role() = 'customer' AND user_id = current_user_id())));
CREATE POLICY user_sessions_insert ON user_sessions FOR INSERT WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY user_sessions_update ON user_sessions FOR UPDATE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager') 
            OR (current_user_role() = 'customer' AND user_id = current_user_id()))) WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY user_sessions_delete ON user_sessions FOR DELETE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));

ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY customer_addresses_select ON customer_addresses FOR SELECT USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager') 
            OR (current_user_role() = 'customer' AND user_id = current_user_id())));
CREATE POLICY customer_addresses_insert ON customer_addresses FOR INSERT WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY customer_addresses_update ON customer_addresses FOR UPDATE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager') 
            OR (current_user_role() = 'customer' AND user_id = current_user_id()))) WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY customer_addresses_delete ON customer_addresses FOR DELETE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY categories_select ON categories FOR SELECT USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager', 'cashier', 'warehouse_person')
        ));
CREATE POLICY categories_insert ON categories FOR INSERT WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY categories_update ON categories FOR UPDATE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager', 'cashier', 'warehouse_person')
        )) WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY categories_delete ON categories FOR DELETE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY products_select ON products FOR SELECT USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager', 'cashier', 'warehouse_person')
        ));
CREATE POLICY products_insert ON products FOR INSERT WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY products_update ON products FOR UPDATE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager', 'cashier', 'warehouse_person')
        )) WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY products_delete ON products FOR DELETE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));

ALTER TABLE product_barcodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY product_barcodes_select ON product_barcodes FOR SELECT USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager', 'cashier', 'warehouse_person')
        ));
CREATE POLICY product_barcodes_insert ON product_barcodes FOR INSERT WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY product_barcodes_update ON product_barcodes FOR UPDATE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager', 'cashier', 'warehouse_person')
        )) WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY product_barcodes_delete ON product_barcodes FOR DELETE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));

ALTER TABLE product_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY product_prices_select ON product_prices FOR SELECT USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager', 'cashier', 'warehouse_person')
        ));
CREATE POLICY product_prices_insert ON product_prices FOR INSERT WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY product_prices_update ON product_prices FOR UPDATE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager', 'cashier', 'warehouse_person')
        )) WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY product_prices_delete ON product_prices FOR DELETE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));

ALTER TABLE product_price_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY product_price_history_select ON product_price_history FOR SELECT USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager', 'cashier', 'warehouse_person')
        ));
CREATE POLICY product_price_history_insert ON product_price_history FOR INSERT WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY product_price_history_update ON product_price_history FOR UPDATE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager', 'cashier', 'warehouse_person')
        )) WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY product_price_history_delete ON product_price_history FOR DELETE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));

ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY product_images_select ON product_images FOR SELECT USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager', 'cashier', 'warehouse_person')
        ));
CREATE POLICY product_images_insert ON product_images FOR INSERT WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY product_images_update ON product_images FOR UPDATE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager', 'cashier', 'warehouse_person')
        )) WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY product_images_delete ON product_images FOR DELETE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));

ALTER TABLE stock ENABLE ROW LEVEL SECURITY;

CREATE POLICY stock_select ON stock FOR SELECT USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'warehouse_person')
            OR (current_user_role() IN ('branch_manager', 'cashier')) -- read access
        ));
CREATE POLICY stock_insert ON stock FOR INSERT WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'warehouse_person')
            OR (current_user_role() = 'branch_manager' AND branch_id = current_branch_id())
        ));
CREATE POLICY stock_update ON stock FOR UPDATE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'warehouse_person')
            OR (current_user_role() IN ('branch_manager', 'cashier')) -- read access
        )) WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'warehouse_person')
            OR (current_user_role() = 'branch_manager' AND branch_id = current_branch_id())
        ));
CREATE POLICY stock_delete ON stock FOR DELETE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'warehouse_person')
            OR (current_user_role() = 'branch_manager' AND branch_id = current_branch_id())
        ));

ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY stock_movements_select ON stock_movements FOR SELECT USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'warehouse_person')
            OR (current_user_role() IN ('branch_manager', 'cashier')) -- read access
        ));
CREATE POLICY stock_movements_insert ON stock_movements FOR INSERT WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'warehouse_person')
            OR (current_user_role() = 'branch_manager' AND branch_id = current_branch_id())
        ));
CREATE POLICY stock_movements_update ON stock_movements FOR UPDATE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'warehouse_person')
            OR (current_user_role() IN ('branch_manager', 'cashier')) -- read access
        )) WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'warehouse_person')
            OR (current_user_role() = 'branch_manager' AND branch_id = current_branch_id())
        ));
CREATE POLICY stock_movements_delete ON stock_movements FOR DELETE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'warehouse_person')
            OR (current_user_role() = 'branch_manager' AND branch_id = current_branch_id())
        ));

ALTER TABLE stock_counts ENABLE ROW LEVEL SECURITY;

CREATE POLICY stock_counts_select ON stock_counts FOR SELECT USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'warehouse_person')
            OR (current_user_role() IN ('branch_manager', 'cashier')) -- read access
        ));
CREATE POLICY stock_counts_insert ON stock_counts FOR INSERT WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'warehouse_person')
            OR (current_user_role() = 'branch_manager' AND branch_id = current_branch_id())
        ));
CREATE POLICY stock_counts_update ON stock_counts FOR UPDATE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'warehouse_person')
            OR (current_user_role() IN ('branch_manager', 'cashier')) -- read access
        )) WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'warehouse_person')
            OR (current_user_role() = 'branch_manager' AND branch_id = current_branch_id())
        ));
CREATE POLICY stock_counts_delete ON stock_counts FOR DELETE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'warehouse_person')
            OR (current_user_role() = 'branch_manager' AND branch_id = current_branch_id())
        ));

ALTER TABLE stock_count_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY stock_count_items_select ON stock_count_items FOR SELECT USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'warehouse_person')
            OR (current_user_role() IN ('branch_manager', 'cashier')) -- read access
        ));
CREATE POLICY stock_count_items_insert ON stock_count_items FOR INSERT WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'warehouse_person')
            OR (current_user_role() = 'branch_manager' AND branch_id = current_branch_id())
        ));
CREATE POLICY stock_count_items_update ON stock_count_items FOR UPDATE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'warehouse_person')
            OR (current_user_role() IN ('branch_manager', 'cashier')) -- read access
        )) WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'warehouse_person')
            OR (current_user_role() = 'branch_manager' AND branch_id = current_branch_id())
        ));
CREATE POLICY stock_count_items_delete ON stock_count_items FOR DELETE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'warehouse_person')
            OR (current_user_role() = 'branch_manager' AND branch_id = current_branch_id())
        ));

ALTER TABLE stock_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY stock_transfers_select ON stock_transfers FOR SELECT USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'warehouse_person')
            OR (current_user_role() IN ('branch_manager', 'cashier')) -- read access
        ));
CREATE POLICY stock_transfers_insert ON stock_transfers FOR INSERT WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'warehouse_person')
            OR (current_user_role() = 'branch_manager' AND branch_id = current_branch_id())
        ));
CREATE POLICY stock_transfers_update ON stock_transfers FOR UPDATE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'warehouse_person')
            OR (current_user_role() IN ('branch_manager', 'cashier')) -- read access
        )) WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'warehouse_person')
            OR (current_user_role() = 'branch_manager' AND branch_id = current_branch_id())
        ));
CREATE POLICY stock_transfers_delete ON stock_transfers FOR DELETE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'warehouse_person')
            OR (current_user_role() = 'branch_manager' AND branch_id = current_branch_id())
        ));

ALTER TABLE stock_transfer_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY stock_transfer_items_select ON stock_transfer_items FOR SELECT USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'warehouse_person')
            OR (current_user_role() IN ('branch_manager', 'cashier')) -- read access
        ));
CREATE POLICY stock_transfer_items_insert ON stock_transfer_items FOR INSERT WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'warehouse_person')
            OR (current_user_role() = 'branch_manager' AND branch_id = current_branch_id())
        ));
CREATE POLICY stock_transfer_items_update ON stock_transfer_items FOR UPDATE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'warehouse_person')
            OR (current_user_role() IN ('branch_manager', 'cashier')) -- read access
        )) WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'warehouse_person')
            OR (current_user_role() = 'branch_manager' AND branch_id = current_branch_id())
        ));
CREATE POLICY stock_transfer_items_delete ON stock_transfer_items FOR DELETE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'warehouse_person')
            OR (current_user_role() = 'branch_manager' AND branch_id = current_branch_id())
        ));

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY orders_select ON orders FOR SELECT USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager') 
            OR (current_user_role() = 'customer' AND customer_id = current_user_id())
            OR (current_user_role() = 'branch_manager' AND branch_id = current_branch_id())
            OR (current_user_role() = 'cashier' AND branch_id = current_branch_id() AND register_id = current_register_id())));
CREATE POLICY orders_insert ON orders FOR INSERT WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager') 
            OR (current_user_role() = 'branch_manager' AND branch_id = current_branch_id())
            OR (current_user_role() = 'cashier' AND branch_id = current_branch_id() AND register_id = current_register_id())
        ));
CREATE POLICY orders_update ON orders FOR UPDATE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager') 
            OR (current_user_role() = 'customer' AND customer_id = current_user_id())
            OR (current_user_role() = 'branch_manager' AND branch_id = current_branch_id())
            OR (current_user_role() = 'cashier' AND branch_id = current_branch_id() AND register_id = current_register_id()))) WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager') 
            OR (current_user_role() = 'branch_manager' AND branch_id = current_branch_id())
            OR (current_user_role() = 'cashier' AND branch_id = current_branch_id() AND register_id = current_register_id())
        ));
CREATE POLICY orders_delete ON orders FOR DELETE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager') 
            OR (current_user_role() = 'branch_manager' AND branch_id = current_branch_id())
            OR (current_user_role() = 'cashier' AND branch_id = current_branch_id() AND register_id = current_register_id())
        ));

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY order_items_select ON order_items FOR SELECT USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager') 
            OR (current_user_role() = 'customer' AND user_id = current_user_id())
            OR (current_user_role() = 'branch_manager' AND branch_id = current_branch_id())
            OR (current_user_role() IN ('branch_manager', 'cashier'))));
CREATE POLICY order_items_insert ON order_items FOR INSERT WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY order_items_update ON order_items FOR UPDATE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager') 
            OR (current_user_role() = 'customer' AND user_id = current_user_id())
            OR (current_user_role() = 'branch_manager' AND branch_id = current_branch_id())
            OR (current_user_role() IN ('branch_manager', 'cashier')))) WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY order_items_delete ON order_items FOR DELETE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));

ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY order_status_history_select ON order_status_history FOR SELECT USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager') 
            OR (current_user_role() = 'customer' AND user_id = current_user_id())
            OR (current_user_role() = 'branch_manager' AND branch_id = current_branch_id())
            OR (current_user_role() IN ('branch_manager', 'cashier'))));
CREATE POLICY order_status_history_insert ON order_status_history FOR INSERT WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY order_status_history_update ON order_status_history FOR UPDATE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager') 
            OR (current_user_role() = 'customer' AND user_id = current_user_id())
            OR (current_user_role() = 'branch_manager' AND branch_id = current_branch_id())
            OR (current_user_role() IN ('branch_manager', 'cashier')))) WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY order_status_history_delete ON order_status_history FOR DELETE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));

ALTER TABLE cash_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY cash_sessions_select ON cash_sessions FOR SELECT USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager') 
            OR (current_user_role() = 'branch_manager' AND branch_id = current_branch_id())
            OR (current_user_role() = 'cashier' AND branch_id = current_branch_id() AND register_id = current_register_id())
        ));
CREATE POLICY cash_sessions_insert ON cash_sessions FOR INSERT WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager') 
            OR (current_user_role() = 'branch_manager' AND branch_id = current_branch_id())
            OR (current_user_role() = 'cashier' AND branch_id = current_branch_id() AND register_id = current_register_id())
        ));
CREATE POLICY cash_sessions_update ON cash_sessions FOR UPDATE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager') 
            OR (current_user_role() = 'branch_manager' AND branch_id = current_branch_id())
            OR (current_user_role() = 'cashier' AND branch_id = current_branch_id() AND register_id = current_register_id())
        )) WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager') 
            OR (current_user_role() = 'branch_manager' AND branch_id = current_branch_id())
            OR (current_user_role() = 'cashier' AND branch_id = current_branch_id() AND register_id = current_register_id())
        ));
CREATE POLICY cash_sessions_delete ON cash_sessions FOR DELETE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager') 
            OR (current_user_role() = 'branch_manager' AND branch_id = current_branch_id())
            OR (current_user_role() = 'cashier' AND branch_id = current_branch_id() AND register_id = current_register_id())
        ));

ALTER TABLE cash_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY cash_transactions_select ON cash_transactions FOR SELECT USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager') 
            OR (current_user_role() = 'branch_manager' AND branch_id = current_branch_id())
            OR (current_user_role() = 'cashier' AND branch_id = current_branch_id() AND register_id = current_register_id())
        ));
CREATE POLICY cash_transactions_insert ON cash_transactions FOR INSERT WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager') 
            OR (current_user_role() = 'branch_manager' AND branch_id = current_branch_id())
            OR (current_user_role() = 'cashier' AND branch_id = current_branch_id() AND register_id = current_register_id())
        ));
CREATE POLICY cash_transactions_update ON cash_transactions FOR UPDATE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager') 
            OR (current_user_role() = 'branch_manager' AND branch_id = current_branch_id())
            OR (current_user_role() = 'cashier' AND branch_id = current_branch_id() AND register_id = current_register_id())
        )) WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager') 
            OR (current_user_role() = 'branch_manager' AND branch_id = current_branch_id())
            OR (current_user_role() = 'cashier' AND branch_id = current_branch_id() AND register_id = current_register_id())
        ));
CREATE POLICY cash_transactions_delete ON cash_transactions FOR DELETE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager') 
            OR (current_user_role() = 'branch_manager' AND branch_id = current_branch_id())
            OR (current_user_role() = 'cashier' AND branch_id = current_branch_id() AND register_id = current_register_id())
        ));

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY campaigns_select ON campaigns FOR SELECT USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager', 'cashier', 'warehouse_person')
        ));
CREATE POLICY campaigns_insert ON campaigns FOR INSERT WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY campaigns_update ON campaigns FOR UPDATE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager', 'cashier', 'warehouse_person')
        )) WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY campaigns_delete ON campaigns FOR DELETE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));

ALTER TABLE campaign_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY campaign_targets_select ON campaign_targets FOR SELECT USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager', 'cashier', 'warehouse_person')
        ));
CREATE POLICY campaign_targets_insert ON campaign_targets FOR INSERT WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY campaign_targets_update ON campaign_targets FOR UPDATE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager', 'cashier', 'warehouse_person')
        )) WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY campaign_targets_delete ON campaign_targets FOR DELETE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));

ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY coupons_select ON coupons FOR SELECT USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager', 'cashier', 'warehouse_person')
        ));
CREATE POLICY coupons_insert ON coupons FOR INSERT WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY coupons_update ON coupons FOR UPDATE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager', 'cashier', 'warehouse_person')
        )) WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY coupons_delete ON coupons FOR DELETE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));

ALTER TABLE coupon_usages ENABLE ROW LEVEL SECURITY;

CREATE POLICY coupon_usages_select ON coupon_usages FOR SELECT USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager', 'cashier', 'warehouse_person')
        ));
CREATE POLICY coupon_usages_insert ON coupon_usages FOR INSERT WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY coupon_usages_update ON coupon_usages FOR UPDATE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager', 'cashier', 'warehouse_person')
        )) WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY coupon_usages_delete ON coupon_usages FOR DELETE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));

ALTER TABLE loyalty_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY loyalty_accounts_select ON loyalty_accounts FOR SELECT USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager') 
            OR (current_user_role() = 'customer' AND user_id = current_user_id())));
CREATE POLICY loyalty_accounts_insert ON loyalty_accounts FOR INSERT WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY loyalty_accounts_update ON loyalty_accounts FOR UPDATE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager') 
            OR (current_user_role() = 'customer' AND user_id = current_user_id()))) WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY loyalty_accounts_delete ON loyalty_accounts FOR DELETE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));

ALTER TABLE loyalty_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY loyalty_transactions_select ON loyalty_transactions FOR SELECT USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager') 
            OR (current_user_role() = 'customer' AND user_id = current_user_id())));
CREATE POLICY loyalty_transactions_insert ON loyalty_transactions FOR INSERT WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY loyalty_transactions_update ON loyalty_transactions FOR UPDATE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager') 
            OR (current_user_role() = 'customer' AND user_id = current_user_id()))) WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY loyalty_transactions_delete ON loyalty_transactions FOR DELETE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY invoices_select ON invoices FOR SELECT USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager', 'cashier', 'warehouse_person')
        ));
CREATE POLICY invoices_insert ON invoices FOR INSERT WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY invoices_update ON invoices FOR UPDATE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager', 'cashier', 'warehouse_person')
        )) WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY invoices_delete ON invoices FOR DELETE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));

ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY invoice_items_select ON invoice_items FOR SELECT USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager', 'cashier', 'warehouse_person')
        ));
CREATE POLICY invoice_items_insert ON invoice_items FOR INSERT WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY invoice_items_update ON invoice_items FOR UPDATE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager', 'cashier', 'warehouse_person')
        )) WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY invoice_items_delete ON invoice_items FOR DELETE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_logs_select ON audit_logs FOR SELECT USING (tenant_id = current_tenant_id() AND current_user_role() IN ('admin', 'manager'));
CREATE POLICY audit_logs_insert ON audit_logs FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY notifications_select ON notifications FOR SELECT USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager') 
            OR (current_user_role() = 'customer' AND user_id = current_user_id())));
CREATE POLICY notifications_insert ON notifications FOR INSERT WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY notifications_update ON notifications FOR UPDATE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager') 
            OR (current_user_role() = 'customer' AND user_id = current_user_id()))) WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY notifications_delete ON notifications FOR DELETE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY notification_preferences_select ON notification_preferences FOR SELECT USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager') 
            OR (current_user_role() = 'customer' AND user_id = current_user_id())));
CREATE POLICY notification_preferences_insert ON notification_preferences FOR INSERT WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY notification_preferences_update ON notification_preferences FOR UPDATE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager') 
            OR (current_user_role() = 'customer' AND user_id = current_user_id()))) WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY notification_preferences_delete ON notification_preferences FOR DELETE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));

ALTER TABLE daily_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY daily_reports_select ON daily_reports FOR SELECT USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager', 'cashier', 'warehouse_person')
        ));
CREATE POLICY daily_reports_insert ON daily_reports FOR INSERT WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY daily_reports_update ON daily_reports FOR UPDATE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager', 'cashier', 'warehouse_person')
        )) WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY daily_reports_delete ON daily_reports FOR DELETE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));

ALTER TABLE webhook_endpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY webhook_endpoints_select ON webhook_endpoints FOR SELECT USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager', 'cashier', 'warehouse_person')
        ));
CREATE POLICY webhook_endpoints_insert ON webhook_endpoints FOR INSERT WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY webhook_endpoints_update ON webhook_endpoints FOR UPDATE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager', 'cashier', 'warehouse_person')
        )) WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY webhook_endpoints_delete ON webhook_endpoints FOR DELETE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));

ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY webhook_deliveries_select ON webhook_deliveries FOR SELECT USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager', 'cashier', 'warehouse_person')
        ));
CREATE POLICY webhook_deliveries_insert ON webhook_deliveries FOR INSERT WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY webhook_deliveries_update ON webhook_deliveries FOR UPDATE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager', 'cashier', 'warehouse_person')
        )) WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY webhook_deliveries_delete ON webhook_deliveries FOR DELETE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));

ALTER TABLE integration_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY integration_settings_select ON integration_settings FOR SELECT USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager', 'cashier', 'warehouse_person')
        ));
CREATE POLICY integration_settings_insert ON integration_settings FOR INSERT WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY integration_settings_update ON integration_settings FOR UPDATE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager', 'cashier', 'warehouse_person')
        )) WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY integration_settings_delete ON integration_settings FOR DELETE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));

ALTER TABLE ai_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_recommendations_select ON ai_recommendations FOR SELECT USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager', 'cashier', 'warehouse_person')
        ));
CREATE POLICY ai_recommendations_insert ON ai_recommendations FOR INSERT WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY ai_recommendations_update ON ai_recommendations FOR UPDATE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager', 'cashier', 'warehouse_person')
        )) WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY ai_recommendations_delete ON ai_recommendations FOR DELETE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));

ALTER TABLE ai_anomalies ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_anomalies_select ON ai_anomalies FOR SELECT USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager', 'cashier', 'warehouse_person')
        ));
CREATE POLICY ai_anomalies_insert ON ai_anomalies FOR INSERT WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY ai_anomalies_update ON ai_anomalies FOR UPDATE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager', 'cashier', 'warehouse_person')
        )) WITH CHECK (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));
CREATE POLICY ai_anomalies_delete ON ai_anomalies FOR DELETE USING (tenant_id = current_tenant_id() AND (
            current_user_role() IN ('admin', 'manager', 'branch_manager')
        ));

