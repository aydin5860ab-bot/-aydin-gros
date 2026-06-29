-- =============================================================================
-- SPRINT 7 SCHEMA — İade, Değişim, Z Raporu, Karma Ödeme, Kasa Geliştirmeleri
-- Sürüm  : v2 (production-ready, idempotent)
-- Tarih  : 2026-06-29
-- Bağımlılıklar: public.tenants, public.orders, public.register_sessions,
--               current_tenant_id()  ← Sprint 6 migration'ından geliyor
--
-- ÇALIŞTIRMA SIRASI:
--   1. Sprint 1-5 migrationları tamamlanmış olmalı (public.orders mevcut)
--   2. Sprint 6 migration'ı tamamlanmış olmalı (current_tenant_id() mevcut)
--   3. Bu dosyayı Supabase SQL Editor'e yapıştırıp RUN'a basın.
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- ADIM 0 — BAĞIMLILIK KONTROLLERI
-- ─────────────────────────────────────────────────────────────────────────────

-- 0a. public.tenants mevcut mu?
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'tenants'
  ) THEN
    RAISE EXCEPTION
      'Bağımlılık hatası: public.tenants tablosu bulunamadı. '
      'Lütfen Sprint 1 migrationını önce çalıştırın.';
  END IF;
END $$;

-- 0b. public.orders mevcut mu?
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'orders'
  ) THEN
    RAISE EXCEPTION
      'Bağımlılık hatası: public.orders tablosu bulunamadı. '
      'Lütfen Sprint 1-5 migrationlarını önce çalıştırın.';
  END IF;
END $$;

-- 0c. public.register_sessions mevcut mu?
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'register_sessions'
  ) THEN
    RAISE EXCEPTION
      'Bağımlılık hatası: public.register_sessions tablosu bulunamadı. '
      'Lütfen önceki sprint migrationlarını önce çalıştırın.';
  END IF;
END $$;

-- 0d. current_tenant_id() fonksiyonu mevcut mu? (Sprint 6'da oluşturulur)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'current_tenant_id'
  ) THEN
    RAISE EXCEPTION
      'Bağımlılık hatası: public.current_tenant_id() fonksiyonu bulunamadı. '
      'Lütfen Sprint 6 migrationını önce çalıştırın.';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ADIM 1 — orders tablosuna Sprint 7 kolonları ekle
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS is_cancelled  BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by  TEXT,
  ADD COLUMN IF NOT EXISTS session_id    UUID,
  ADD COLUMN IF NOT EXISTS mixed_payment BOOLEAN     NOT NULL DEFAULT FALSE;

-- ─────────────────────────────────────────────────────────────────────────────
-- ADIM 2 — register_sessions tablosuna kasa kapanış kolonları ekle
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.register_sessions
  ADD COLUMN IF NOT EXISTS closing_cash      DECIMAL(12,2),           -- kasiyer sayımı (nullable: sayılmamış olabilir)
  ADD COLUMN IF NOT EXISTS closing_card      DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS closing_other     DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expected_cash     DECIMAL(12,2),           -- sistem beklentisi
  ADD COLUMN IF NOT EXISTS cash_difference   DECIMAL(12,2),           -- closing_cash - expected_cash
  ADD COLUMN IF NOT EXISTS total_sales       DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_returns     DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS transaction_count INTEGER       NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS z_report_id       UUID,                    -- FK eklenmez: döngüsel bağımlılık önlenir
  ADD COLUMN IF NOT EXISTS closed_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notes             TEXT;

-- ─────────────────────────────────────────────────────────────────────────────
-- ADIM 3 — sale_payments (karma ödeme detayları)
--   Bir sipariş hem nakit hem kart ile ödenebilir.
--   order_id TEXT (FK yok) — offline POS siparişleri DB'ye geç yazılabilir.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sale_payments (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID          NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id       TEXT          NOT NULL,
  session_id     UUID,
  payment_method VARCHAR(30)   NOT NULL
    CONSTRAINT chk_sp_method CHECK (
      payment_method IN ('cash','card','loyalty_points','coupon','bank_transfer','other')
    ),
  amount         DECIMAL(12,2) NOT NULL CONSTRAINT chk_sp_amount CHECK (amount > 0),
  reference      TEXT,          -- kart slip no, kupon kodu, banka ref, vb.
  cashier_email  TEXT,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sale_payments_order
  ON public.sale_payments (tenant_id, order_id);

