-- =============================================================================
-- SPRINT 6 SCHEMA — Barkod, Sadakat, Kampanya, Kupon, Log, Yedekleme
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. product_barcodes — Ürün barkodları (EAN-13, QR, vs.)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_barcodes (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_legacy_id INTEGER     NOT NULL,
  barcode           VARCHAR(50) NOT NULL,
  barcode_type      VARCHAR(20) NOT NULL DEFAULT 'EAN13'
    CONSTRAINT chk_bc_type CHECK (barcode_type IN ('EAN13','CODE128','QR','CODE39','UPC')),
  is_primary        BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_barcode_per_tenant UNIQUE (tenant_id, barcode)
);

CREATE INDEX IF NOT EXISTS idx_barcodes_barcode ON public.product_barcodes (barcode);

-- ---------------------------------------------------------------------------
-- 2. loyalty_programs — Sadakat programı tanımı
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.loyalty_programs (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID          NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name              VARCHAR(255)  NOT NULL DEFAULT 'Sadakat Programı',
  points_per_lira   DECIMAL(8,4)  NOT NULL DEFAULT 1.0,  -- 1 TL = X puan
  lira_per_point    DECIMAL(8,4)  NOT NULL DEFAULT 0.01, -- 1 puan = X TL
  min_redeem_points INTEGER       NOT NULL DEFAULT 100,
  is_active         BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 3. loyalty_accounts — Müşteri sadakat hesabı
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.loyalty_accounts (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID    NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id UUID    NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  points      INTEGER NOT NULL DEFAULT 0,
  total_earned INTEGER NOT NULL DEFAULT 0,
  total_spent  INTEGER NOT NULL DEFAULT 0,
  tier        VARCHAR(20) NOT NULL DEFAULT 'bronze'
    CONSTRAINT chk_tier CHECK (tier IN ('bronze','silver','gold','platinum')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_loyalty_customer UNIQUE (tenant_id, customer_id)
);

-- ---------------------------------------------------------------------------
-- 4. loyalty_transactions — Puan kazanma/harcama geçmişi
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.loyalty_transactions (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID    NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_id  UUID    NOT NULL REFERENCES public.loyalty_accounts(id) ON DELETE CASCADE,
  order_id    UUID,
  type        VARCHAR(20) NOT NULL
    CONSTRAINT chk_lt_type CHECK (type IN ('earn','redeem','expire','adjust','bonus')),
  points      INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 5. campaigns — Kampanya tanımları
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.campaigns (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID          NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name            VARCHAR(255)  NOT NULL,
  description     TEXT,
  type            VARCHAR(30)   NOT NULL
    CONSTRAINT chk_camp_type CHECK (type IN (
      'percentage_discount','fixed_discount','buy_x_get_y',
      'free_shipping','bundle','loyalty_multiplier'
    )),
  value           DECIMAL(12,4) NOT NULL DEFAULT 0,  -- % veya TL
  min_order_total DECIMAL(12,2),
  max_uses        INTEGER,
  used_count      INTEGER       NOT NULL DEFAULT 0,
  applies_to      VARCHAR(20)   NOT NULL DEFAULT 'all'
    CONSTRAINT chk_applies CHECK (applies_to IN ('all','category','product','customer')),
  applies_ids     JSONB         NOT NULL DEFAULT '[]',
  start_date      TIMESTAMPTZ,
  end_date        TIMESTAMPTZ,
  is_active       BOOLEAN       NOT NULL DEFAULT TRUE,
  priority        INTEGER       NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_active ON public.campaigns (tenant_id, is_active, start_date, end_date);

-- ---------------------------------------------------------------------------
-- 6. coupons — Kupon kodları
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.coupons (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID          NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  campaign_id     UUID          REFERENCES public.campaigns(id) ON DELETE SET NULL,
  code            VARCHAR(50)   NOT NULL,
  type            VARCHAR(30)   NOT NULL
    CONSTRAINT chk_coupon_type CHECK (type IN ('percentage','fixed','free_item','loyalty_points')),
  value           DECIMAL(12,4) NOT NULL,
  min_order_total DECIMAL(12,2),
  max_uses        INTEGER       NOT NULL DEFAULT 1,
  used_count      INTEGER       NOT NULL DEFAULT 0,
  is_single_use   BOOLEAN       NOT NULL DEFAULT TRUE,
  valid_from      TIMESTAMPTZ,
  valid_until     TIMESTAMPTZ,
  is_active       BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_coupon_code UNIQUE (tenant_id, code)
);

-- ---------------------------------------------------------------------------
-- 7. coupon_usages — Kupon kullanım geçmişi
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.coupon_usages (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  coupon_id   UUID        NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  order_id    UUID,
  customer_id UUID        REFERENCES public.customers(id) ON DELETE SET NULL,
  discount    DECIMAL(12,2) NOT NULL,
  used_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 8. audit_logs — Sistem log/denetim kaydı
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id     UUID,
  action      VARCHAR(100) NOT NULL,
  entity      VARCHAR(100),
  entity_id   TEXT,
  old_data    JSONB,
  new_data    JSONB,
  ip_address  INET,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_tenant_time ON public.audit_logs (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON public.audit_logs (action);

-- ---------------------------------------------------------------------------
-- 9. staff_permissions — Personel özel yetki overrides
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff_permissions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL,
  permission  VARCHAR(100) NOT NULL,
  granted     BOOLEAN     NOT NULL DEFAULT TRUE,
  granted_by  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_staff_perm UNIQUE (tenant_id, user_id, permission)
);

-- ---------------------------------------------------------------------------
-- 10. backup_jobs — Yedekleme kayıtları
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.backup_jobs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        REFERENCES public.tenants(id) ON DELETE CASCADE,
  status      VARCHAR(20) NOT NULL DEFAULT 'pending'
    CONSTRAINT chk_backup_status CHECK (status IN ('pending','running','success','failed')),
  type        VARCHAR(30) NOT NULL DEFAULT 'full'
    CONSTRAINT chk_backup_type CHECK (type IN ('full','incremental','schema')),
  file_url    TEXT,
  size_bytes  BIGINT,
  error       TEXT,
  started_at  TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 11. whatsapp_orders — WhatsApp sipariş entegrasyonu
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_orders (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  phone       VARCHAR(50) NOT NULL,
  customer_id UUID        REFERENCES public.customers(id) ON DELETE SET NULL,
  raw_message TEXT        NOT NULL,
  parsed_items JSONB      NOT NULL DEFAULT '[]',
  status      VARCHAR(20) NOT NULL DEFAULT 'pending'
    CONSTRAINT chk_wa_status CHECK (status IN ('pending','confirmed','rejected','fulfilled')),
  order_id    UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 12. efatura_records — E-Fatura/E-Arşiv kayıtları
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.efatura_records (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id        UUID,
  fatura_no       VARCHAR(50),
  fatura_tipi     VARCHAR(20) NOT NULL DEFAULT 'EARCHIVE'
    CONSTRAINT chk_fatura_type CHECK (fatura_tipi IN ('EINVOICE','EARCHIVE')),
  status          VARCHAR(20) NOT NULL DEFAULT 'draft'
    CONSTRAINT chk_ef_status CHECK (status IN ('draft','pending','sent','accepted','rejected','cancelled')),
  provider        VARCHAR(50) NOT NULL DEFAULT 'entegra',
  payload         JSONB       NOT NULL DEFAULT '{}',
  response_data   JSONB,
  ettn            UUID,  -- GIB unique ETTN
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at         TIMESTAMPTZ
);

-- ---------------------------------------------------------------------------
-- GRANTS
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'product_barcodes','loyalty_programs','loyalty_accounts','loyalty_transactions',
    'campaigns','coupons','coupon_usages','audit_logs','staff_permissions',
    'backup_jobs','whatsapp_orders','efatura_records'
  ] LOOP
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', tbl);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', tbl);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.product_barcodes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_programs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_accounts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_usages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_permissions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_jobs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_orders     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.efatura_records     ENABLE ROW LEVEL SECURITY;

-- RLS Policies (tenant isolation)
CREATE POLICY s6_barcodes_all       ON public.product_barcodes    FOR ALL TO authenticated USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY s6_loyalty_prog_all   ON public.loyalty_programs    FOR ALL TO authenticated USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY s6_loyalty_acc_all    ON public.loyalty_accounts    FOR ALL TO authenticated USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY s6_loyalty_tx_all     ON public.loyalty_transactions FOR ALL TO authenticated USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY s6_campaigns_all      ON public.campaigns           FOR ALL TO authenticated USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY s6_coupons_all        ON public.coupons             FOR ALL TO authenticated USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY s6_coupon_uses_all    ON public.coupon_usages       FOR ALL TO authenticated USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY s6_audit_read         ON public.audit_logs          FOR SELECT TO authenticated USING (tenant_id = current_tenant_id() AND current_user_role() IN ('admin','manager'));
CREATE POLICY s6_audit_insert       ON public.audit_logs          FOR INSERT TO authenticated WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY s6_staff_perm_all     ON public.staff_permissions   FOR ALL TO authenticated USING (tenant_id = current_tenant_id() AND current_user_role() IN ('admin','manager')) WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY s6_backup_admin       ON public.backup_jobs         FOR ALL TO authenticated USING (tenant_id = current_tenant_id() AND current_user_role() IN ('admin','manager')) WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY s6_wa_orders_all      ON public.whatsapp_orders     FOR ALL TO authenticated USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY s6_efatura_all        ON public.efatura_records     FOR ALL TO authenticated USING (tenant_id = current_tenant_id() AND current_user_role() IN ('admin','manager')) WITH CHECK (tenant_id = current_tenant_id());

COMMIT;

-- DOĞRULAMA
SELECT table_name, '✓ OLUŞTURULDU' AS durum
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'product_barcodes','loyalty_programs','loyalty_accounts','loyalty_transactions',
    'campaigns','coupons','coupon_usages','audit_logs','staff_permissions',
    'backup_jobs','whatsapp_orders','efatura_records'
  )
ORDER BY table_name;
