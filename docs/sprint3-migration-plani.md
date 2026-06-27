# Sprint 3 — JSONBlob → Supabase Migration Planı
**Tarih:** 28 Haziran 2026  
**Kural:** Analiz belgesi. Sıfır kod değişikliği.

---

## BÖLÜM 1 — MEVCUT MİMARİ

```
[Tarayıcı]
  │
  ├─ index.html  →  fetchDb('products') / fetchDb('orders') / saveDb(...)
  │                    │
  ├─ admin.html  →  fetchDb(coll) / saveDb(coll) / initBackendData()
  │                    │
  │              POST/GET /api/db?coll=xxx
  │                    │
  └─ [Vercel Serverless]
       api/db.js        ──► JSONBlob PUT/GET (tek JSON dosyası)
                              https://jsonblob.com/api/jsonBlob/019f0673-...
```

**JSONBlob'daki koleksiyonlar (mevcut):**
| Koleksiyon | Mevcut durum | Kullanım yeri |
|------------|-------------|---------------|
| `products` | Neredeyse boş (localStorage master) | admin.html + index.html |
| `orders` | 2 test siparişi | admin.html + index.html |
| `promos` | Boş | admin.html |
| `settings` | Boş | admin.html |
| `campaigns` | Boş | admin.html |
| `stock` | Boş (localStorage master) | admin.html |
| `invoices` | Boş | admin.html |

---

## BÖLÜM 2 — DEĞİŞTİRİLECEK NOKTALAR

### 2.1 — `api/db.js`

| # | Satır | Eski Yapı | Yeni Supabase Yapısı | Risk |
|---|-------|-----------|----------------------|------|
| P1 | 2 | `const DB_URL = 'https://jsonblob.com/...'` | `import { createClient } from '@supabase/supabase-js'` | 🔴 KRİTİK — Bu dosyanın tamamı yeniden yazılacak |
| P2 | 7–13 | `GET /api/db?coll=xxx` → JSONBlob'dan tüm JSON çek, coll'u döndür | `GET /api/db?coll=products` → `supabase.from('products').select('*').eq('tenant_id', ...)` | 🔴 KRİTİK |
| P3 | 15–36 | `POST /api/db?coll=xxx` → JSONBlob'u oku, coll'u değiştir, geri yaz (read-modify-write) | `supabase.from(coll).upsert(data)` — atomik, race-condition yok | 🔴 KRİTİK |

**Koleksiyon → Supabase Tablo Eşlemesi:**

| JSONBlob coll | Supabase Tablo(lar) | Özel Not |
|---------------|---------------------|---------|
| `products` | `products` + `categories` | `cat` string → `category_id` UUID; `img` → `image_url` |
| `orders` | `orders` + `order_items` | Nested `items[]` → ayrı tablo |
| `promos` | `coupons` | Object map → rows; `{CODE:{pct,gift}}` → satır |
| `settings` | `tenant_settings` | Object map → key/value rows |
| `campaigns` | `campaigns` | Dizi → rows; `active` bool → `is_active` |
| `stock` | `stock` | `{id:{qty,min}}` map → rows; `branch_id` eklenir |
| `invoices` | `invoices` + `invoice_items` | Normalize edilecek |

---

### 2.2 — `admin.html`

