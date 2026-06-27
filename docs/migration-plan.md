# Aydın Gros — JSONBlob'dan Supabase'e Migration Planı

> Hazırlık tarihi: 27 Haziran 2026  
> Branch: refactor-saas-foundation  
> Kapsam: Sadece plan — hiçbir kod değişikliği içermez  
> Amaç: Mevcut sistem çalışmaya devam ederken paralelde yeni temel kurulacak

---

## Mevcut Veri Yapısı (JSONBlob)

JSONBlob'da tek bir JSON nesnesi var. İçindeki koleksiyonlar:

```
{
  "products"  → Dizi (admin panelden yönetilen ürünler)
  "orders"    → Dizi (siparişler)
  "promos"    → Nesne (kupon kodları)
  "settings"  → Nesne (site ayarları)
  "campaigns" → Dizi (kampanyalar)
  "stock"     → Nesne (stok seviyeleri)
  "invoices"  → Dizi (faturalar/gider kayıtları)
}
```

### Mevcut Alan Haritası

**products** dizisindeki her ürün:
```json
{
  "id": 1,
  "name": "Salkım Domates",
  "unit": "1 kg",
  "cat": "manav",
  "price": 24,
  "old": null,
  "badge": "TAZE GÜNLÜK",
  "btype": "badge-green",
  "img": "https://images.unsplash.com/...",
  "feat": true
}
```

**settings** nesnesi:
```json
{
  "threshold": 1000,
  "waNumber": "905444789461",
  "announcements": "...",
  "branch1Name": "Geyras (Merkez) Şube",
  "branch1Addr": "Geyras Mah. Aydın Cad. No:1",
  "branch2Name": "Efeler Şube",
  "branch2Addr": "Efeler Mah. Gros Cad. No:5",
  "adminPass": "aydin2026"
}
```

**promos** nesnesi (kupon kodu → detay):
```json
{
  "AYDIN10": { "pct": 10, "gift": null, "text": "..." },
  "EKMEK":   { "pct": 0,  "gift": "Sıcak Somun Ekmek (Hediye)", "text": "..." }
}
```

**stock** nesnesi (ürün ID → stok miktarı):
```json
{
  "1": 50,
  "2": 30,
  "15": 0
}
```

---

## Hedef Veri Yapısı (Supabase / PostgreSQL)

Migration sonunda veriler şu tablolara dağılacak:

```
tenants          → Market kaydı (Aydın Gros)
branches         → Şubeler (Geyras Merkez, Efeler)
users            → Kullanıcılar (admin, müşteriler)
categories       → Ürün kategorileri
products         → Ürünler
product_prices   → Fiyatlar (kampanyalı/normal)
stock            → Şube bazlı stok seviyeleri
orders           → Siparişler
order_items      → Sipariş kalemleri
coupons          → Kuponlar (eski: promos)
coupon_usages    → Kupon kullanım geçmişi
campaigns        → Kampanyalar
invoices         → Fatura/gider kayıtları
settings         → Tenant ayarları
audit_logs       → Kim ne yaptı kaydı
```

---

## Adım Adım Migration Planı

### AŞAMA 0 — Hazırlık (Bu hafta, geliştirme başlamadan)

```
[ ] Supabase projesi oluştur (supabase.com — ücretsiz plan yeterli)
[ ] Vercel ortam değişkenlerine Supabase URL ve anon key ekle
[ ] Mevcut JSONBlob verisini dışa aktar ve yedekle (elle)
[ ] Migration script klasörü oluştur: scripts/migration/
[ ] Test ortamı için ayrı Supabase projesi oluştur (üretim verisini kirletmemek için)
```

JSONBlob'u elle nasıl yedeklersin:
1. Tarayıcıda şu URL'yi aç: `https://jsonblob.com/api/jsonBlob/019f0673-4992-7b6d-916a-3a0dd2181397`
2. Tüm JSON'u kopyala
3. `scripts/migration/jsonblob-backup-2026-06-27.json` olarak kaydet
4. Git'e ekle ve commit'le (hassas veri yoksa — şifre alanına dikkat)

⚠️ DİKKAT: `adminPass` alanı bu JSON içinde olabilir. Commit etmeden önce bu alanı sil ya da dosyayı .gitignore'a ekle.

---

### AŞAMA 1 — Veritabanı Şeması Kurulumu

Supabase'de SQL editörüyle şema oluşturulacak. Sıra önemli:

