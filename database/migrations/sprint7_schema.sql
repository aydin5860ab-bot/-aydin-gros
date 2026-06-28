-- =============================================================================
-- SPRINT 7 SCHEMA — İade, Değişim, Z Raporu, Karma Ödeme, Kasa Geliştirmeleri
-- Sürüm  : v1 (production-ready, idempotent)
-- Tarih  : 2026-06-29
-- Bağımlılıklar: public.tenants, public.customers, public.orders,
--               public.register_sessions, current_tenant_id()
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0a. orders tablosuna Sprint 7 kolonları ekle (IF NOT EXISTS guard)
-- ---------------------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS is_cancelled     BOOLEAN      NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cancel_reason    TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by     TEXT,
  ADD COLUMN IF NOT EXISTS session_id       UUID,
  ADD COLUMN IF NOT EXISTS mixed_payment    BOOLEAN      NOT NULL DEFAULT FALSE;

-- ---------------------------------------------------------------------------
-- 0b. register_sessions tablosuna kasa kapanış kolonları ekle
-- ---------------------------------------------------------------------------
ALTER TABLE public.register_sessions
  ADD COLUMN IF NOT EXISTS closing_cash      DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS closing_card      DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS closing_other     DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expected_cash     DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS cash_difference   DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS total_sales       DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_returns     DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS transaction_count INTEGER       NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS z_report_id       UUID,
  ADD COLUMN IF NOT EXISTS closed_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notes             TEXT;

