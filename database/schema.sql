-- ==============================================================================
-- AYDIN GROS OS - MASTER SCHEMA (PostgreSQL)
-- v2.0 (Phase Beta Consolidated Schema)
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- Ortak Fonksiyonlar & Triggers
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- ==============================================================================
-- MODÜL 1: PLATFORM & MULTI-TENANT & SETTINGS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS subscription_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL,
    price NUMERIC(10,2) NOT NULL,
    features JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID REFERENCES subscription_plans(id) ON DELETE RESTRICT,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(50) UNIQUE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS tenant_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    amount NUMERIC(10,2) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    billing_period_start TIMESTAMPTZ,
    billing_period_end TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS tenant_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    key VARCHAR(100) NOT NULL,
    value TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    UNIQUE(tenant_id, key)
);

-- ==============================================================================
-- MODÜL 2: ORGANİZASYON & ŞUBE & DEPO
-- ==============================================================================

CREATE TABLE IF NOT EXISTS branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    address TEXT,
    phone VARCHAR(20),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS warehouses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    address TEXT,
    phone VARCHAR(20),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS registers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    type VARCHAR(20) DEFAULT 'pos',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    contact_name VARCHAR(100),
    phone VARCHAR(20),
    email VARCHAR(100),
    address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- ==============================================================================
-- MODÜL 3: KULLANICILAR & KİMLİK DOĞRULAMA
-- ==============================================================================

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    role VARCHAR(30) NOT NULL,
    phone VARCHAR(20),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS customer_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(50) NOT NULL,
    address TEXT NOT NULL,
    latitude NUMERIC(10,6),
    longitude NUMERIC(10,6),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- ==============================================================================
-- MODÜL 4: ÜRÜN KATALOĞU & FİYATLANDIRMA
-- ==============================================================================

CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    name VARCHAR(100) NOT NULL,
    emoji VARCHAR(10),
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    name VARCHAR(200) NOT NULL,
    unit VARCHAR(50) NOT NULL,
    sku VARCHAR(50),
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    is_featured BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS product_barcodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_legacy_id INTEGER,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    barcode VARCHAR(50) NOT NULL,
    barcode_type VARCHAR(20) NOT NULL DEFAULT 'EAN13'
      CONSTRAINT chk_bc_type CHECK (barcode_type IN ('EAN13','CODE128','QR','CODE39','UPC')),
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    UNIQUE(tenant_id, barcode)
);

CREATE TABLE IF NOT EXISTS product_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
    price NUMERIC(10,2) NOT NULL,
    old_price NUMERIC(10,2),
    valid_from TIMESTAMPTZ,
    valid_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS product_price_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
    old_price NUMERIC(10,2) NOT NULL,
    new_price NUMERIC(10,2) NOT NULL,
    changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS product_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- ==============================================================================
-- MODÜL 5: STOK & ENVANTER
-- ==============================================================================

CREATE TABLE IF NOT EXISTS product_stock (
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    product_legacy_id INTEGER NOT NULL,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    qty NUMERIC(10,3) NOT NULL DEFAULT 0,
    min_qty NUMERIC(10,3) DEFAULT 5,
    max_qty NUMERIC(10,3),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (tenant_id, branch_id, product_legacy_id)
);