| # | Satır | Eski Yapı | Yeni Supabase Yapısı | Risk |
|---|-------|-----------|----------------------|------|
| A1 | 1007–1013 | `fetchDb(coll, def)` → `fetch('/api/db?coll=...')` | `supabase.from(coll).select('*').eq('tenant_id', tid)` | 🔴 KRİTİK — Tüm veri okuma buradan geçiyor |
| A2 | 1014–1018 | `saveDb(coll, data)` → `fetch('/api/db?coll=...', POST)` | `supabase.from(coll).upsert(data)` | 🔴 KRİTİK — Tüm yazma buradan geçiyor |
| A3 | 1019–1028 | `initBackendData()` → 7 ayrı `fetchDb()` çağrısı | Tek `Promise.all([])` ile 7 paralel Supabase sorgusu | 🟡 ORTA — Mevcut sıralı yapı yavaş, yenisi paralel |
| A4 | 1034 | `saveProducts()` → `saveDb('products', products)` + localStorage | `supabase.from('products').upsert(products)` | 🔴 KRİTİK — 1084 ürün; batch upsert gerekir |
| A5 | 1035 | `saveOrders()` → `saveDb('orders', orders)` | `supabase.from('orders').upsert()` + `order_items` | 🔴 KRİTİK — Normalize edilmeli |
| A6 | 1036 | `savePromos()` → `saveDb('promos', promos)` | `supabase.from('coupons').upsert()` | 🟡 ORTA |
| A7 | 1037 | `saveCampaigns()` → `saveDb('campaigns', campaigns)` | `supabase.from('campaigns').upsert()` | 🟡 ORTA |
| A8 | 1038 | `saveStock()` → `saveDb('stock', stock)` | `supabase.from('stock').upsert()` (product_id+branch_id) | 🔴 KRİTİK — `{id:{qty,min}}` map → rows dönüşümü |
| A9 | 1039 | `saveInvoiceData()` → `saveDb('invoices', invoices)` | `supabase.from('invoices').upsert()` | 🟡 ORTA |
| A10 | 1041–1044 | `persistSettings()` → `saveDb('settings', settings)` | `supabase.from('tenant_settings').upsert()` | 🟢 DÜŞÜK |
| A11 | 1074–1075 | `doLogin()` → hardcoded `adminPass: 'aydin2026'` ile karşılaştırma | `supabase.auth.signInWithPassword({email, password})` | 🔴 KRİTİK — Güvenlik açığı; Supabase Auth zorunlu |
| A12 | 1713 | `fetch('/api/erenler-products')` | Bu endpoint mevcut değil — Sprint dışı | ⚪ KAPSAM DIŞI |
| A13 | 1947 | `fetch('/api/erenler-live?slug=...')` | Rakip fiyat çekme — Sprint dışı | ⚪ KAPSAM DIŞI |
| A14 | 1952 | `fetch('/api/save-erenler', POST)` | Rakip fiyat kaydetme — Sprint dışı | ⚪ KAPSAM DIŞI |

---

### 2.3 — `index.html`

| # | Satır | Eski Yapı | Yeni Supabase Yapısı | Risk |
|---|-------|-----------|----------------------|------|
| I1 | 2866–2872 | `fetchDb(coll, def)` → `fetch('/api/db?coll=...')` | `supabase.from(coll).select('*').eq('tenant_id', tid)` | 🔴 KRİTİK |
| I2 | 2873–2877 | `saveDb(coll, data)` → `fetch('/api/db?coll=...', POST)` | `supabase.from(coll).upsert(data)` | 🔴 KRİTİK |
| I3 | 2878–2900 | `syncBackend()` → products + stock + campaigns çekiyor | 3 paralel Supabase sorgusu; `products` için ilk yüklemede lazy load veya edge cache | 🟡 ORTA |
| I4 | 2901 | `setTimeout(syncBackend, 500)` | Sayfa yüklenince `supabase.auth.getSession()` → session varsa veriyi çek | 🟡 ORTA |
| I5 | 2903–2916 | `saveOrder()` → `fetchDb('orders')` + push + `saveDb('orders', ...)` (tüm siparişleri yeniden yaz) | `supabase.from('orders').insert(order)` + `supabase.from('order_items').insert(items)` | 🔴 KRİTİK — Race condition var: iki kullanıcı aynı anda sipariş verse ikincisi birincinin verisini siliyordu |
| I6 | 3609 | `saveDb('products', products)` → ürün düzenleme | `supabase.from('products').update({name,price,unit}).eq('id', id)` | 🟡 ORTA |

---

### 2.4 — `test_cors.html` (silinecek)

| # | Satır | Eski Yapı | Yeni Supabase Yapısı | Risk |
|---|-------|-----------|----------------------|------|
| T1 | 4 | `fetch('https://jsonblob.com/...')` doğrudan tarayıcıdan | Gereksiz — dosya tamamen silinecek | 🟢 DÜŞÜK |

---

## BÖLÜM 3 — VERİ DÖNÜŞÜM KURALLARI

### 3.1 — `products` (Koleksiyon → Tablo)

