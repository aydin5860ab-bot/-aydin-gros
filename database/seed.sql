-- ==============================================================================
-- AYDIN GROS OS - SUPABASE SEED DATA
-- ==============================================================================

-- 1. Subscription Plan (Önce plan oluşturulmalı)
INSERT INTO subscription_plans (id, name, price, features)
VALUES ('00000000-0000-0000-0000-000000000001', 'Pro', 999.99, '{"api": true, "hermes_ai": false}')
ON CONFLICT (id) DO NOTHING;

-- 2. İlk Tenant: Aydın Gros
INSERT INTO tenants (id, plan_id, name, slug, status)
VALUES ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000001', 'Aydın Gros', 'aydin-gros', 'active')
ON CONFLICT (slug) DO NOTHING;

-- 3. İlk Şube: Merkez Şube
INSERT INTO branches (id, tenant_id, name, is_active)
VALUES ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Merkez Şube', true)
ON CONFLICT (id) DO NOTHING;

-- 4. İlk Depo: Merkez Depo
INSERT INTO warehouses (id, tenant_id, name, is_active)
VALUES ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'Merkez Depo', true)
ON CONFLICT (id) DO NOTHING;

-- 5. İlk Kasa: Kasa 1
INSERT INTO registers (id, tenant_id, branch_id, name, type, is_active)
VALUES ('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'Kasa 1', 'pos', true)
ON CONFLICT (id) DO NOTHING;

-- ==============================================================================
-- 6. KULLANICI KAYIT PLANI VE ÖRNEK MANTIK
-- ==============================================================================
/*
Supabase Auth ve Users Tablosu Eşleşmesi:
Uygulama üzerinden bir kullanıcı oluşturulduğunda Supabase Auth (auth.users) tablosuna kayıt düşer.
Bu kayıt tetiklendiğinde (PostgreSQL Trigger aracılığıyla) public.users tablosuna aşağıdaki gibi otomatik kopyalanmalıdır:

-- Supabase Trigger Fonksiyonu Örneği (Manuel çalıştırılması gerekir):
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, tenant_id, branch_id, email, password_hash, full_name, role)
  VALUES (
    new.id, 
    (new.raw_user_meta_data->>'tenant_id')::uuid,
    (new.raw_user_meta_data->>'branch_id')::uuid,
    new.email,
    'handled_by_supabase_auth', -- Artık şifre auth tablosunda güvende
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'role'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

==============================================================================
ÖRNEK KULLANICI JSON METADATA (JWT İÇİN EKLENECEK CLAIMLER):
==============================================================================

-- Admin Kullanıcısı
{
  "tenant_id": "11111111-1111-1111-1111-111111111111",
  "role": "admin",
  "full_name": "Sistem Yöneticisi"
}

-- Şube Müdürü (Manager)
{
  "tenant_id": "11111111-1111-1111-1111-111111111111",
  "branch_id": "22222222-2222-2222-2222-222222222222",
  "role": "branch_manager",
  "full_name": "Şube Sorumlusu"
}

-- Kasiyer
{
  "tenant_id": "11111111-1111-1111-1111-111111111111",
  "branch_id": "22222222-2222-2222-2222-222222222222",
  "register_id": "44444444-4444-4444-4444-444444444444",
  "role": "cashier",
  "full_name": "1. Kasiyer"
}

-- Depo Görevlisi (Warehouse Person)
{
  "tenant_id": "11111111-1111-1111-1111-111111111111",
  "role": "warehouse_person",
  "full_name": "Depo Elemanı"
}

-- Müşteri (Customer)
{
  "tenant_id": "11111111-1111-1111-1111-111111111111",
  "role": "customer",
  "full_name": "Ali Veli Müşteri"
}
*/