CREATE TABLE IF NOT EXISTS stock (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
    warehouse_id UUID REFERENCES warehouses(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity NUMERIC(10,3) NOT NULL DEFAULT 0,
    reserved_quantity NUMERIC(10,3) NOT NULL DEFAULT 0,
    min_threshold NUMERIC(10,3) DEFAULT 5,
    max_threshold NUMERIC(10,3),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CHECK (branch_id IS NOT NULL OR warehouse_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES branches(id) ON DELETE RESTRICT,
    warehouse_id UUID REFERENCES warehouses(id) ON DELETE RESTRICT,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    type VARCHAR(30) NOT NULL,
    quantity_change NUMERIC(10,3) NOT NULL,
    quantity_before NUMERIC(10,3) NOT NULL,
    quantity_after NUMERIC(10,3) NOT NULL,
    reference_type VARCHAR(30),
    reference_id UUID,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS stock_counts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
    warehouse_id UUID REFERENCES warehouses(id) ON DELETE CASCADE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS stock_count_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    stock_count_id UUID NOT NULL REFERENCES stock_counts(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    expected_quantity NUMERIC(10,3) NOT NULL,
    counted_quantity NUMERIC(10,3),
    variance NUMERIC(10,3),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS stock_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    from_branch_id UUID REFERENCES branches(id) ON DELETE RESTRICT,
    to_branch_id UUID REFERENCES branches(id) ON DELETE RESTRICT,
    from_warehouse_id UUID REFERENCES warehouses(id) ON DELETE RESTRICT,
    to_warehouse_id UUID REFERENCES warehouses(id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
      CONSTRAINT chk_st_status CHECK (status IN ('pending','completed','cancelled')),
    items JSONB NOT NULL DEFAULT '[]', -- [{ legacy_id, name, qty }]
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS stock_transfer_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    transfer_id UUID NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity NUMERIC(10,3) NOT NULL,
    received_quantity NUMERIC(10,3),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- ==============================================================================
-- MODÜL 6: SİPARİŞLER & SATIŞ
-- ==============================================================================

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    register_id UUID REFERENCES registers(id) ON DELETE SET NULL,
    customer_id UUID REFERENCES users(id) ON DELETE SET NULL,
    order_number VARCHAR(50) UNIQUE NOT NULL,
    channel VARCHAR(20) NOT NULL DEFAULT 'web',
    status VARCHAR(30) NOT NULL DEFAULT 'pending',
    payment_method VARCHAR(20),
    payment_status VARCHAR(20) DEFAULT 'pending',
    subtotal NUMERIC(10,2) NOT NULL,
    discount_amount NUMERIC(10,2) DEFAULT 0,
    tax_amount NUMERIC(10,2) DEFAULT 0,
    delivery_fee NUMERIC(10,2) DEFAULT 0,
    customer_name VARCHAR(100),
    customer_phone VARCHAR(20),
    items_data JSONB,
    total NUMERIC(10,2) NOT NULL,
    delivery_address TEXT,
    is_cancelled BOOLEAN NOT NULL DEFAULT FALSE,
    cancel_reason TEXT,
    cancelled_at TIMESTAMPTZ,
    cancelled_by TEXT,
    session_id UUID,
    mixed_payment BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity NUMERIC(10,3) NOT NULL,
    unit_price NUMERIC(10,2) NOT NULL,
    discount NUMERIC(10,2) DEFAULT 0,
    total NUMERIC(10,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS order_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    status VARCHAR(30) NOT NULL,
    changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- ==============================================================================
-- MODÜL 7: KASA & NAKİT AKIŞI
-- ==============================================================================

CREATE TABLE IF NOT EXISTS register_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    opened_by UUID REFERENCES users(id) ON DELETE SET NULL,
    opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    opening_cash DECIMAL(12,2) NOT NULL DEFAULT 0,
    expected_cash DECIMAL(12,2) NOT NULL DEFAULT 0,
    actual_cash DECIMAL(12,2) NOT NULL DEFAULT 0,
    closing_cash DECIMAL(12,2),
    closing_card DECIMAL(12,2) NOT NULL DEFAULT 0,
    closing_other DECIMAL(12,2) NOT NULL DEFAULT 0,
    cash_difference DECIMAL(12,2),
    total_sales DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_returns DECIMAL(12,2) NOT NULL DEFAULT 0,
    transaction_count INTEGER NOT NULL DEFAULT 0,
    z_report_id UUID,
    status VARCHAR(20) NOT NULL DEFAULT 'open'
      CONSTRAINT chk_rs_status CHECK (status IN ('open','closed')),
    notes TEXT
);

CREATE TABLE IF NOT EXISTS cash_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    register_id UUID NOT NULL REFERENCES registers(id) ON DELETE RESTRICT,
    cashier_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'open',
    opening_amount NUMERIC(10,2) NOT NULL,
    closing_amount NUMERIC(10,2),
    expected_amount NUMERIC(10,2),
    difference NUMERIC(10,2),
    opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS cash_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES cash_sessions(id) ON DELETE CASCADE,
    register_id UUID NOT NULL REFERENCES registers(id) ON DELETE RESTRICT,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    cashier_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    type VARCHAR(20) NOT NULL,
    method VARCHAR(20) NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- ==============================================================================
-- MODÜL 8: PAZARLAMA & SADAKAT & CARİ
-- ==============================================================================

CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    address TEXT,
    tax_no VARCHAR(20),
    notes TEXT,
    balance DECIMAL(12,2) NOT NULL DEFAULT 0, -- positive = customer owes us
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT chk_customers_name CHECK (LENGTH(TRIM(full_name)) > 0)
);

CREATE TABLE IF NOT EXISTS customer_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    amount DECIMAL(12,2) NOT NULL, -- positive = debt, negative = payment
    type VARCHAR(50) NOT NULL
      CONSTRAINT chk_ct_type CHECK (type IN ('purchase','payment','initial_balance','adjustment')),
    reference_id UUID,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS loyalty_programs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL DEFAULT 'Sadakat Programı',
    points_per_lira DECIMAL(8,4) NOT NULL DEFAULT 1.0,
    lira_per_point DECIMAL(8,4) NOT NULL DEFAULT 0.01,
    min_redeem_points INTEGER NOT NULL DEFAULT 100,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id)
);

CREATE TABLE IF NOT EXISTS loyalty_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    current_points INTEGER NOT NULL DEFAULT 0,
    total_earned_points INTEGER NOT NULL DEFAULT 0,
    total_redeemed_points INTEGER NOT NULL DEFAULT 0,
    tier VARCHAR(20) NOT NULL DEFAULT 'bronze'
      CONSTRAINT chk_tier CHECK (tier IN ('bronze','silver','gold','platinum')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, customer_id)
);

CREATE TABLE IF NOT EXISTS loyalty_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES loyalty_accounts(id) ON DELETE CASCADE,
    order_id TEXT,
    type VARCHAR(20) NOT NULL
      CONSTRAINT chk_lt_type CHECK (type IN ('earn','redeem','expire','adjust','bonus')),
    points INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    type VARCHAR(30) NOT NULL
      CONSTRAINT chk_camp_type CHECK (type IN (
        'percentage_discount','fixed_discount','buy_x_get_y',
        'free_shipping','bundle','loyalty_multiplier'
      )),
    discount_value NUMERIC(10,2) NOT NULL DEFAULT 0,
    min_order_amount NUMERIC(10,2),
    max_uses INTEGER,
    used_count INTEGER NOT NULL DEFAULT 0,
    applies_to VARCHAR(20) NOT NULL DEFAULT 'all'
      CONSTRAINT chk_applies CHECK (applies_to IN ('all','category','product','customer')),
    applies_ids JSONB NOT NULL DEFAULT '[]',
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    priority INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    code VARCHAR(50) NOT NULL,
    type VARCHAR(30) NOT NULL
      CONSTRAINT chk_coupon_type CHECK (type IN ('percentage','fixed','free_item','loyalty_points')),
    discount_value NUMERIC(10,2) NOT NULL,
    min_order_amount NUMERIC(10,2),
    max_uses INTEGER NOT NULL DEFAULT 1,
    used_count INTEGER NOT NULL DEFAULT 0,
    is_single_use BOOLEAN NOT NULL DEFAULT TRUE,
    valid_from TIMESTAMPTZ,
    valid_until TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    UNIQUE(tenant_id, code)
);

