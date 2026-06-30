-- ==============================================================================
-- AYDIN GROS OS — SPRINT 13: AI MARKET MANAGER SCHEMA
-- Run this against Supabase via SQL Editor
-- ==============================================================================

-- 1. AI Insights — Detected patterns and anomalies with actionable recommendations
CREATE TABLE IF NOT EXISTS ai_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'medium'
        CONSTRAINT chk_ai_insights_severity CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    category VARCHAR(50) NOT NULL,
    affected_entity VARCHAR(255),
    recommended_action TEXT,
    estimated_impact TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'open'
        CONSTRAINT chk_ai_insights_status CHECK (status IN ('open', 'reviewed', 'resolved', 'dismissed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. AI Alerts — Real-time operational alerts (stock-out, suspicious voids, SKT etc.)
CREATE TABLE IF NOT EXISTS ai_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    alert_type VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'medium'
        CONSTRAINT chk_ai_alerts_severity CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    status VARCHAR(20) NOT NULL DEFAULT 'unread'
        CONSTRAINT chk_ai_alerts_status CHECK (status IN ('unread', 'read', 'dismissed')),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. AI Action Drafts — AI-generated pending actions awaiting manager approval
CREATE TABLE IF NOT EXISTS ai_action_drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    draft_type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    draft_data JSONB DEFAULT '{}',
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CONSTRAINT chk_ai_drafts_status CHECK (status IN ('pending', 'approved', 'rejected', 'executed')),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. AI Request Logs — Append-only audit trail of all AI engine calls
CREATE TABLE IF NOT EXISTS ai_request_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    request_type VARCHAR(50) NOT NULL,
    input_payload JSONB DEFAULT '{}',
    output_payload JSONB DEFAULT '{}',
    model_used VARCHAR(100) DEFAULT 'rule-based',
    tokens_used INTEGER DEFAULT 0,
    latency_ms INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'completed',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. AI Market Score — Daily health score history per tenant/branch
CREATE TABLE IF NOT EXISTS ai_market_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
    score INTEGER NOT NULL DEFAULT 0 CONSTRAINT chk_score_range CHECK (score BETWEEN 0 AND 100),
    score_details JSONB DEFAULT '{}',
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ai_insights_tenant ON ai_insights(tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_alerts_tenant ON ai_alerts(tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_drafts_tenant ON ai_action_drafts(tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_logs_tenant ON ai_request_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_scores_tenant ON ai_market_scores(tenant_id, calculated_at DESC);

-- RLS
ALTER TABLE ai_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_action_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_request_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_market_scores ENABLE ROW LEVEL SECURITY;

-- Service role bypass policies (API routes use service role key)
CREATE POLICY ai_insights_service_all ON ai_insights FOR ALL TO service_role USING (true);
CREATE POLICY ai_alerts_service_all ON ai_alerts FOR ALL TO service_role USING (true);
CREATE POLICY ai_drafts_service_all ON ai_action_drafts FOR ALL TO service_role USING (true);
CREATE POLICY ai_logs_service_all ON ai_request_logs FOR ALL TO service_role USING (true);
CREATE POLICY ai_scores_service_all ON ai_market_scores FOR ALL TO service_role USING (true);