```
JSONBlob mevcut format:
  [{ id:1, name:"Salkım Domates", price:49.90, unit:"1 kg",
     cat:"manav", img:"https://..." }]

Supabase hedef (products tablosu):
  {
    id:           gen_random_uuid(),
    tenant_id:    <tenant_uuid>,
    category_id:  <categories.id WHERE slug='manav'>,
    sku:          "MNV0001",
    name:         "Salkım Domates",
    unit:         "1 kg",
    price:        49.90,
    image_url:    "https://...",
    legacy_id:    1,       ← orijinal index.html id
    is_active:    true
  }

Dönüşüm notu:
  - cat (string) → category_id (UUID) eşlemesi önce yapılmalı
  - id (integer) → legacy_id; yeni UUID üretilir
  - img → image_url; "photo-xxx" → tam Unsplash URL'e çevrilmeli
```

### 3.2 — `orders` (Koleksiyon → İki Tablo)

```
JSONBlob mevcut format:
  [{
    no: "AG-20260627-4832",
    name: "Ahmet",
    phone: "5551234567",
    addr: "Geyras Mah. No:1",
    items: [{id:1, name:"...", qty:2, price:49.90}],
    total: 99.80,
    ts: 1719475200000,
    status: 0
  }]

Supabase hedef:
  orders tablosu:
    { id, tenant_id, branch_id, order_number:"AG-20260627-4832",
      status:"pending", subtotal:99.80, total:99.80,
      delivery_address:"Geyras Mah...", created_at:<ts> }

  order_items tablosu:
    { order_id, product_id, product_name:"...", unit_price:49.90,
      quantity:2, total_price:99.80 }

Dönüşüm notu:
  - status 0/1/2 (integer) → order_status enum
    0=pending, 1=confirmed, 2=delivered
  - customer oluşturulacak: name+phone → customers tablosu
```

### 3.3 — `promos` (Object Map → Satırlar)

```
JSONBlob mevcut format:
  {
    "AYDIN5":  { pct:5,  gift:null },
    "AYDIN10": { pct:10, gift:null },
    "EKMEK":   { pct:0,  gift:"Sıcak Somun Ekmek" },
    "HEDIYE":  { pct:0,  gift:"Ülker Çikolatalı Gofret" }
  }

Supabase hedef (coupons tablosu):
  4 satır → type:'percentage' veya type:'gift'
```

### 3.4 — `stock` (Object Map → Satırlar)

```
JSONBlob mevcut format:
  { "1": {qty:50, min:5}, "2": {qty:30, min:3}, ... }
  (key = product legacy_id)

Supabase hedef (stock tablosu):
  { product_id:<UUID>, branch_id:<merkez_UUID>,
    quantity:50, reserved_quantity:0 }

Dönüşüm notu:
  - legacy_id üzerinden products.id bulunacak
  - Başlangıç stoğu fiziksel sayımdan sonra güncellenecek
  - Fiziksel sayım tamamlanana kadar bu data GÜVENILMEZ
```

### 3.5 — `settings` (Object → Key/Value Satırlar)

```
JSONBlob mevcut format:
  { threshold:1000, waNumber:"905444...", branch1Name:"...", adminPass:"aydin2026" }

Supabase hedef (tenant_settings tablosu):
  free_delivery_threshold  → "1000"
  whatsapp_number          → "905444789461"
  branch1_name             → "Geyras (Merkez) Şube"
  branch1_address          → "Geyras Mah. Aydın Cad. No:1"
  branch2_name             → "Efeler Şube"
  branch2_address          → "Efeler Mah. Gros Cad. No:5"
  adminPass                → TAŞINMAYACAK — Supabase Auth geçer
```

---

## BÖLÜM 4 — KRİTİK RİSKLER

