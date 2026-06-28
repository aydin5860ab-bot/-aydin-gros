# Aydın Gros OS - Supabase Kurulum Rehberi

Bu rehber, Aydın Gros OS projesinin yerel ortamdan Supabase (PostgreSQL) ortamına geçişini adım adım anlatmaktadır.

## 1. Supabase Proje Oluşturma
- Supabase Dashboard (https://app.supabase.com) üzerinden yeni bir proje oluşturun.
- Database şifrenizi güçlü belirleyin ve güvenli bir yere not edin.
- Proje (Database) oluştuktan sonra sol menüden **SQL Editor** sekmesine geçiş yapın.

## 2. Şemayı Yükleme (`schema.sql`)
- Projenizdeki `database/schema.sql` dosyasının içeriğini kopyalayın.
- Supabase SQL Editor'de yeni bir sorgu penceresi açıp yapıştırın.
- Sağ alttaki "Run" butonuna basarak tüm tabloların, fonksiyonların ve GIN indexlerinin oluşmasını sağlayın.

## 3. RLS Kurallarını Yükleme (`rls_policies.sql`)
- Projenizdeki `database/rls_policies.sql` dosyasının içeriğini kopyalayın.
- SQL Editor'de çalıştırarak Row Level Security (RLS) kurallarını devreye alın.
- **Dikkat:** Bu adım tamamlandığında, Supabase API üzerinden (anonim) gelen tüm sorgular reddedilecektir. Veritabanınız dışarıya karşı %100 kapanmış olacaktır.

## 4. Temel Verileri Eklemek (`seed.sql`)
- `database/seed.sql` dosyasındaki INSERT sorgularını SQL Editor'de çalıştırın.
- Bu işlem veritabanınıza test yapabilmeniz için şu ana ticari birimleri ekleyecektir:
  - 1 Adet Pro Plan
  - `11111111-1111-1111-1111-111111111111` ID'li Ana Tenant: **Aydın Gros**
  - `22222222-2222-2222-2222-222222222222` ID'li **Merkez Şube**
  - `33333333-3333-3333-3333-333333333333` ID'li **Merkez Depo**
  - `44444444-4444-4444-4444-444444444444` ID'li **Kasa 1**

## 5. Kullanıcı Yönetimi (JWT ve Auth Claims)
Supabase, kendi Authentication sistemini (auth.users tablosu) kullanır. Aydın Gros uygulamasından bir kullanıcı kaydederken (Sign-Up) Rol ve Şube kimliklerini de doğrudan token içerisine gömmeliyiz.

### JWT Custom Claims Nasıl Eklenir?
Uygulama içerisinden `supabase.auth.signUp()` çağrısı yaparken `options.data` kısmına RLS için gerekli verileri ekleyin:

```javascript
const { data, error } = await supabase.auth.signUp({
  email: 'admin@aydingros.com',
  password: 'guclu_sifre_123',
  options: {
    data: {
      tenant_id: '11111111-1111-1111-1111-111111111111',
      role: 'admin',
      full_name: 'Ana Yönetici'
    }
  }
})
```

Kasiyer kaydederken gereken JSON yapısı:
```json
{
  "tenant_id": "11111111-1111-1111-1111-111111111111",
  "branch_id": "22222222-2222-2222-2222-222222222222",
  "register_id": "44444444-4444-4444-4444-444444444444",
  "role": "cashier",
  "full_name": "Ahmet Kasiyer"
}
```
*Not: Bu işlem başarılı olduğunda `auth.jwt()->>'role'` RLS fonksiyonlarımız otomatik olarak bu token'dan değeri çekip veritabanı kapılarını açacaktır.*

### Otomatik Kullanıcı Eşleme (Trigger)
Supabase'de `auth.users` kayıtları oluştuğunda bizim yazdığımız `public.users` tablosuna da yansıması için `database/seed.sql` dosyasının içerisinde yorum satırı olarak bulunan `on_auth_user_created` trigger kodunu SQL Editör'de bir kereliğine çalıştırın.

## 6. Güvenlik ve RLS Test Sorguları
Kurulumun RLS tarafında başarılı olup olmadığını Supabase SQL Editor üzerinden sahte bir kimliğe (Mock User) bürünerek test edebilirsiniz:

```sql
-- Admin rolüyle kendi tenant ürünlerini okuma testi
BEGIN;

-- Anonim veya Authenticated olunduğu varsayılır
SET LOCAL role 'authenticated';

-- Sahte bir JWT token context'i oluşturulur
SET LOCAL request.jwt.claims = '{"role": "admin", "tenant_id": "11111111-1111-1111-1111-111111111111"}';

-- Admin yalnızca eşleşen ürünleri görecektir.
SELECT * FROM products; 

COMMIT;
```
Bunu çalıştırdığınızda tablo hatasız sorgulanıyorsa RLS kurulumunuz tamamlanmış demektir!