CREATE TABLE IF NOT EXISTS coupon_usages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    coupon_id UUID NOT NULL REFERENCES coupons(id) ON DELETE RESTRICT,
    order_id TEXT NOT NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    discount_applied NUMERIC(10,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- MODÜL 9: SATIN ALMA & TEDARİK
-- ==============================================================================

CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    invoice_number VARCHAR(50) NOT NULL,
    invoice_date DATE NOT NULL,
    total_amount NUMERIC(10,2) NOT NULL,
    status VARCHAR(20) DEFAULT 'received',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS invoice_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity NUMERIC(10,3) NOT NULL,
    unit_price NUMERIC(10,2) NOT NULL,
    total_price NUMERIC(10,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- ==============================================================================
-- MODÜL 10: DENETİM & BİLDİRİM & PERSONEL
-- ==============================================================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    user_id UUID,
    user_email VARCHAR(255),
    action VARCHAR(100) NOT NULL,
    entity VARCHAR(100),
    entity_id TEXT,
    old_value JSONB,
    new_value JSONB,
    ip_address INET,
    user_agent TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(30) NOT NULL,
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email_enabled BOOLEAN DEFAULT true,
    sms_enabled BOOLEAN DEFAULT false,
    push_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    UNIQUE(tenant_id, user_id)
);

CREATE TABLE IF NOT EXISTS staff_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID,
    user_email VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'cashier'
      CONSTRAINT chk_staff_role CHECK (role IN ('admin','manager','cashier','stock','viewer')),
    permissions JSONB NOT NULL DEFAULT '[]',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    granted_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, user_email)
);