```
1. tenants tablosu
2. branches tablosu (tenant_id FK)
3. users tablosu (tenant_id FK, branch_id FK)
4. categories tablosu (tenant_id FK)
5. products tablosu (tenant_id FK, category_id FK)
6. product_prices tablosu (product_id FK, branch_id FK)
7. stock tablosu (product_id FK, branch_id FK)
8. coupons tablosu (tenant_id FK)
9. campaigns tablosu (tenant_id FK)
10. orders tablosu (tenant_id FK, branch_id FK, customer_id FK)
11. order_items tablosu (order_id FK, product_id FK)
12. invoices tablosu (tenant_id FK, branch_id FK)
13. audit_logs tablosu (tenant_id FK, user_id FK)
14. Row Level Security (RLS) policy'leri
```

Bu aşamada mevcut sistem dokunulmaz. Supabase tamamen ayrı bir servistir.

---

### AŞAMA 2 — Veri Dönüştürme Kuralları

Her koleksiyonun nasıl dönüştürüleceği:

#### 2.1 Tenant Kaydı (1 kayıt — elle girilecek)

```
Yeni tenant kaydı:
  id: (UUID — otomatik)
  name: "Aydın Gros"
  slug: "aydin-gros"
  plan: "starter"
  status: "active"
```

#### 2.2 Şubeler (settings → branches)

Mevcut `settings` nesnesindeki 2 şube:

```
branch1Name + branch1Addr → branches tablosuna 1. kayıt
  id: (UUID)
  tenant_id: (Aydın Gros tenant ID)
  name: "Geyras (Merkez) Şube"
  address: "Geyras Mah. Aydın Cad. No:1"
  is_active: true

branch2Name + branch2Addr → branches tablosuna 2. kayıt
  id: (UUID)
  tenant_id: (Aydın Gros tenant ID)
  name: "Efeler Şube"
  address: "Efeler Mah. Gros Cad. No:5"
  is_active: true
```

#### 2.3 Kullanıcılar (settings.adminPass → users)

```
settings.adminPass ("aydin2026") → users tablosuna admin kaydı
  id: (UUID)
  tenant_id: (Aydın Gros ID)
  email: "admin@aydin-gros.com" (belirlenecek)
  password_hash: bcrypt("aydin2026") → yeni şifre belirlemek daha iyi
  name: "Admin"
  role: "tenant_admin"
  is_active: true

⚠️ Bu adımda eski şifreyi KULLANMA. Yeni güçlü bir şifre belirle.
   Eski şifre kaynak kodda açık kaldı — artık güvenli değil.
```

#### 2.4 Kategoriler (cat alanı → categories)

Mevcut `cat` değerleri benzersiz olarak çıkarılır, kategori tablosuna eklenir:

```
"manav"        → { name: "Manav",              emoji: "🥬", sort_order: 1 }
"temel-gida"   → { name: "Temel Gıda",         emoji: "🧺", sort_order: 2 }
"sut-sarkuteri"→ { name: "Süt & Şarküteri",    emoji: "🧀", sort_order: 3 }
"kasap"        → { name: "Kasap",              emoji: "🥩", sort_order: 4 }
"atistirmalik" → { name: "Atıştırmalık",       emoji: "🍿", sort_order: 5 }
"icecek"       → { name: "İçecek",             emoji: "🥤", sort_order: 6 }
"temizlik"     → { name: "Temizlik",           emoji: "🧹", sort_order: 7 }
"kozmetik"     → { name: "Kozmetik",           emoji: "💄", sort_order: 8 }
"firın"        → { name: "Fırın",              emoji: "🥖", sort_order: 9 }
"dondurulmus"  → { name: "Dondurulmuş Gıda",  emoji: "❄️",  sort_order: 10 }
"ev-yasam"     → { name: "Ev & Yaşam",        emoji: "🏠", sort_order: 11 }
```

#### 2.5 Ürünler (products dizisi → products + product_prices)

Her ürün iki tabloya yazılır:

```
products tablosuna:
  id: (UUID — yeni, eski int ID ayrıca saklanır: legacy_id)
  tenant_id: (Aydın Gros ID)
  category_id: (categories tablosundan eşleştirme)
  name: product.name
  unit: product.unit
  image_url: product.img
  is_active: true
  is_featured: product.feat

product_prices tablosuna:
  product_id: (yukarıdaki UUID)
  branch_id: NULL (tüm şubeler için geçerli)
  price: product.price
  old_price: product.old (null ise null kalır)
  badge_text: product.badge (null ise null)
  valid_from: migration tarihi
  valid_until: NULL (süresiz)
```

