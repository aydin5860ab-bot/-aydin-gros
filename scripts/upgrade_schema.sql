-- Kolon ekle (zaten eklenmiş olanlar atlanır)
ALTER TABLE categories ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_active boolean default true;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS display_order int default 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS price numeric default 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS legacy_id int;
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS metadata jsonb default '{}';
ALTER TABLE products ADD COLUMN IF NOT EXISTS tags text[];
ALTER TABLE products ADD COLUMN IF NOT EXISTS min_stock_level numeric default 0;

-- Erişim izni ver
GRANT ALL ON TABLE public.categories TO service_role;
GRANT ALL ON TABLE public.categories TO anon;
GRANT ALL ON TABLE public.categories TO authenticated;
GRANT ALL ON TABLE public.products TO service_role;
GRANT ALL ON TABLE public.products TO anon;
GRANT ALL ON TABLE public.products TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;

-- Doğrulama
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_name = 'categories' AND grantee = 'service_role';
