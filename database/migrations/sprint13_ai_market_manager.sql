-- ==============================================================================
-- AYDIN GROS OS - SPRINT 13 AI MARKET MANAGER SCHEMA UPDATES
-- ==============================================================================

-- 1. Create AI Insights table
CREATE TABLE IF NOT EXISTS public.ai_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    severity VARCHAR(50) NOT NULL, -- low, medium, high, critical
    category VARCHAR(100) NOT NULL, -- sales_drop, overstock, cashier_anomaly, etc.
    affected_entity TEXT, -- product name, branch id, cashier email
    recommended_action TEXT,
    estimated_impact TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'open', -- open, reviewed, resolved
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create AI Recommendations table
CREATE TABLE IF NOT EXISTS public.ai_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    priority INTEGER DEFAULT 1,
    category VARCHAR(100) NOT NULL,
    recommended_action TEXT,
    metadata JSONB,
    status VARCHAR(50) NOT NULL DEFAULT 'open',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create AI Alerts table
CREATE TABLE IF NOT EXISTS public.ai_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
    alert_type VARCHAR(100) NOT NULL, -- critical_stock, high_refund, etc.
    message TEXT NOT NULL,
    severity VARCHAR(50) NOT NULL,
    metadata JSONB,
    status VARCHAR(50) NOT NULL DEFAULT 'unread', -- unread, read, dismissed
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create AI Action Drafts table
CREATE TABLE IF NOT EXISTS public.ai_action_drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
    draft_type VARCHAR(100) NOT NULL, -- purchase_order, campaign, price_review, etc.
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    draft_data JSONB NOT NULL, -- payload of the action to be performed
    created_by UUID,
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, approved, rejected
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Create AI Daily Summaries table
CREATE TABLE IF NOT EXISTS public.ai_daily_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    summary_date DATE NOT NULL DEFAULT CURRENT_DATE,
    executive_summary TEXT NOT NULL,
    metrics JSONB NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_ai_daily_summary UNIQUE (tenant_id, summary_date)
);

-- 6. Create AI Chat Messages table
CREATE TABLE IF NOT EXISTS public.ai_chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id UUID,
    role VARCHAR(50) NOT NULL, -- user, assistant
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Grants permissions
GRANT ALL ON TABLE public.ai_insights TO service_role;
GRANT ALL ON TABLE public.ai_insights TO authenticated;
GRANT ALL ON TABLE public.ai_recommendations TO service_role;
GRANT ALL ON TABLE public.ai_recommendations TO authenticated;
GRANT ALL ON TABLE public.ai_alerts TO service_role;
GRANT ALL ON TABLE public.ai_alerts TO authenticated;
GRANT ALL ON TABLE public.ai_action_drafts TO service_role;
GRANT ALL ON TABLE public.ai_action_drafts TO authenticated;
GRANT ALL ON TABLE public.ai_daily_summaries TO service_role;
GRANT ALL ON TABLE public.ai_daily_summaries TO authenticated;
GRANT ALL ON TABLE public.ai_chat_messages TO service_role;
GRANT ALL ON TABLE public.ai_chat_messages TO authenticated;

-- 8. Enable RLS
ALTER TABLE public.ai_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_action_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_daily_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_chat_messages ENABLE ROW LEVEL SECURITY;

-- 9. Create Tenant Isolation Policies
DROP POLICY IF EXISTS tenant_isolation_policy ON public.ai_insights;
CREATE POLICY tenant_isolation_policy ON public.ai_insights FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_policy ON public.ai_recommendations;
CREATE POLICY tenant_isolation_policy ON public.ai_recommendations FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_policy ON public.ai_alerts;
CREATE POLICY tenant_isolation_policy ON public.ai_alerts FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_policy ON public.ai_action_drafts;
CREATE POLICY tenant_isolation_policy ON public.ai_action_drafts FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_policy ON public.ai_daily_summaries;
CREATE POLICY tenant_isolation_policy ON public.ai_daily_summaries FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_policy ON public.ai_chat_messages;
CREATE POLICY tenant_isolation_policy ON public.ai_chat_messages FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
