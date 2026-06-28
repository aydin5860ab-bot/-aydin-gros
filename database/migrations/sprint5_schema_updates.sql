-- =============================================================================
-- SPRINT 5 SCHEMA UPDATES — CUSTOMERS, CARI, REGISTERS, AND TRANSFERS
-- =============================================================================

-- 1. Alter product_stock to include branch_id for multi-branch stock
ALTER TABLE public.product_stock ADD COLUMN IF NOT EXISTS branch_id UUID;

-- Seeding branch_id with main branch if NULL
UPDATE public.product_stock 
SET branch_id = '22222222-2222-2222-2222-222222222222' 
WHERE branch_id IS NULL;

-- Make branch_id not null and update primary key to include branch_id
ALTER TABLE public.product_stock ALTER COLUMN branch_id SET NOT NULL;
ALTER TABLE public.product_stock DROP CONSTRAINT IF EXISTS product_stock_pkey;
ALTER TABLE public.product_stock ADD CONSTRAINT product_stock_pkey PRIMARY KEY (tenant_id, branch_id, product_legacy_id);

-- 2. CREATE customers table
CREATE TABLE IF NOT EXISTS public.customers (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID          NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  full_name           VARCHAR(255)  NOT NULL,
  phone               VARCHAR(50),
  email               VARCHAR(255),
  notes               TEXT,
  balance             DECIMAL(12,2) NOT NULL DEFAULT 0, -- Balance: positive = customer owes us, negative = credit balance
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ,

  CONSTRAINT chk_customers_name   CHECK (LENGTH(TRIM(full_name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_phone_s5
  ON public.customers (tenant_id, phone)
  WHERE phone IS NOT NULL AND deleted_at IS NULL;

-- 3. CREATE customer_transactions table (veresiye, debt & collections)
CREATE TABLE IF NOT EXISTS public.customer_transactions (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID          NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id     UUID          NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  amount          DECIMAL(12,2) NOT NULL, -- positive = debt, negative = payment/collection
  type            VARCHAR(50)   NOT NULL, -- 'purchase' | 'payment' | 'initial_balance' | 'adjustment'
  reference_id    UUID,                   -- order_id or other references
  notes           TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- 4. CREATE register_sessions table (open/close register, cash verification)
CREATE TABLE IF NOT EXISTS public.register_sessions (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID          NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id       UUID          NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  opened_by       UUID          REFERENCES public.users(id) ON DELETE SET NULL,
  opened_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  closed_at       TIMESTAMPTZ,
  opening_cash    DECIMAL(12,2) NOT NULL DEFAULT 0,
  expected_cash   DECIMAL(12,2) NOT NULL DEFAULT 0,
  actual_cash     DECIMAL(12,2) NOT NULL DEFAULT 0,
  status          VARCHAR(20)   NOT NULL DEFAULT 'open', -- 'open' | 'closed'
  notes           TEXT
);

-- 5. CREATE stock_transfers table (product transfer between branches)
CREATE TABLE IF NOT EXISTS public.stock_transfers (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID          NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  from_branch_id  UUID          NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  to_branch_id    UUID          NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  status          VARCHAR(20)   NOT NULL DEFAULT 'pending', -- 'pending' | 'completed' | 'cancelled'
  items           JSONB         NOT NULL, -- Array of { legacy_id, name, qty }
  notes           TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

-- 6. GRANT permissions to service_role, authenticated, and anon roles
GRANT ALL ON TABLE public.customers TO service_role;
GRANT ALL ON TABLE public.customers TO anon;
GRANT ALL ON TABLE public.customers TO authenticated;

GRANT ALL ON TABLE public.customer_transactions TO service_role;
GRANT ALL ON TABLE public.customer_transactions TO anon;
GRANT ALL ON TABLE public.customer_transactions TO authenticated;

GRANT ALL ON TABLE public.register_sessions TO service_role;
GRANT ALL ON TABLE public.register_sessions TO anon;
GRANT ALL ON TABLE public.register_sessions TO authenticated;

GRANT ALL ON TABLE public.stock_transfers TO service_role;
GRANT ALL ON TABLE public.stock_transfers TO anon;
GRANT ALL ON TABLE public.stock_transfers TO authenticated;

-- 7. ENABLE Row Level Security (RLS)
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.register_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;

-- 8. CREATE permissive RLS policies for simple access matching API route checks
CREATE POLICY bypass_customers_rls ON public.customers FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
CREATE POLICY bypass_customer_trans_rls ON public.customer_transactions FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
CREATE POLICY bypass_register_sessions_rls ON public.register_sessions FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
CREATE POLICY bypass_stock_transfers_rls ON public.stock_transfers FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