| # | Risk | Açıklama | Önlem |
|---|------|----------|-------|
| R1 | Race condition | `saveOrder()`: fetchDb → push → saveDb sıralı; iki eşzamanlı sipariş birbirini siler | Supabase INSERT atomik — çözülür |
| R2 | Auth güvenliği | `adminPass:'aydin2026'` client-side hardcoded; herkes admin.html'i inceleyebilir | Supabase Auth zorunlu; parola kodu tamamen kaldırılacak |
| R3 | Ürün ID dönüşümü | 1084 ürün integer ID → UUID; order_items ve stock'ta cross-reference kırılabilir | `legacy_id` korunacak; migration sırasında map tablosu tutulacak |
| R4 | localStorage çakışması | products hem localStorage'da hem JSONBlob'da; hangisi master belirsiz | Supabase sonrası: Supabase = tek master; localStorage = cache |
| R5 | 1084 ürün ilk yükleme | Supabase'den 1084 ürün her sayfa yüklemesinde çekilirse yavaş | Pagination + kategoriye göre lazy load |
| R6 | Supabase key client-side | `SUPABASE_ANON_KEY` index.html'e yazılırsa risk; bu key public olabilir ama RLS şart | RLS politikaları aktif olmazsa tüm veriler açık |
| R7 | Vercel env | JSONBlob URL env değişken değil, hardcoded; Supabase URL de hardcoded yazılmamalı | `NEXT_PUBLIC_SUPABASE_URL` ve `NEXT_PUBLIC_SUPABASE_ANON_KEY` env'e |
| R8 | `/api/erenler-*` eksik | admin.html çağırıyor ama endpoint yok → 404; Supabase geçişinde düzeltilmeli | Sprint dışı bırakılacak; mevcut 404 korunuyor |

---

## BÖLÜM 5 — UYGULAMA SIRASI (Sprint 3 Görev Sırası)

```
Sprint 3A — Altyapı
  [1] Supabase projesi oluştur (aydin-gros)
  [2] Schema uygula: schema.sql çalıştır
  [3] Seed: tenant, branch, categories kayıtları gir
  [4] Supabase Auth: admin@aydin-gros.com oluştur
  [5] Vercel env: SUPABASE_URL + SUPABASE_ANON_KEY + SERVICE_ROLE_KEY

Sprint 3B — api/db.js yeniden yazımı
  [6] api/db.js → collection routing → Supabase table calls
  [7] Her koleksiyon için READ handler (GET /api/db?coll=...)
  [8] Her koleksiyon için WRITE handler (POST /api/db?coll=...)
  [9] Test: Postman veya curl ile her endpoint dene

Sprint 3C — Admin.html bağlantısı
  [10] initBackendData() → Supabase
  [11] saveProducts() → Supabase batch upsert
  [12] saveOrders() → Supabase normalized insert
  [13] Login → Supabase Auth

Sprint 3D — index.html bağlantısı
  [14] syncBackend() → Supabase
  [15] saveOrder() → Supabase INSERT (orders + order_items)

Sprint 3E — Veri Migrasyonu
  [16] 1084 ürün → products tablosu
  [17] Mevcut 2 sipariş → orders tablosu
  [18] Promos → coupons tablosu
  [19] Settings → tenant_settings tablosu

Sprint 3F — Test & Doğrulama
  [20] Admin panelinden ürün ekle/düzenle → Supabase'de gözlemle
  [21] index.html'den sipariş ver → orders tablosuna düştü mü?
  [22] Stok güncelle → stock tablosuna düştü mü?
  [23] RLS testi: farklı tenant verisi erişilemiyor mu?
```

---

## BÖLÜM 6 — DEĞİŞMEYECEK NOKTALAR

Aşağıdakiler Supabase geçişinden **etkilenmeyecek**:

| Alan | Neden etkilenmiyor |
|------|--------------------|
| 1084 ürün array (index.html ~1391) | localStorage fallback kalıyor; Supabase'den çekilemezse localStorage devreye girer |
| Ürün görsel URL'leri (Unsplash) | Sadece URL string; değişmiyor |
| WhatsApp mesaj formatı | Supabase'e bağlı değil |
| Sepet mantığı | Tamamen client-side; localStorage |
| UI / CSS / HTML yapısı | Değişmiyor |
| Kategori listesi (11 kategori) | Değişmiyor; sadece DB'ye taşınıyor |
| Promo hesaplama mantığı | Değişmiyor; sadece veri kaynağı değişiyor |

---

*Analiz belgesidir. Hiçbir kod değiştirilmedi.*  
*Tarih: 28 Haziran 2026*