**Toplam ürün sayısı: ~1084 kayıt**

İki kaynak var (dikkatli birleştirme gerekiyor):
- `index.html` içindeki JavaScript dizisi: ID 1-185 arası (orijinal ürünler)
- `new-products.json`: ID 186-236 arası (sonradan eklenen)

Çakışma kontrolü: Aynı isimde ürün varsa hangisi güncel? `new-products.json` daha güncel fiyat içeriyor gibi görünüyor.

#### 2.6 Stok (stock → stock tablosu)

Mevcut format: `{ "1": 50, "2": 30 }` (ürün integer ID → miktar)

```
Her kayıt için:
  product_id: (integer ID'den UUID'ye eşleştirme via legacy_id)
  branch_id: Merkez Şube ID (şube bilinmiyor — hepsini merkeze yaz)
  quantity: stok değeri
  min_threshold: 5 (varsayılan — sonra ayarlanır)

⚠️ Şu anki stok hangi şubeye ait bilinmiyor. 
   Tümü merkez şubeye atanacak, sonra elle düzeltilecek.
```

#### 2.7 Siparişler (orders → orders + order_items)

Mevcut sipariş yapısını önce incelemek gerekiyor (admin.html'den canlı çekme yapılacak). Muhtemel format:

```
orders tablosuna:
  order_number: eski sipariş numarası (veya yeniden sıralanır)
  tenant_id, branch_id: Merkez şube
  channel: "whatsapp"
  status: mevcut duruma göre (pending/delivered/cancelled)
  total: sipariş toplamı
  customer_name, customer_phone, delivery_address: mevcut alandan
  created_at: eski tarih korunur

order_items tablosuna:
  Her sepet kalemi ayrı satır
  unit_price: satış anındaki fiyat (değişmemeli)
```

**Önemli:** Tarihi siparişler salt okunur arşiv olarak taşınacak.
Aktif/bekleyen siparişler önce tamamlanacak, sonra migration yapılacak.

#### 2.8 Kuponlar (promos → coupons)

```
"AYDIN5"  → { code: "AYDIN5",  type: "percentage", value: 5,  is_active: true }
"AYDIN10" → { code: "AYDIN10", type: "percentage", value: 10, is_active: true }
"EKMEK"   → { code: "EKMEK",   type: "gift_product", ... }
"HEDIYE"  → { code: "HEDIYE",  type: "gift_product", ... }
"CIKO"    → { code: "CIKO",    type: "gift_product", ... }
"BEDAVA"  → { code: "BEDAVA",  type: "free_shipping", ... }
```

#### 2.9 Ayarlar (settings → tenant settings JSON alanı)

```
settings tablosu (veya tenant.settings JSON):
  delivery_threshold: 1000   (threshold)
  whatsapp_number: "905444789461"   (waNumber)
  announcements: "..."

⚠️ adminPass ASLA taşınmaz. Yeni sisteme şifre Supabase Auth üzerinden girilecek.
```

#### 2.10 Faturalar (invoices → invoices)

Mevcut yapı bilinmiyor — migration öncesi incelenecek. Muhtemelen:
```
  description, amount, date, type → doğrudan taşınır
  branch_id: Merkez (bilinmiyorsa)
```

---

### AŞAMA 3 — Migration Script Yazımı

`scripts/migration/` klasöründe şu scriptler yazılacak:

```
01-export-jsonblob.js     → JSONBlob'u çekip local JSON'a kaydeder
02-transform-products.js  → Ürünleri yeni formata dönüştürür
03-transform-orders.js    → Siparişleri dönüştürür
04-transform-stock.js     → Stoğu dönüştürür
05-transform-coupons.js   → Kuponları dönüştürür
06-import-supabase.js     → Dönüştürülmüş veriyi Supabase'e yükler
07-verify-migration.js    → Kayıt sayılarını karşılaştırır, eksik kontrol eder
```

Her script bağımsız çalışmalı ve log dosyası üretmeli.

---

### AŞAMA 4 — Doğrulama (Verification)

Migration sonrası kontroller:

```
[ ] products: Kayıt sayısı eşleşiyor mu? (JSONBlob vs Supabase)
[ ] orders: Tüm siparişler taşındı mı?
[ ] stock: Ürün ID eşleştirmeleri doğru mu?
[ ] coupons: 6 kupon kodu var mı?
[ ] branches: 2 şube var mı?
[ ] categories: 11 kategori var mı?
[ ] admin girişi çalışıyor mu? (yeni şifreyle)
[ ] Ürün listesi web sitesinde görünüyor mu?
[ ] Stok seviyeleri doğru görünüyor mu?
```

---

### AŞAMA 5 — Kesinti Planı (Zero Downtime)

```
Mevcut sistem: JSONBlob üzerinde çalışmaya devam eder
Yeni sistem:   Paralelde geliştirilir

Geçiş günü akışı:
  1. Siparişler için sessiz saat seç (gece 02:00 gibi)
  2. Son JSONBlob backup'ı al
  3. Migration scriptleri çalıştır
  4. Doğrulama adımlarını tamamla
  5. Vercel environment variable'larını güncelle (JSONBlob URL → Supabase URL)
  6. Vercel'de yeni deployment tetikle
  7. 15 dakika izle
  8. Sorun varsa eski URL'ye geri al (1 değişiklik)
```

Geri alma süresi: 2 dakika (sadece env variable değişikliği)

---

## Önerilen Klasör Yapısı

```
AYDIN GROS/
│
├── 📁 docs/                        ← Mimari ve teknik belgeler
│   ├── migration-plan.md           ← Bu belge
│   ├── architecture.md             ← Genel sistem mimarisi
│   ├── database-schema.md          ← Veritabanı tablo tanımları
│   └── api-spec.md                 ← API endpoint tanımları
│
├── 📁 scripts/                     ← Araç scriptleri (çalıştırılabilir)
│   ├── migration/                  ← JSONBlob → Supabase migration
│   │   ├── 01-export-jsonblob.js
│   │   ├── 02-transform-products.js
│   │   └── ... (yukarıdaki liste)
│   └── seed/                       ← Test verisi üretimi
│       └── seed-categories.sql
│
├── 📁 frontend/                    ← Yeni Next.js uygulaması (ileride)
│   ├── app/                        ← Next.js App Router
│   ├── components/
│   ├── lib/
│   └── package.json
│
├── 📁 backend/                     ← API katmanı (ileride)
│   ├── api/                        ← Route handler'lar
│   ├── lib/                        ← Supabase client, helpers
│   └── types/                      ← TypeScript tip tanımları
│
├── 📁 database/                    ← Veritabanı şema dosyaları
│   ├── schema.sql                  ← Tüm CREATE TABLE ifadeleri
│   ├── rls-policies.sql            ← Row Level Security kuralları
│   ├── seed.sql                    ← Başlangıç verileri
│   └── migrations/                 ← Sürümlü değişiklikler
│       └── 001-initial-schema.sql
│
├── 📁 api/                         ← Mevcut Vercel API (dokunma)
│   └── db.js                       ← Şu an çalışıyor, korunuyor
│
├── index.html                      ← Mevcut site (korunuyor)
├── admin.html                      ← Mevcut admin (korunuyor)
├── server.js                       ← Local geliştirme (korunuyor)
└── .gitignore                      ← Güncellenecek
```

---

## Riskler ve Dikkat Edilecek Noktalar

### KRİTİK RİSKLER

**R1 — İki Kaynak Arası Ürün Çakışması**
```
Durum: index.html içinde ID 1-185 arası orijinal ürünler var.
       new-products.json'da ID 186-236 arası başka format var.
       erenler-products.json'da ID/birim yok, sadece ad/fiyat/kategori.

Risk: Migration sırasında hangisi "gerçek" katalog bilinmiyor.
      Fiyatlar farklı olabilir (index.html ile new-products.json).

Çözüm: Migration öncesi admin panelden canlı veriyi çek
        (/api/db çağrısı) — bu kesin güncel kaynaktır.
        index.html içindeki dizi sadece fallback, asıl veri JSONBlob'da.
```

**R2 — Stok Hangi Şubeye Ait Bilinmiyor**
```
Durum: stock nesnesi sadece { "ürün_id": miktar } içeriyor.
       Hangi şubeye ait olduğu kaydedilmemiş.

Risk: İki şube var — stok yanlış şubeye atanabilir.

Çözüm: Tümünü "Merkez Şube" olarak al. Migration sonrası
        Efeler şubesi için ayrıca stok girişi yapılacak.
        Bu bir veri kalitesi problemi, kayıp değil.
```

**R3 — Sipariş Geçmişinde Müşteri Bilgisi Eksik Olabilir**
```
Durum: Müşteri kaydı sistemi localStorage'da.
       Siparişlerde müşteri bilgisi WhatsApp'tan alınan metin olabilir.

Risk: Eski siparişler "müşterisiz" veya tutarsız formatta gelebilir.

Çözüm: Eski siparişler arşiv olarak taşınır, müşteri eşleştirmesi
        yapılmaz. Yeni sisteme geçilince tüm siparişler düzgün müşteri
        kaydıyla işlenir.
```

**R4 — JSONBlob Erişimi Sırasında Veri Değişebilir**
```
Durum: Migration scriptleri çalışırken admin panelden değişiklik
        yapılırsa, export ettiğimiz snapshot ile gerçek veri ayrışır.

Çözüm: Migration günü admin paneli geçici olarak kapat.
        "Sistem bakımda" mesajı göster (admin.html'de küçük JS ile).
        Migration 30-60 dakika sürer, sonra yeniden açılır.
```

### ORTA RİSKLER

**R5 — Resim URL'leri Unsplash'ten**
```
Durum: Tüm ürün görselleri Unsplash URL'leri.
       Bu URL'ler zamanla kırılabilir veya yavaşlayabilir.

Risk: Migration sonrası görsel sorunları.

Çözüm: Migration sırasında görselleri indir, Supabase Storage'a yükle.
        Bu işlem isteğe bağlı — acil değil ama yapılmalı.
```

**R6 — Kampanya Yapısı Bilinmiyor**
```
Durum: campaigns dizisinin içeriği analiz edilmedi.
       Mevcut kampanyalar varsa formatları bilinmiyor.

Çözüm: Migration öncesi /api/db?coll=campaigns çağrısıyla
        gerçek veriyi incele ve buna göre dönüşüm yaz.
```

**R7 — Fatura Yapısı Bilinmiyor**
```
Durum: invoices dizisinin formatı analiz edilmedi.
       Gider kayıtları farklı formatta tutulmuş olabilir.

Çözüm: invoices endpoint'ini migration öncesi incele.
```

### DÜŞÜK RİSKLER

**R8 — Eski Integer ID → UUID Geçişi**
```
Durum: Mevcut sistemde ürün ID'leri integer (1, 2, 3...).
       Yeni sistemde UUID kullanılacak.

Risk: Eski sipariş kayıtlarında ürün ID referansları integer.
      UUID eşleştirmesi yapılmazsa sipariş kalemleri kopuk kalır.

Çözüm: products tablosuna legacy_id kolonu eklenir.
        Eski siparişler legacy_id üzerinden eşleştirilir.
```

**R9 — localStorage Verisi Kaybı**
```
Durum: Bazı veriler (müşteri oturumları, sepet) yalnızca
        tarayıcı localStorage'ında.

Risk: Migration sonrası müşterilerin aktif sepeti kaybolur.

Çözüm: Kabul edilebilir. Yeni sisteme geçince kullanıcılar
        tekrar giriş yapar. Aktif siparişler zaten WhatsApp'ta.
```

---

## Migration Önce/Sonra Kontrol Listesi

### Migration Öncesi
- [ ] JSONBlob'dan tam veri export'u al ve yedekle
- [ ] Veri formatlarını kontrol et (campaigns, invoices)
- [ ] Supabase projesi kurulu ve erişilebilir
- [ ] Test ortamında migration denenmiş
- [ ] Rollback planı hazır (eski env variable not alınmış)
- [ ] Admin bildirimi: "X tarihinde kısa bakım"
- [ ] Aktif siparişler tamamlanmış veya not alınmış

### Migration Sırasında
- [ ] Script 01: JSONBlob export → başarılı
- [ ] Script 02: Ürün dönüşümü → kayıt sayısı eşleşiyor
- [ ] Script 03: Sipariş dönüşümü → başarılı
- [ ] Script 04: Stok dönüşümü → başarılı
- [ ] Script 05: Kupon dönüşümü → 6 kupon var
- [ ] Script 06: Supabase import → hata yok
- [ ] Script 07: Doğrulama → tüm kontroller yeşil

### Migration Sonrası
- [ ] Admin paneli yeni sistemle giriş yapılabildi
- [ ] Ürünler web sitesinde görünüyor
- [ ] Yeni sipariş oluşturulabildi (test siparişi)
- [ ] Stok güncelleme çalışıyor
- [ ] 24 saat izleme tamamlandı
- [ ] Eski JSONBlob verisi 30 gün daha sakla (acil durumda)

---

*Bu belge yaşayan bir dokümandır. Her migration adımı tamamlandıkça güncellenecektir.*
