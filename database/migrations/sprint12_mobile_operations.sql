-- ==============================================================================
-- AYDIN GROS OS - SPRINT 12 MOBILE OPERATIONS SCHEMA UPDATES
-- ==============================================================================

-- 1. Create Shelves table
CREATE TABLE IF NOT EXISTS public.shelves (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    shelf_code VARCHAR(50) NOT NULL,
    location_desc TEXT,
    capacity INTEGER DEFAULT 100,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT uq_shelves_code UNIQUE (tenant_id, branch_id, shelf_code)
);

-- 2. Create Shelf Products mappings
CREATE TABLE IF NOT EXISTS public.shelf_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    shelf_id UUID NOT NULL REFERENCES public.shelves(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    quantity DECIMAL(12,3) NOT NULL DEFAULT 0,
    capacity INTEGER DEFAULT 50,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_shelf_products UNIQUE (shelf_id, product_id)
);

-- 3. Grants permissions
GRANT ALL ON TABLE public.shelves TO service_role;
GRANT ALL ON TABLE public.shelves TO authenticated;
GRANT ALL ON TABLE public.shelf_products TO service_role;
GRANT ALL ON TABLE public.shelf_products TO authenticated;

-- 4. Enable RLS
ALTER TABLE public.shelves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shelf_products ENABLE ROW LEVEL SECURITY;

-- 5. Create Tenant Isolation Policies
DROP POLICY IF EXISTS tenant_isolation_policy ON public.shelves;
CREATE POLICY tenant_isolation_policy ON public.shelves FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_policy ON public.shelf_products;
CREATE POLICY tenant_isolation_policy ON public.shelf_products FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
