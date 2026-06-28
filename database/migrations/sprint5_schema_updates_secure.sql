-- =============================================================================
-- SPRINT 5 SCHEMA UPDATES — GÜVENLİ (PRODUCTION-READY) VERSİYON
-- =============================================================================
-- Orijinal: database/migrations/sprint5_schema_updates.sql
--
-- Düzeltilen güvenlik açıkları:
--   [CRITICAL] GRANT ALL TO anon → anon erişimi tamamen kaldırıldı
--   [CRITICAL] USING(true) WITH CHECK(true) → rol + tenant_id izolasyonu
--   [CRITICAL] public.users eksikliği → REFERENCES koruması eklendi
--   [HIGH]     branch_id seed güvensizliği → EXISTS guard eklendi
--
-- Helper fonksiyonlar zaten rls_policies.sql içinde tanımlıdır:
--   current_tenant_id()  → (auth.jwt()->>'tenant_id')::UUID
--   current_user_role()  → auth.jwt()->>'role'
--   current_branch_id()  → (auth.jwt()->>'branch_id')::UUID
--   current_user_id()    → auth.uid()
--
-- Çalıştırma: Supabase SQL Editor — tek blok olarak çalıştırın.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- ADIM 0 — Gerekli helper fonksiyonlar (zaten varsa üzerine yaz)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_id() RETURNS UUID
  LANGUAGE sql STABLE AS $$ SELECT auth.uid(); $$;

CREATE OR REPLACE FUNCTION public.current_tenant_id() RETURNS UUID
  LANGUAGE sql STABLE AS $$ SELECT (auth.jwt()->>'tenant_id')::UUID; $$;

CREATE OR REPLACE FUNCTION public.current_user_role() RETURNS VARCHAR
  LANGUAGE sql STABLE AS $$ SELECT auth.jwt()->>'role'; $$;

CREATE OR REPLACE FUNCTION public.current_branch_id() RETURNS UUID
  LANGUAGE sql STABLE AS $$ SELECT (auth.jwt()->>'branch_id')::UUID; $$;

-- ---------------------------------------------------------------------------
-- ADIM 1 — product_stock: branch_id ekleme
-- ---------------------------------------------------------------------------

ALTER TABLE public.product_stock ADD COLUMN IF NOT EXISTS branch_id UUID;

-- Sadece branches tablosu varsa ve ilgili UUID mevcutsa seed et
DO $$
DECLARE
  v_branch_exists BOOLEAN;
  v_null_count    INTEGER;
BEGIN
  -- branches tablosu var mı?
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'branches'
  ) INTO v_branch_exists;

  IF v_branch_exists THEN
    -- Varsayılan branch UUID var mı?
    IF EXISTS (
      SELECT 1 FROM public.branches
      WHERE id = '22222222-2222-2222-2222-222222222222'
    ) THEN
      UPDATE public.product_stock
      SET branch_id = '22222222-2222-2222-2222-222222222222'
      WHERE branch_id IS NULL;
      RAISE NOTICE '[ADIM 1] product_stock.branch_id seed edildi.';
    ELSE
      RAISE NOTICE '[ADIM 1] UYARI: branches tablosunda 22222222-2222-2222-2222-222222222222 yok.';
      RAISE NOTICE '[ADIM 1] NOT NULL kısıtı uygulanmayacak. Manuel seed gerekli.';
    END IF;
  ELSE
    RAISE NOTICE '[ADIM 1] UYARI: public.branches tablosu bulunamadı. Seed atlandı.';
  END IF;

  -- Hâlâ NULL kalan satır var mı?
  SELECT COUNT(*) INTO v_null_count
  FROM public.product_stock WHERE branch_id IS NULL;

  IF v_null_count = 0 THEN
    -- Tüm satırlar dolu — NOT NULL + yeni PK uygula
    ALTER TABLE public.product_stock ALTER COLUMN branch_id SET NOT NULL;
    ALTER TABLE public.product_stock DROP CONSTRAINT IF EXISTS product_stock_pkey;
    ALTER TABLE public.product_stock
      ADD CONSTRAINT product_stock_pkey
      PRIMARY KEY (tenant_id, branch_id, product_legacy_id);
    RAISE NOTICE '[ADIM 1] product_stock primary key güncellendi: (tenant_id, branch_id, product_legacy_id).';
  ELSE
    RAISE NOTICE '[ADIM 1] % satırda branch_id NULL. NOT NULL atlandı. Önce seed yapın.', v_null_count;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- ADIM 2 — customers tablosu
