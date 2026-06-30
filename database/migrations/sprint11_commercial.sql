-- ==============================================================================
-- AYDIN GROS OS - SPRINT 11 COMMERCIAL FOUNDATION SCHEMA UPDATES
-- ==============================================================================

-- 1. Company Profile columns on tenants
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS tax_office VARCHAR(100);
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS tax_number VARCHAR(50);
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS mersis_no VARCHAR(50);
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS email VARCHAR(150);
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- 2. Multi-Branch & Warehouse Assignment
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS manager_id UUID;
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS manager_email VARCHAR(255);

ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS manager_id UUID;
ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS manager_email VARCHAR(255);

-- 3. Subscription & License Columns on tenants
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS subscription_plan VARCHAR(50) DEFAULT 'starter';
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50) DEFAULT 'trial';
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS license_key VARCHAR(100);
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS license_ends_at TIMESTAMPTZ;

-- Update existing tenants to default status if empty
UPDATE public.tenants SET subscription_plan = 'pro', subscription_status = 'active' WHERE subscription_plan IS NULL;

-- 4. Drop check constraint on staff_permissions.role and redefine it
ALTER TABLE public.staff_permissions DROP CONSTRAINT IF EXISTS chk_staff_role;
ALTER TABLE public.staff_permissions ADD CONSTRAINT chk_staff_role 
  CHECK (role IN ('owner', 'general_manager', 'branch_manager', 'cashier', 'warehouse_staff', 'purchasing_staff', 'accountant', 'auditor', 'admin', 'manager', 'stock', 'viewer'));

-- 5. Enterprise Security Tables: Login History & User Devices
CREATE TABLE IF NOT EXISTS public.login_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id UUID,
    email VARCHAR(255) NOT NULL,
    ip_address INET,
    user_agent TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'success', -- 'success', 'failed'
    failure_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    device_name TEXT,
    ip_address INET,
    last_active_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for security audits
CREATE INDEX IF NOT EXISTS idx_login_history_email ON public.login_history(email);
CREATE INDEX IF NOT EXISTS idx_login_history_created_at ON public.login_history(created_at);
CREATE INDEX IF NOT EXISTS idx_user_devices_user_id ON public.user_devices(user_id);