CREATE TABLE IF NOT EXISTS backup_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
      CONSTRAINT chk_backup_status CHECK (status IN ('pending','running','success','failed')),
    type VARCHAR(30) NOT NULL DEFAULT 'full'
      CONSTRAINT chk_backup_type CHECK (type IN ('full','incremental','schema')),
    file_url TEXT,
    file_size BIGINT,
    table_count INTEGER,
    row_count BIGINT,
    error TEXT,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- MODÜL 11: RAPORLAMA & ENTEGRASYON & İADELER
-- ==============================================================================

CREATE TABLE IF NOT EXISTS daily_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    report_date DATE NOT NULL,
    total_sales NUMERIC(10,2) DEFAULT 0,
    total_orders INTEGER DEFAULT 0,
    total_cash NUMERIC(10,2) DEFAULT 0,
    total_card NUMERIC(10,2) DEFAULT 0,
    metrics JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    UNIQUE(tenant_id, branch_id, report_date)
);

CREATE TABLE IF NOT EXISTS webhook_endpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    events JSONB NOT NULL,
    secret_key VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    endpoint_id UUID NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(20) NOT NULL,
    response_code INTEGER,
    response_body TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS integration_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,
    api_key VARCHAR(255),
    api_secret VARCHAR(255),
    settings JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    UNIQUE(tenant_id, provider)
);

