-- ==============================================================================
-- AYDIN GROS OS - SPRINT 15 AI STORE AUTOPILOT SCHEMA UPDATES
-- ==============================================================================

-- 1. Create AI Tasks table
CREATE TABLE IF NOT EXISTS public.ai_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    priority VARCHAR(50) NOT NULL DEFAULT 'medium', -- low, medium, high, critical
    estimated_duration INTEGER NOT NULL DEFAULT 15, -- in minutes
    business_impact TEXT,
    responsible_role VARCHAR(100) NOT NULL DEFAULT 'staff', -- staff, cashier, stock_manager, manager
    due_time TIMESTAMPTZ,
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, in_progress, completed, cancelled
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create AI Daily Briefings table
CREATE TABLE IF NOT EXISTS public.ai_daily_briefings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    briefing_date DATE NOT NULL DEFAULT CURRENT_DATE,
    yesterday_revenue NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    yesterday_profit NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    top_products JSONB,
    worst_products JSONB,
    stock_risks TEXT,
    expected_revenue_today NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    weather_impact VARCHAR(255),
    special_days VARCHAR(255),
    recommended_actions TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_ai_daily_briefing UNIQUE (tenant_id, briefing_date)
);

-- 3. Create AI Risks table
CREATE TABLE IF NOT EXISTS public.ai_risks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
    risk_type VARCHAR(100) NOT NULL, -- cashier_anomaly, unusual_refund, negative_margin, high_wastage, cash_shortage, out_of_stock
    message TEXT NOT NULL,
    severity VARCHAR(50) NOT NULL DEFAULT 'medium', -- low, medium, high, critical
    probability NUMERIC(5,2) NOT NULL DEFAULT 0.00, -- percentage
    impact TEXT,
    recommended_action TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'open', -- open, reviewed, resolved
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create AI Cashier Performance table
CREATE TABLE IF NOT EXISTS public.ai_cashier_performance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    cashier_email VARCHAR(255) NOT NULL,
    avg_scan_time NUMERIC(6,2) DEFAULT 0.00, -- seconds per item
    items_per_minute NUMERIC(6,2) DEFAULT 0.00,
    void_rate NUMERIC(5,2) DEFAULT 0.00, -- percentage
    refund_rate NUMERIC(5,2) DEFAULT 0.00, -- percentage
    basket_avg NUMERIC(12,2) DEFAULT 0.00,
    rating VARCHAR(50) DEFAULT 'average', -- elite, good, average, training_needed
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_ai_cashier_perf UNIQUE (tenant_id, cashier_email)
);

-- 5. Grant permissions
GRANT ALL ON TABLE public.ai_tasks TO service_role;
GRANT ALL ON TABLE public.ai_tasks TO authenticated;
GRANT ALL ON TABLE public.ai_daily_briefings TO service_role;
GRANT ALL ON TABLE public.ai_daily_briefings TO authenticated;
GRANT ALL ON TABLE public.ai_risks TO service_role;
GRANT ALL ON TABLE public.ai_risks TO authenticated;
GRANT ALL ON TABLE public.ai_cashier_performance TO service_role;
GRANT ALL ON TABLE public.ai_cashier_performance TO authenticated;

-- 6. Enable RLS
ALTER TABLE public.ai_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_daily_briefings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_risks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_cashier_performance ENABLE ROW LEVEL SECURITY;

-- 7. Create Tenant Isolation Policies
DROP POLICY IF EXISTS tenant_isolation_policy ON public.ai_tasks;
CREATE POLICY tenant_isolation_policy ON public.ai_tasks FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_policy ON public.ai_daily_briefings;
CREATE POLICY tenant_isolation_policy ON public.ai_daily_briefings FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_policy ON public.ai_risks;
CREATE POLICY tenant_isolation_policy ON public.ai_risks FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_policy ON public.ai_cashier_performance;
CREATE POLICY tenant_isolation_policy ON public.ai_cashier_performance FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