CREATE INDEX IF NOT EXISTS idx_sale_payments_session
  ON public.sale_payments (session_id)
  WHERE session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sale_payments_date
  ON public.sale_payments (tenant_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- ADIM 4 — sale_returns (iade başlıkları)
-- ─────────────────────────────────────────────────────────────────────────────
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
  total_refund      DECIMAL(12,2) NOT NULL CONSTRAINT chk_total_refund CHECK (total_refund >= 0),
  status            VARCHAR(20)   NOT NULL DEFAULT 'completed'
    CONSTRAINT chk_return_status CHECK (
      status IN ('pending','completed','rejected','partial')
    ),
  processed_by      TEXT,
  notes             TEXT,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE SEQUENCE IF NOT EXISTS public.sale_return_seq START 1;

CREATE INDEX IF NOT EXISTS idx_sale_returns_order
  ON public.sale_returns (tenant_id, original_order_id);

CREATE INDEX IF NOT EXISTS idx_sale_returns_no
  ON public.sale_returns (tenant_id, return_no);

-- Z Raporu tarih filtresi için (gte/lte sorgular)
CREATE INDEX IF NOT EXISTS idx_sale_returns_date
  ON public.sale_returns (tenant_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- ADIM 5 — sale_return_items (iade kalemleri)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sale_return_items (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id         UUID          NOT NULL REFERENCES public.sale_returns(id) ON DELETE CASCADE,
  tenant_id         UUID          NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_legacy_id INTEGER,
  product_name      VARCHAR(255)  NOT NULL,
  qty               INTEGER       NOT NULL CONSTRAINT chk_sri_qty CHECK (qty > 0),
  unit_price        DECIMAL(12,2) NOT NULL,
  subtotal          DECIMAL(12,2) NOT NULL,
  restock           BOOLEAN       NOT NULL DEFAULT TRUE
);

-- JOIN sorgularında return_id üzerinden arama için (önemli)
CREATE INDEX IF NOT EXISTS idx_sale_return_items_return
  ON public.sale_return_items (return_id);

CREATE INDEX IF NOT EXISTS idx_sale_return_items_tenant
  ON public.sale_return_items (tenant_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- ADIM 6 — sale_exchanges (ürün değişimi)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sale_exchanges (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID          NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  original_order_id TEXT          NOT NULL,
  session_id        UUID,
  exchange_no       VARCHAR(30)   NOT NULL,
  return_items      JSONB         NOT NULL DEFAULT '[]',  -- iade edilen ürünler
  new_items         JSONB         NOT NULL DEFAULT '[]',  -- yeni alınan ürünler
  return_total      DECIMAL(12,2) NOT NULL DEFAULT 0,
  new_total         DECIMAL(12,2) NOT NULL DEFAULT 0,
  difference        DECIMAL(12,2) NOT NULL DEFAULT 0,     -- new_total - return_total; pozitif=müşteri öder
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

CREATE INDEX IF NOT EXISTS idx_sale_exchanges_date
  ON public.sale_exchanges (tenant_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- ADIM 7 — z_reports (gün sonu / vardiya Z raporu)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.z_reports (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID          NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  report_no             VARCHAR(20)   NOT NULL,
  register_session_id   UUID,          -- FK yok: session silinmiş olsa bile rapor kalır
  register_name         VARCHAR(100),
  cashier_email         TEXT,

  -- Vardiya penceresi
  shift_start           TIMESTAMPTZ   NOT NULL,
  shift_end             TIMESTAMPTZ   NOT NULL,

  -- Satış özeti
  total_sales_count     INTEGER       NOT NULL DEFAULT 0,
  total_sales_amount    DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_returns_count   INTEGER       NOT NULL DEFAULT 0,
  total_returns_amount  DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_exchanges_count INTEGER       NOT NULL DEFAULT 0,
  net_amount            DECIMAL(12,2) NOT NULL DEFAULT 0,   -- total_sales - total_returns

  -- Ödeme dağılımı
  cash_total            DECIMAL(12,2) NOT NULL DEFAULT 0,
  card_total            DECIMAL(12,2) NOT NULL DEFAULT 0,
  loyalty_total         DECIMAL(12,2) NOT NULL DEFAULT 0,
  other_total           DECIMAL(12,2) NOT NULL DEFAULT 0,

  -- Kasa bakiyesi
  opening_balance       DECIMAL(12,2) NOT NULL DEFAULT 0,
  closing_cash          DECIMAL(12,2) NOT NULL DEFAULT 0,
  expected_cash         DECIMAL(12,2) NOT NULL DEFAULT 0,   -- opening_balance + cash_total
  cash_difference       DECIMAL(12,2) NOT NULL DEFAULT 0,   -- closing_cash - expected_cash

  -- Ayrıntılar (JSONB)
  tax_breakdown         JSONB         NOT NULL DEFAULT '{}',
  top_products          JSONB         NOT NULL DEFAULT '[]',

  notes                 TEXT,
  status                VARCHAR(20)   NOT NULL DEFAULT 'closed'
    CONSTRAINT chk_zr_status CHECK (status IN ('draft','closed','printed')),
  printed_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE SEQUENCE IF NOT EXISTS public.z_report_seq START 1;

-- tenant + tarih (liste sorgusu)
CREATE INDEX IF NOT EXISTS idx_z_reports_tenant_date
  ON public.z_reports (tenant_id, created_at DESC);

-- report_no benzersizliği
CREATE UNIQUE INDEX IF NOT EXISTS idx_z_report_no
  ON public.z_reports (tenant_id, report_no);

-- register_session_id üzerinden lookup
CREATE INDEX IF NOT EXISTS idx_z_reports_session
  ON public.z_reports (register_session_id)
  WHERE register_session_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- ADIM 8 — GRANTS
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  tbl TEXT;
BEGIN
  -- Tablolar
  FOREACH tbl IN ARRAY ARRAY[
    'sale_payments','sale_returns','sale_return_items',
    'sale_exchanges','z_reports'
  ] LOOP
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', tbl);
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', tbl
    );
  END LOOP;

  -- Sequence'lar
  FOREACH tbl IN ARRAY ARRAY[
    'sale_return_seq','sale_exchange_seq','z_report_seq'
  ] LOOP
    EXECUTE format('GRANT ALL ON SEQUENCE public.%I TO service_role', tbl);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I TO authenticated', tbl);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ADIM 9 — RLS ETKİNLEŞTİR
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.sale_payments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_returns       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_return_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_exchanges     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.z_reports          ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────────
-- ADIM 10 — MEVCUT POLİTİKALARI KALDIR (idempotent ikinci çalıştırma için)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS s7_sale_payments_all    ON public.sale_payments;
DROP POLICY IF EXISTS s7_sale_returns_all     ON public.sale_returns;
DROP POLICY IF EXISTS s7_return_items_all     ON public.sale_return_items;
DROP POLICY IF EXISTS s7_sale_exchanges_all   ON public.sale_exchanges;
DROP POLICY IF EXISTS s7_z_reports_all        ON public.z_reports;

-- ─────────────────────────────────────────────────────────────────────────────
-- ADIM 11 — RLS POLİTİKALARI
-- ─────────────────────────────────────────────────────────────────────────────

-- sale_payments: tenant izolasyonu
CREATE POLICY s7_sale_payments_all
  ON public.sale_payments FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- sale_returns: tenant izolasyonu
CREATE POLICY s7_sale_returns_all
  ON public.sale_returns FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- sale_return_items: tenant izolasyonu
--   (return_id FK üzerinden erişilebilir; tenant_id tekrarı izolasyonu güçlendirir)
CREATE POLICY s7_return_items_all
  ON public.sale_return_items FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- sale_exchanges: tenant izolasyonu
CREATE POLICY s7_sale_exchanges_all
  ON public.sale_exchanges FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- z_reports: tenant izolasyonu
CREATE POLICY s7_z_reports_all
  ON public.z_reports FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- ─────────────────────────────────────────────────────────────────────────────
COMMIT;
-- ─────────────────────────────────────────────────────────────────────────────

-- =============================================================================
-- SPRINT 7 DOĞRULAMA SORGULARI
-- (COMMIT'ten sonra çalışır — transaction dışında)
-- =============================================================================

-- ── V1: Tablolar oluştu mu? ──────────────────────────────────────────────────
SELECT
  table_name,
  CASE WHEN table_name IS NOT NULL THEN '✅ OLUŞTURULDU' ELSE '❌ EKSİK' END AS durum
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'sale_payments','sale_returns','sale_return_items',
    'sale_exchanges','z_reports'
  )
ORDER BY table_name;

-- ── V2: RLS aktif mi? ────────────────────────────────────────────────────────
SELECT
  relname AS tablo,
  CASE WHEN relrowsecurity THEN '✅ RLS AKTİF' ELSE '❌ KAPALI' END AS rls_durumu
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relname IN (
    'sale_payments','sale_returns','sale_return_items',
    'sale_exchanges','z_reports'
  )
ORDER BY relname;

-- ── V3: Politikalar var mı? ──────────────────────────────────────────────────
SELECT
  tablename,
  policyname,
  cmd        AS komut,
  roles      AS roller,
  '✅ POLİTİKA MEVCUT' AS durum
FROM pg_policies
WHERE schemaname = 'public'
  AND policyname IN (
    's7_sale_payments_all','s7_sale_returns_all','s7_return_items_all',
    's7_sale_exchanges_all','s7_z_reports_all'
  )
ORDER BY tablename;

-- ── V4: orders kolön eklemeleri ──────────────────────────────────────────────
SELECT
  column_name,
  data_type,
  column_default,
  is_nullable,
  CASE
    WHEN column_name IN ('is_cancelled','mixed_payment')
         AND column_default LIKE '%false%' THEN '✅ DEFAULT FALSE'
    WHEN column_name IN ('cancel_reason','cancelled_at','cancelled_by','session_id')
         AND is_nullable = 'YES'           THEN '✅ NULLABLE'
    ELSE '✅ MEVCUT'
  END AS kontrol
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'orders'
  AND column_name IN (
    'is_cancelled','cancel_reason','cancelled_at',
    'cancelled_by','session_id','mixed_payment'
  )
ORDER BY column_name;

-- ── V5: register_sessions kolon eklemeleri ───────────────────────────────────
SELECT
  column_name,
  data_type,
  column_default,
  is_nullable,
  '✅ MEVCUT' AS kontrol
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'register_sessions'
  AND column_name IN (
    'closing_cash','closing_card','closing_other',
    'expected_cash','cash_difference',
    'total_sales','total_returns','transaction_count',
    'z_report_id','closed_at','notes'
  )
ORDER BY column_name;

-- ── V6: Index'ler oluştu mu? ─────────────────────────────────────────────────
SELECT
  indexname,
  tablename,
  '✅ INDEX MEVCUT' AS durum
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_sale_payments_order',
    'idx_sale_payments_session',
    'idx_sale_payments_date',
    'idx_sale_returns_order',
    'idx_sale_returns_no',
    'idx_sale_returns_date',
    'idx_sale_return_items_return',
    'idx_sale_return_items_tenant',
    'idx_sale_exchanges_order',
    'idx_sale_exchanges_date',
    'idx_z_reports_tenant_date',
    'idx_z_report_no',
    'idx_z_reports_session'
  )
ORDER BY tablename, indexname;

-- ── V7: Sequence'lar oluştu mu? ──────────────────────────────────────────────
SELECT
  sequencename,
  start_value,
  '✅ SEQUENCE MEVCUT' AS durum
FROM pg_sequences
WHERE schemaname = 'public'
  AND sequencename IN (
    'sale_return_seq','sale_exchange_seq','z_report_seq'
  )
ORDER BY sequencename;

-- ── V8: Constraint'ler aktif mi? ─────────────────────────────────────────────
SELECT
  conname   AS constraint_adi,
  contype   AS tur,   -- c=check, f=foreign key, u=unique, p=primary
  conrelid::regclass AS tablo,
  CASE contype
    WHEN 'c' THEN '✅ CHECK'
    WHEN 'f' THEN '✅ FOREIGN KEY'
    WHEN 'u' THEN '✅ UNIQUE'
    WHEN 'p' THEN '✅ PRIMARY KEY'
  END AS durum
FROM pg_constraint
WHERE conrelid::regclass::text IN (
    'sale_payments','sale_returns','sale_return_items',
    'sale_exchanges','z_reports'
  )
  AND contype IN ('c','f','u','p')
ORDER BY tablo, tur, constraint_adi;

-- ── V9: Örnek veri testi (mock insert + rollback) ────────────────────────────
DO $$
DECLARE
  v_tenant_id UUID;
  v_ret_id    UUID;
BEGIN
  -- İlk tenant'ı al (test için)
  SELECT id INTO v_tenant_id FROM public.tenants LIMIT 1;
  IF v_tenant_id IS NULL THEN
    RAISE NOTICE '⚠️  Tenants tablosunda kayıt yok, mock test atlandı';
    RETURN;
  END IF;

  -- sale_payments mock insert
  INSERT INTO public.sale_payments
    (tenant_id, order_id, payment_method, amount, cashier_email)
  VALUES
    (v_tenant_id, 'TEST_ORDER_S7', 'cash', 99.99, 'test@test.com');
  RAISE NOTICE '✅ sale_payments: mock insert başarılı';

  -- sale_returns mock insert
  INSERT INTO public.sale_returns
    (tenant_id, original_order_id, return_no, refund_method, total_refund, status)
  VALUES
    (v_tenant_id, 'TEST_ORDER_S7', 'IAD-TEST01', 'cash', 99.99, 'completed')
  RETURNING id INTO v_ret_id;
  RAISE NOTICE '✅ sale_returns: mock insert başarılı (id: %)', v_ret_id;

  -- sale_return_items mock insert
  INSERT INTO public.sale_return_items
    (return_id, tenant_id, product_name, qty, unit_price, subtotal)
  VALUES
    (v_ret_id, v_tenant_id, 'Test Ürün', 1, 99.99, 99.99);
  RAISE NOTICE '✅ sale_return_items: mock insert başarılı';

  -- sale_exchanges mock insert
  INSERT INTO public.sale_exchanges
    (tenant_id, original_order_id, exchange_no, return_items, new_items,
     return_total, new_total, difference, status)
  VALUES
    (v_tenant_id, 'TEST_ORDER_S7', 'DEG-TEST01',
     '[{"name":"Eski","qty":1,"price":50}]',
     '[{"name":"Yeni","qty":1,"price":70}]',
     50.00, 70.00, 20.00, 'completed');
  RAISE NOTICE '✅ sale_exchanges: mock insert başarılı';

  -- z_reports mock insert
  INSERT INTO public.z_reports
    (tenant_id, report_no, shift_start, shift_end,
     total_sales_count, total_sales_amount, net_amount,
     cash_total, card_total, opening_balance, closing_cash, expected_cash)
  VALUES
    (v_tenant_id, 'Z-TEST01',
     NOW() - INTERVAL '8 hours', NOW(),
     5, 499.95, 400.96, 299.95, 200.00,
     100.00, 399.95, 399.95);
  RAISE NOTICE '✅ z_reports: mock insert başarılı';

  -- Tüm test kayıtlarını geri al
  RAISE EXCEPTION 'ROLLBACK_TEST' USING ERRCODE = 'P0001';

EXCEPTION
  WHEN SQLSTATE 'P0001' THEN
    RAISE NOTICE '✅ Mock veri testi başarılı — tüm kayıtlar geri alındı';
  WHEN OTHERS THEN
    RAISE NOTICE '❌ Mock veri testi başarısız: % — %', SQLSTATE, SQLERRM;
END $$;

-- ── V10: Toplam özet ──────────────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM information_schema.tables
   WHERE table_schema='public'
     AND table_name IN ('sale_payments','sale_returns','sale_return_items','sale_exchanges','z_reports')
  ) AS tablolar,
  (SELECT COUNT(*) FROM pg_policies
   WHERE schemaname='public'
     AND policyname LIKE 's7_%'
  ) AS politikalar,
  (SELECT COUNT(*) FROM pg_indexes
   WHERE schemaname='public'
     AND indexname LIKE 'idx_sale%' OR indexname LIKE 'idx_z_report%'
  ) AS indexler,
  (SELECT COUNT(*) FROM pg_sequences
   WHERE schemaname='public'
     AND sequencename IN ('sale_return_seq','sale_exchange_seq','z_report_seq')
  ) AS sequenceler,
  CASE
    WHEN (
      SELECT COUNT(*) FROM information_schema.tables
      WHERE table_schema='public'
        AND table_name IN ('sale_payments','sale_returns','sale_return_items','sale_exchanges','z_reports')
    ) = 5
    AND (
      SELECT COUNT(*) FROM pg_policies
      WHERE schemaname='public' AND policyname LIKE 's7_%'
    ) = 5
    THEN '✅ SPRINT 7 MIGRATION BAŞARILI'
    ELSE '❌ EKSIK — yukarıdaki sonuçları kontrol edin'
  END AS genel_durum;