-- ---------------------------------------------------------------------------
-- 1. sale_payments — Karma ödeme detayları (çoklu ödeme yöntemi)
--    Bir sipariş hem nakit hem kart ile ödenebilir.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sale_payments (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID          NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id        TEXT          NOT NULL,
  session_id      UUID,
  payment_method  VARCHAR(30)   NOT NULL
    CONSTRAINT chk_sp_method CHECK (
      payment_method IN ('cash','card','loyalty_points','coupon','bank_transfer','other')
    ),
  amount          DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  reference       TEXT,         -- kart slip no, kupon kodu, vb.
  cashier_email   TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sale_payments_order
  ON public.sale_payments (tenant_id, order_id);

CREATE INDEX IF NOT EXISTS idx_sale_payments_session
  ON public.sale_payments (session_id);

-- ---------------------------------------------------------------------------
-- 2. sale_returns — İade başlıkları
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sale_returns (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID          NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  original_order_id TEXT          NOT NULL,
  session_id        UUID,
  return_no         VARCHAR(30)   NOT NULL,
  return_reason     TEXT,
  refund_method     VARCHAR(20)   NOT NULL DEFAULT 'cash'
    CONSTRAINT chk_refund_method CHECK (
      refund_method IN ('cash','card','store_credit','loyalty_points')
    ),
  total_refund      DECIMAL(12,2) NOT NULL CHECK (total_refund >= 0),
  status            VARCHAR(20)   NOT NULL DEFAULT 'completed'
    CONSTRAINT chk_return_status CHECK (
      status IN ('pending','completed','rejected','partial')
    ),
  processed_by      TEXT,
  notes             TEXT,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sale_returns_order
  ON public.sale_returns (tenant_id, original_order_id);

CREATE INDEX IF NOT EXISTS idx_sale_returns_no
  ON public.sale_returns (tenant_id, return_no);

-- Auto-increment return_no sequence
CREATE SEQUENCE IF NOT EXISTS public.sale_return_seq START 1;

-- ---------------------------------------------------------------------------
-- 3. sale_return_items — İade kalemleri
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sale_return_items (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id         UUID          NOT NULL REFERENCES public.sale_returns(id) ON DELETE CASCADE,
  tenant_id         UUID          NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_legacy_id INTEGER,
  product_name      VARCHAR(255)  NOT NULL,
  qty               INTEGER       NOT NULL CHECK (qty > 0),
  unit_price        DECIMAL(12,2) NOT NULL,
  subtotal          DECIMAL(12,2) NOT NULL,
  restock           BOOLEAN       NOT NULL DEFAULT TRUE
);

-- ---------------------------------------------------------------------------
-- 4. sale_exchanges — Ürün değişimi
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sale_exchanges (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID          NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  original_order_id TEXT          NOT NULL,
  session_id        UUID,
  exchange_no       VARCHAR(30)   NOT NULL,
  return_items      JSONB         NOT NULL DEFAULT '[]',
  new_items         JSONB         NOT NULL DEFAULT '[]',
  return_total      DECIMAL(12,2) NOT NULL DEFAULT 0,
  new_total         DECIMAL(12,2) NOT NULL DEFAULT 0,
  difference        DECIMAL(12,2) NOT NULL DEFAULT 0,
  payment_method    VARCHAR(20),
  status            VARCHAR(20)   NOT NULL DEFAULT 'completed'
    CONSTRAINT chk_exchange_status CHECK (
      status IN ('pending','completed','cancelled')
    ),
  processed_by      TEXT,
  notes             TEXT,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE SEQUENCE IF NOT EXISTS public.sale_exchange_seq START 1;

CREATE INDEX IF NOT EXISTS idx_sale_exchanges_order
  ON public.sale_exchanges (tenant_id, original_order_id);

-- ---------------------------------------------------------------------------
-- 5. z_reports — Gün sonu Z raporu
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.z_reports (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID          NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  report_no             VARCHAR(20)   NOT NULL,
  register_session_id   UUID,
  register_name         VARCHAR(100),
  cashier_email         TEXT,
  shift_start           TIMESTAMPTZ   NOT NULL,
  shift_end             TIMESTAMPTZ   NOT NULL,

  -- Satış özeti
  total_sales_count     INTEGER       NOT NULL DEFAULT 0,
  total_sales_amount    DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_returns_count   INTEGER       NOT NULL DEFAULT 0,
  total_returns_amount  DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_exchanges_count INTEGER       NOT NULL DEFAULT 0,
  net_amount            DECIMAL(12,2) NOT NULL DEFAULT 0,

  -- Ödeme dağılımı
  cash_total            DECIMAL(12,2) NOT NULL DEFAULT 0,
  card_total            DECIMAL(12,2) NOT NULL DEFAULT 0,
  loyalty_total         DECIMAL(12,2) NOT NULL DEFAULT 0,
  other_total           DECIMAL(12,2) NOT NULL DEFAULT 0,

  -- Kasa bakiyesi
  opening_balance       DECIMAL(12,2) NOT NULL DEFAULT 0,
  closing_cash          DECIMAL(12,2) NOT NULL DEFAULT 0,
  expected_cash         DECIMAL(12,2) NOT NULL DEFAULT 0,
  cash_difference       DECIMAL(12,2) NOT NULL DEFAULT 0,

  -- KDV ve diğer
  tax_breakdown         JSONB         NOT NULL DEFAULT '{}',
  top_products          JSONB         NOT NULL DEFAULT '[]',
  notes                 TEXT,
  status                VARCHAR(20)   NOT NULL DEFAULT 'closed'
    CONSTRAINT chk_zr_status CHECK (status IN ('draft','closed','printed')),
  printed_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE SEQUENCE IF NOT EXISTS public.z_report_seq START 1;

CREATE INDEX IF NOT EXISTS idx_z_reports_tenant
  ON public.z_reports (tenant_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_z_report_no
  ON public.z_reports (tenant_id, report_no);

-- ---------------------------------------------------------------------------
-- GRANTS
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'sale_payments','sale_returns','sale_return_items',
    'sale_exchanges','z_reports'
  ] LOOP
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', tbl);
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated',
      tbl
    );
  END LOOP;
  -- Sequences
  FOREACH tbl IN ARRAY ARRAY[
    'sale_return_seq','sale_exchange_seq','z_report_seq'
  ] LOOP
    EXECUTE format('GRANT ALL ON SEQUENCE public.%I TO service_role', tbl);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I TO authenticated', tbl);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- RLS ENABLE
-- ---------------------------------------------------------------------------
ALTER TABLE public.sale_payments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_returns       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_return_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_exchanges     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.z_reports          ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- DROP POLICIES IF EXISTS (idempotent)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS s7_sale_payments_all     ON public.sale_payments;
DROP POLICY IF EXISTS s7_sale_returns_all      ON public.sale_returns;
DROP POLICY IF EXISTS s7_return_items_all      ON public.sale_return_items;
DROP POLICY IF EXISTS s7_sale_exchanges_all    ON public.sale_exchanges;
DROP POLICY IF EXISTS s7_z_reports_all         ON public.z_reports;

-- ---------------------------------------------------------------------------
-- RLS POLICIES
-- ---------------------------------------------------------------------------
CREATE POLICY s7_sale_payments_all
  ON public.sale_payments FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY s7_sale_returns_all
  ON public.sale_returns FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY s7_return_items_all
  ON public.sale_return_items FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY s7_sale_exchanges_all
  ON public.sale_exchanges FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY s7_z_reports_all
  ON public.z_reports FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

COMMIT;

-- =============================================================================
-- DOĞRULAMA SORGULARI
-- =============================================================================

SELECT table_name, '✅ OLUŞTURULDU' AS durum
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'sale_payments','sale_returns','sale_return_items',
    'sale_exchanges','z_reports'
  )
ORDER BY table_name;

SELECT relname AS tablo,
  CASE WHEN relrowsecurity THEN '✅ RLS AKTİF' ELSE '❌ KAPALI' END AS rls
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relname IN (
    'sale_payments','sale_returns','sale_return_items',
    'sale_exchanges','z_reports'
  )
ORDER BY relname;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema='public' AND table_name='orders'
  AND column_name IN ('is_cancelled','cancel_reason','session_id','mixed_payment')
ORDER BY column_name;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema='public' AND table_name='register_sessions'
  AND column_name IN ('closing_cash','expected_cash','cash_difference','z_report_id','total_sales')
ORDER BY column_name;