CREATE TABLE IF NOT EXISTS whatsapp_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    phone VARCHAR(50) NOT NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    raw_message TEXT NOT NULL,
    parsed_items JSONB NOT NULL DEFAULT '[]',
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
      CONSTRAINT chk_wa_status CHECK (status IN ('pending','processing','confirmed','rejected','fulfilled')),
    order_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS efatura_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    order_id TEXT,
    fatura_no VARCHAR(50),
    fatura_tipi VARCHAR(20) NOT NULL DEFAULT 'EARCHIVE'
      CONSTRAINT chk_fatura_type CHECK (fatura_tipi IN ('EINVOICE','EARCHIVE')),
    status VARCHAR(20) NOT NULL DEFAULT 'draft'
      CONSTRAINT chk_ef_status CHECK (status IN ('draft','pending','sent','accepted','rejected','cancelled')),
    provider VARCHAR(50) NOT NULL DEFAULT 'entegra',
    payload JSONB NOT NULL DEFAULT '{}',
    response_data JSONB,
    ettn TEXT,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sale_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    order_id TEXT NOT NULL,
    session_id UUID,
    payment_method VARCHAR(30) NOT NULL
      CONSTRAINT chk_sp_method CHECK (
        payment_method IN ('cash','card','loyalty_points','coupon','bank_transfer','other')
      ),
    amount DECIMAL(12,2) NOT NULL CONSTRAINT chk_sp_amount CHECK (amount > 0),
    reference TEXT,
    cashier_email TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sale_returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    original_order_id TEXT NOT NULL,
    session_id UUID,
    return_no VARCHAR(30) NOT NULL,
    return_reason TEXT,
    refund_method VARCHAR(20) NOT NULL DEFAULT 'cash'
      CONSTRAINT chk_refund_method CHECK (
        refund_method IN ('cash','card','store_credit','loyalty_points')
      ),
    total_refund DECIMAL(12,2) NOT NULL CONSTRAINT chk_total_refund CHECK (total_refund >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'completed'
      CONSTRAINT chk_return_status CHECK (
        status IN ('pending','completed','rejected','partial')
      ),
    processed_by TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sale_return_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    return_id UUID NOT NULL REFERENCES sale_returns(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_legacy_id INTEGER,
    product_name VARCHAR(255) NOT NULL,
    qty INTEGER NOT NULL CONSTRAINT chk_sri_qty CHECK (qty > 0),
    unit_price DECIMAL(12,2) NOT NULL,
    subtotal DECIMAL(12,2) NOT NULL,
    restock BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS sale_exchanges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    original_order_id TEXT NOT NULL,
    session_id UUID,
    exchange_no VARCHAR(30) NOT NULL,
    return_items JSONB NOT NULL DEFAULT '[]',
    new_items JSONB NOT NULL DEFAULT '[]',
    return_total DECIMAL(12,2) NOT NULL DEFAULT 0,
    new_total DECIMAL(12,2) NOT NULL DEFAULT 0,
    difference DECIMAL(12,2) NOT NULL DEFAULT 0,
    payment_method VARCHAR(20),
    status VARCHAR(20) NOT NULL DEFAULT 'completed'
      CONSTRAINT chk_exchange_status CHECK (
        status IN ('pending','completed','cancelled')
      ),
    processed_by TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS z_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    report_no VARCHAR(20) NOT NULL,
    register_session_id UUID,
    register_name VARCHAR(100),
    cashier_email TEXT,
    shift_start TIMESTAMPTZ NOT NULL,
    shift_end TIMESTAMPTZ NOT NULL,
    total_sales_count INTEGER NOT NULL DEFAULT 0,
    total_sales_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_returns_count INTEGER NOT NULL DEFAULT 0,
    total_returns_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_exchanges_count INTEGER NOT NULL DEFAULT 0,
    net_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    cash_total DECIMAL(12,2) NOT NULL DEFAULT 0,
    card_total DECIMAL(12,2) NOT NULL DEFAULT 0,
    loyalty_total DECIMAL(12,2) NOT NULL DEFAULT 0,
    other_total DECIMAL(12,2) NOT NULL DEFAULT 0,
    opening_balance DECIMAL(12,2) NOT NULL DEFAULT 0,
    closing_cash DECIMAL(12,2) NOT NULL DEFAULT 0,
    expected_cash DECIMAL(12,2) NOT NULL DEFAULT 0,
    cash_difference DECIMAL(12,2) NOT NULL DEFAULT 0,
    tax_breakdown JSONB NOT NULL DEFAULT '{}',
    top_products JSONB NOT NULL DEFAULT '[]',
    notes TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'closed'
      CONSTRAINT chk_zr_status CHECK (status IN ('draft','closed','printed')),
    printed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sequences
CREATE SEQUENCE IF NOT EXISTS sale_return_seq START 1;
CREATE SEQUENCE IF NOT EXISTS sale_exchange_seq START 1;
CREATE SEQUENCE IF NOT EXISTS z_report_seq START 1;

-- ==============================================================================
-- MODÜL 13: HERMES AI SERVICE LAYER
-- ==============================================================================

CREATE TABLE IF NOT EXISTS ai_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    priority VARCHAR(20) DEFAULT 'medium',
    message TEXT NOT NULL,
    data JSONB DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'pending',
    acted_by UUID REFERENCES users(id) ON DELETE SET NULL,
    acted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS ai_anomalies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID,
    severity VARCHAR(20) NOT NULL,
    description TEXT NOT NULL,
    metrics JSONB DEFAULT '{}',
    is_resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- ==============================================================================
-- INDEX PLAN & PERFORMANCE TUNING (Sprint 1-7 Combined)
-- ==============================================================================

-- Core Lookup Indexes
CREATE INDEX IF NOT EXISTS idx_products_tenant_category ON products(tenant_id, category_id);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON product_barcodes(tenant_id, barcode);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Foreign Key Indexes
CREATE INDEX IF NOT EXISTS idx_fk_tenant_invoices_tenant ON tenant_invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_fk_branches_tenant ON branches(tenant_id);
CREATE INDEX IF NOT EXISTS idx_fk_warehouses_tenant ON warehouses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_fk_registers_tenant_branch ON registers(tenant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_fk_suppliers_tenant ON suppliers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_fk_users_tenant_branch ON users(tenant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_fk_user_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_fk_customer_addresses_user ON customer_addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_fk_categories_parent ON categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_fk_product_prices_product_branch ON product_prices(product_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_fk_product_price_history_product ON product_price_history(product_id);
CREATE INDEX IF NOT EXISTS idx_fk_product_images_product ON product_images(product_id);
CREATE INDEX IF NOT EXISTS idx_fk_stock_product ON stock(product_id);
CREATE INDEX IF NOT EXISTS idx_fk_stock_movements_product ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_fk_stock_counts_branch ON stock_counts(branch_id);
CREATE INDEX IF NOT EXISTS idx_fk_stock_count_items_count ON stock_count_items(stock_count_id);
CREATE INDEX IF NOT EXISTS idx_fk_stock_transfers_from_to ON stock_transfers(from_branch_id, to_branch_id);
CREATE INDEX IF NOT EXISTS idx_fk_stock_transfer_items_transfer ON stock_transfer_items(transfer_id);
CREATE INDEX IF NOT EXISTS idx_fk_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_fk_order_items_order_product ON order_items(order_id, product_id);
CREATE INDEX IF NOT EXISTS idx_fk_order_status_history_order ON order_status_history(order_id);
CREATE INDEX IF NOT EXISTS idx_fk_cash_sessions_register ON cash_sessions(register_id);
CREATE INDEX IF NOT EXISTS idx_fk_cash_transactions_session ON cash_transactions(session_id);
CREATE INDEX IF NOT EXISTS idx_fk_campaign_targets_campaign ON campaign_targets(campaign_id);
CREATE INDEX IF NOT EXISTS idx_fk_coupon_usages_coupon_order ON coupon_usages(coupon_id, order_id);
CREATE INDEX IF NOT EXISTS idx_fk_loyalty_accounts_user ON loyalty_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_fk_loyalty_transactions_account ON loyalty_transactions(loyalty_account_id);
CREATE INDEX IF NOT EXISTS idx_fk_invoices_supplier ON invoices(supplier_id);
CREATE INDEX IF NOT EXISTS idx_fk_invoice_items_invoice_product ON invoice_items(invoice_id, product_id);
CREATE INDEX IF NOT EXISTS idx_fk_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_fk_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_fk_webhook_deliveries_endpoint ON webhook_deliveries(endpoint_id);
CREATE INDEX IF NOT EXISTS idx_fk_ai_recommendations_product ON ai_recommendations(product_id);

-- JSONB Indexes (GIN)
CREATE INDEX IF NOT EXISTS idx_gin_tenants_settings ON tenants USING gin(settings);
CREATE INDEX IF NOT EXISTS idx_gin_subscription_plans_features ON subscription_plans USING gin(features);
CREATE INDEX IF NOT EXISTS idx_gin_audit_logs_metadata ON audit_logs USING gin(metadata);
CREATE INDEX IF NOT EXISTS idx_gin_daily_reports_metrics ON daily_reports USING gin(metrics);
CREATE INDEX IF NOT EXISTS idx_gin_webhook_endpoints_events ON webhook_endpoints USING gin(events);
CREATE INDEX IF NOT EXISTS idx_gin_webhook_deliveries_payload ON webhook_deliveries USING gin(payload);
CREATE INDEX IF NOT EXISTS idx_gin_integration_settings ON integration_settings USING gin(settings);
CREATE INDEX IF NOT EXISTS idx_gin_ai_recommendations_data ON ai_recommendations USING gin(data);
CREATE INDEX IF NOT EXISTS idx_gin_ai_anomalies_metrics ON ai_anomalies USING gin(metrics);

-- Special Lookups
CREATE INDEX IF NOT EXISTS idx_stock_tenant_branch ON stock(tenant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_lookup ON stock_movements(product_id, branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_status ON orders(tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer_lookup ON orders(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_date ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_daily_reports_lookup ON daily_reports(tenant_id, branch_id, report_date);

-- New Sprint 5/6/7 Specific Performance Indexes
CREATE INDEX IF NOT EXISTS idx_barcodes_barcode ON product_barcodes (barcode);
CREATE INDEX IF NOT EXISTS idx_barcodes_product ON product_barcodes (tenant_id, product_legacy_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_tx_account ON loyalty_transactions (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaigns_active ON campaigns (tenant_id, is_active, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_wa_orders_tenant ON whatsapp_orders (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_efatura_tenant ON efatura_records (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sale_payments_order ON sale_payments (tenant_id, order_id);
CREATE INDEX IF NOT EXISTS idx_sale_payments_session ON sale_payments (session_id) WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sale_payments_date ON sale_payments (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sale_returns_order ON sale_returns (tenant_id, original_order_id);
CREATE INDEX IF NOT EXISTS idx_sale_returns_no ON sale_returns (tenant_id, return_no);
CREATE INDEX IF NOT EXISTS idx_sale_returns_date ON sale_returns (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sale_return_items_return ON sale_return_items (return_id);
CREATE INDEX IF NOT EXISTS idx_sale_return_items_tenant ON sale_return_items (tenant_id);
CREATE INDEX IF NOT EXISTS idx_sale_exchanges_order ON sale_exchanges (tenant_id, original_order_id);
CREATE INDEX IF NOT EXISTS idx_sale_exchanges_date ON sale_exchanges (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_z_reports_tenant_date ON z_reports (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_z_report_no ON z_reports (tenant_id, report_no);
CREATE INDEX IF NOT EXISTS idx_z_reports_session ON z_reports (register_session_id) WHERE register_session_id IS NOT NULL;

-- Triggers for updated_at
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_stock_updated_at BEFORE UPDATE ON stock FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

COMMIT;