-- Sprint5'in tasarımına ek olarak: balance yerine cari (veresiye) odaklı alan
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.customers (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID          NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  full_name   VARCHAR(255)  NOT NULL,
  phone       VARCHAR(50),
  email       VARCHAR(255),
  notes       TEXT,
  -- balance: pozitif = müşteri borçlu, negatif = alacaklı
  balance     DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ,

  CONSTRAINT chk_customers_name CHECK (LENGTH(TRIM(full_name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_phone_s5
  ON public.customers (tenant_id, phone)
  WHERE phone IS NOT NULL AND deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- ADIM 3 — customer_transactions tablosu (veresiye hareketleri)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.customer_transactions (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID          NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id   UUID          NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  -- pozitif = borç (satış), negatif = ödeme/tahsilat
  amount        DECIMAL(12,2) NOT NULL,
  -- 'purchase' | 'payment' | 'initial_balance' | 'adjustment'
  type          VARCHAR(50)   NOT NULL
    CONSTRAINT chk_ct_type CHECK (type IN ('purchase','payment','initial_balance','adjustment')),
  reference_id  UUID,
  notes         TEXT,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- ADIM 4 — register_sessions tablosu (kasa açma/kapama)
-- DÜZELTME: public.users — önce var olup olmadığı kontrol edilir
-- ---------------------------------------------------------------------------

DO $$
DECLARE v_users_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'users'
  ) INTO v_users_exists;

  IF v_users_exists THEN
    -- public.users var — FK ile oluştur
    EXECUTE $SQL$
      CREATE TABLE IF NOT EXISTS public.register_sessions (
        id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id     UUID          NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
        branch_id     UUID          NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
        opened_by     UUID          REFERENCES public.users(id) ON DELETE SET NULL,
        opened_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        closed_at     TIMESTAMPTZ,
        opening_cash  DECIMAL(12,2) NOT NULL DEFAULT 0,
        expected_cash DECIMAL(12,2) NOT NULL DEFAULT 0,
        actual_cash   DECIMAL(12,2) NOT NULL DEFAULT 0,
        status        VARCHAR(20)   NOT NULL DEFAULT 'open'
          CONSTRAINT chk_rs_status CHECK (status IN ('open','closed')),
        notes         TEXT
      )
    $SQL$;
    RAISE NOTICE '[ADIM 4] register_sessions public.users FK ile oluşturuldu.';
  ELSE
    -- public.users yok — auth.users kullan
    EXECUTE $SQL$
      CREATE TABLE IF NOT EXISTS public.register_sessions (
        id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id     UUID          NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
        branch_id     UUID          NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
        opened_by     UUID          REFERENCES auth.users(id) ON DELETE SET NULL,
        opened_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        closed_at     TIMESTAMPTZ,
        opening_cash  DECIMAL(12,2) NOT NULL DEFAULT 0,
        expected_cash DECIMAL(12,2) NOT NULL DEFAULT 0,
        actual_cash   DECIMAL(12,2) NOT NULL DEFAULT 0,
        status        VARCHAR(20)   NOT NULL DEFAULT 'open'
          CONSTRAINT chk_rs_status CHECK (status IN ('open','closed')),
        notes         TEXT
      )
    $SQL$;
    RAISE NOTICE '[ADIM 4] UYARI: public.users bulunamadı. register_sessions auth.users FK ile oluşturuldu.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- ADIM 5 — stock_transfers tablosu
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.stock_transfers (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  from_branch_id  UUID        NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  to_branch_id    UUID        NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
    CONSTRAINT chk_st_status CHECK (status IN ('pending','completed','cancelled')),
  -- [{ legacy_id, name, qty }]
  items           JSONB       NOT NULL DEFAULT '[]',
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

-- ---------------------------------------------------------------------------
-- ADIM 6 — GRANTs
-- anon: YOK — müşteri, kasa ve transfer verileri gizlidir
-- service_role: ALL (RLS zaten bypass edilir)
-- authenticated: DML izinleri (RLS politikaları erişimi daraltır)
-- ---------------------------------------------------------------------------

GRANT ALL  ON TABLE public.customers             TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
             ON TABLE public.customers             TO authenticated;
-- anon: kasıtlı olarak GRANT verilmedi

GRANT ALL  ON TABLE public.customer_transactions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
             ON TABLE public.customer_transactions TO authenticated;

GRANT ALL  ON TABLE public.register_sessions     TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
             ON TABLE public.register_sessions     TO authenticated;

GRANT ALL  ON TABLE public.stock_transfers       TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
             ON TABLE public.stock_transfers       TO authenticated;

-- ---------------------------------------------------------------------------
-- ADIM 7 — RLS etkinleştir
-- ---------------------------------------------------------------------------

ALTER TABLE public.customers             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.register_sessions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transfers       ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- ADIM 8 — Eski bypass policy'leri temizle (varsa)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS bypass_customers_rls         ON public.customers;
DROP POLICY IF EXISTS bypass_customer_trans_rls    ON public.customer_transactions;
DROP POLICY IF EXISTS bypass_register_sessions_rls ON public.register_sessions;
DROP POLICY IF EXISTS bypass_stock_transfers_rls   ON public.stock_transfers;

-- Mevcut tenant-safe policy varsa da kaldır (idempotency için)
DROP POLICY IF EXISTS customers_select             ON public.customers;
DROP POLICY IF EXISTS customers_insert             ON public.customers;
DROP POLICY IF EXISTS customers_update             ON public.customers;
DROP POLICY IF EXISTS customers_delete             ON public.customers;

DROP POLICY IF EXISTS customer_transactions_select ON public.customer_transactions;
DROP POLICY IF EXISTS customer_transactions_insert ON public.customer_transactions;
DROP POLICY IF EXISTS customer_transactions_update ON public.customer_transactions;
DROP POLICY IF EXISTS customer_transactions_delete ON public.customer_transactions;

DROP POLICY IF EXISTS register_sessions_select     ON public.register_sessions;
DROP POLICY IF EXISTS register_sessions_insert     ON public.register_sessions;
DROP POLICY IF EXISTS register_sessions_update     ON public.register_sessions;
DROP POLICY IF EXISTS register_sessions_delete     ON public.register_sessions;

DROP POLICY IF EXISTS stock_transfers_select       ON public.stock_transfers;
DROP POLICY IF EXISTS stock_transfers_insert       ON public.stock_transfers;
DROP POLICY IF EXISTS stock_transfers_update       ON public.stock_transfers;
DROP POLICY IF EXISTS stock_transfers_delete       ON public.stock_transfers;

-- ---------------------------------------------------------------------------
-- ADIM 9 — RLS Policy'leri
--
-- Kural:
--   SELECT USING      → kim okuyabilir?
--   INSERT WITH CHECK → kim yazabilir?
--   UPDATE USING      → kim okuma yapıp değiştirebilir?
--   UPDATE WITH CHECK → hangi rollere son halini kaydetmek için izin var?
--   DELETE USING      → kim silebilir?
--
-- Rollerin anlamı (mevcut rls_policies.sql ile tutarlı):
--   admin            → her şey
--   manager          → yönetim yetkisi
--   branch_manager   → kendi şubesinde geniş yetki
--   cashier          → kendi şubesinde işlem yapabilir, sınırlı değişiklik
--   warehouse_person → stok odaklı (transfer görme/başlatma)
-- ---------------------------------------------------------------------------

-- ── customers ───────────────────────────────────────────────────────────────
-- Kasiyerler müşteri bakiyesini okur ve tahsilat/satış kaydeder.
-- Silme: yalnızca admin/manager (soft-delete tercih edilir).

CREATE POLICY customers_select ON public.customers
  FOR SELECT TO authenticated
  USING (
    tenant_id = current_tenant_id()
    AND current_user_role() IN ('admin','manager','branch_manager','cashier','warehouse_person')
  );

CREATE POLICY customers_insert ON public.customers
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = current_tenant_id()
    AND current_user_role() IN ('admin','manager','branch_manager','cashier')
  );

CREATE POLICY customers_update ON public.customers
  FOR UPDATE TO authenticated
  USING (
    tenant_id = current_tenant_id()
    AND current_user_role() IN ('admin','manager','branch_manager','cashier')
  )
  WITH CHECK (
    tenant_id = current_tenant_id()
    AND current_user_role() IN ('admin','manager','branch_manager','cashier')
  );

CREATE POLICY customers_delete ON public.customers
  FOR DELETE TO authenticated
  USING (
    tenant_id = current_tenant_id()
    AND current_user_role() IN ('admin','manager')
  );

-- ── customer_transactions ────────────────────────────────────────────────────
-- Finansal kayıt: UPDATE/DELETE yalnızca admin/manager (veri bütünlüğü).

CREATE POLICY customer_transactions_select ON public.customer_transactions
  FOR SELECT TO authenticated
  USING (
    tenant_id = current_tenant_id()
    AND current_user_role() IN ('admin','manager','branch_manager','cashier')
  );

CREATE POLICY customer_transactions_insert ON public.customer_transactions
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = current_tenant_id()
    AND current_user_role() IN ('admin','manager','branch_manager','cashier')
  );

CREATE POLICY customer_transactions_update ON public.customer_transactions
  FOR UPDATE TO authenticated
  USING (
    tenant_id = current_tenant_id()
    AND current_user_role() IN ('admin','manager')
  )
  WITH CHECK (
    tenant_id = current_tenant_id()
    AND current_user_role() IN ('admin','manager')
  );

CREATE POLICY customer_transactions_delete ON public.customer_transactions
  FOR DELETE TO authenticated
  USING (
    tenant_id = current_tenant_id()
    AND current_user_role() IN ('admin','manager')
  );

-- ── register_sessions ────────────────────────────────────────────────────────
-- Kasa oturumları: branch_id ile şube kısıtlaması uygulanır.
-- cash_sessions pattern'ı ile birebir uyumlu (rls_policies.sql referans).

CREATE POLICY register_sessions_select ON public.register_sessions
  FOR SELECT TO authenticated
  USING (
    tenant_id = current_tenant_id()
    AND (
      current_user_role() IN ('admin','manager')
      OR (current_user_role() = 'branch_manager' AND branch_id = current_branch_id())
      OR (current_user_role() = 'cashier'         AND branch_id = current_branch_id())
    )
  );

CREATE POLICY register_sessions_insert ON public.register_sessions
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = current_tenant_id()
    AND (
      current_user_role() IN ('admin','manager')
      OR (current_user_role() = 'branch_manager' AND branch_id = current_branch_id())
      OR (current_user_role() = 'cashier'         AND branch_id = current_branch_id())
    )
  );

CREATE POLICY register_sessions_update ON public.register_sessions
  FOR UPDATE TO authenticated
  USING (
    tenant_id = current_tenant_id()
    AND (
      current_user_role() IN ('admin','manager')
      OR (current_user_role() = 'branch_manager' AND branch_id = current_branch_id())
      OR (current_user_role() = 'cashier'         AND branch_id = current_branch_id())
    )
  )
  WITH CHECK (
    tenant_id = current_tenant_id()
    AND (
      current_user_role() IN ('admin','manager')
      OR (current_user_role() = 'branch_manager' AND branch_id = current_branch_id())
      OR (current_user_role() = 'cashier'         AND branch_id = current_branch_id())
    )
  );

CREATE POLICY register_sessions_delete ON public.register_sessions
  FOR DELETE TO authenticated
  USING (
    tenant_id = current_tenant_id()
    AND current_user_role() IN ('admin','manager')
  );

-- ── stock_transfers ──────────────────────────────────────────────────────────
-- rls_policies.sql'deki stock_transfers pattern ile birebir uyumlu.
-- from_branch_id üzerinden şube kısıtlaması (tablo branch_id sütunu içermiyor).

CREATE POLICY stock_transfers_select ON public.stock_transfers
  FOR SELECT TO authenticated
  USING (
    tenant_id = current_tenant_id()
    AND (
      current_user_role() IN ('admin','manager','warehouse_person')
      OR current_user_role() IN ('branch_manager','cashier')  -- okuma erişimi
    )
  );

CREATE POLICY stock_transfers_insert ON public.stock_transfers
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = current_tenant_id()
    AND (
      current_user_role() IN ('admin','manager','warehouse_person')
      OR (current_user_role() = 'branch_manager' AND from_branch_id = current_branch_id())
    )
  );

CREATE POLICY stock_transfers_update ON public.stock_transfers
  FOR UPDATE TO authenticated
  USING (
    tenant_id = current_tenant_id()
    AND (
      current_user_role() IN ('admin','manager','warehouse_person')
      OR current_user_role() IN ('branch_manager','cashier')
    )
  )
  WITH CHECK (
    tenant_id = current_tenant_id()
    AND (
      current_user_role() IN ('admin','manager','warehouse_person')
      OR (current_user_role() = 'branch_manager' AND from_branch_id = current_branch_id())
    )
  );

CREATE POLICY stock_transfers_delete ON public.stock_transfers
  FOR DELETE TO authenticated
  USING (
    tenant_id = current_tenant_id()
    AND (
      current_user_role() IN ('admin','manager','warehouse_person')
      OR (current_user_role() = 'branch_manager' AND from_branch_id = current_branch_id())
    )
  );

COMMIT;

-- =============================================================================
-- DOĞRULAMA SORGULARI
-- Bu sorgular migration'dan bağımsız çalışır.
-- =============================================================================

SELECT '══════════════════════════════════════' AS "──────────────────────";
SELECT '  SPRINT 5 MIGRATION DOĞRULAMA       ' AS "──────────────────────";
SELECT '══════════════════════════════════════' AS "──────────────────────";

-- 1. Tablo varlığı
SELECT '» TABLOLAR' AS kontrol;
SELECT
  t.table_name,
  CASE WHEN t.table_name IS NOT NULL THEN '✓ VAR' ELSE '✗ YOK' END AS durum
FROM (VALUES
  ('customers'),
  ('customer_transactions'),
  ('register_sessions'),
  ('stock_transfers')
) AS expected(table_name)
LEFT JOIN information_schema.tables t
  ON t.table_schema = 'public' AND t.table_name = expected.table_name
ORDER BY expected.table_name;

-- 2. product_stock.branch_id
SELECT '» PRODUCT_STOCK.BRANCH_ID' AS kontrol;
SELECT
  column_name,
  data_type,
  is_nullable,
  CASE
    WHEN is_nullable = 'NO' THEN '✓ NOT NULL'
    ELSE '⚠ Hâlâ NULL — seed gerekli'
  END AS durum
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'product_stock'
  AND column_name  = 'branch_id';

-- 3. Primary key kontrolü
SELECT '» PRODUCT_STOCK PRIMARY KEY' AS kontrol;
SELECT
  kcu.column_name,
  kcu.ordinal_position
FROM information_schema.table_constraints       tc
JOIN information_schema.key_column_usage        kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema   = kcu.table_schema
WHERE tc.constraint_type = 'PRIMARY KEY'
  AND tc.table_schema    = 'public'
  AND tc.table_name      = 'product_stock'
ORDER BY kcu.ordinal_position;

-- 4. RLS policy doğrulaması (bypass policy kalmamalı)
SELECT '» RLS POLICY''LER (bypass_* YOK olmalı)' AS kontrol;
SELECT
  tablename,
  policyname,
  cmd,
  roles,
  LEFT(qual, 60) AS using_expr
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('customers','customer_transactions','register_sessions','stock_transfers')
ORDER BY tablename, policyname;

-- 5. anon GRANT kontrolü (boş olmalı)
SELECT '» ANON GRANT (boş olmalı)' AS kontrol;
SELECT
  table_name,
  grantee,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name   IN ('customers','customer_transactions','register_sessions','stock_transfers')
  AND grantee      = 'anon'
ORDER BY table_name;

-- Boş dönerse: ✓ anon erişimi yok (doğru)
-- Satır dönerse: ✗ anon erişimi var (düzeltilmeli)

-- 6. Özet
SELECT '» ÖZET' AS kontrol;
SELECT
  'customers'             AS tablo,
  COUNT(*) FILTER (WHERE policyname NOT LIKE 'bypass%') AS guvenli_policy,
  COUNT(*) FILTER (WHERE policyname LIKE 'bypass%')     AS bypass_policy
FROM pg_policies WHERE schemaname='public' AND tablename='customers'
UNION ALL
SELECT
  'customer_transactions',
  COUNT(*) FILTER (WHERE policyname NOT LIKE 'bypass%'),
  COUNT(*) FILTER (WHERE policyname LIKE 'bypass%')
FROM pg_policies WHERE schemaname='public' AND tablename='customer_transactions'
UNION ALL
SELECT
  'register_sessions',
  COUNT(*) FILTER (WHERE policyname NOT LIKE 'bypass%'),
  COUNT(*) FILTER (WHERE policyname LIKE 'bypass%')
FROM pg_policies WHERE schemaname='public' AND tablename='register_sessions'
UNION ALL
SELECT
  'stock_transfers',
  COUNT(*) FILTER (WHERE policyname NOT LIKE 'bypass%'),
  COUNT(*) FILTER (WHERE policyname LIKE 'bypass%')
FROM pg_policies WHERE schemaname='public' AND tablename='stock_transfers';
-- guvenli_policy = 4, bypass_policy = 0 olmalı
