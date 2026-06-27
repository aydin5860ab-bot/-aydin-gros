# Aydın Gros — Veri Kalite Raporu
**Tarih:** 27 Haziran 2026  
**Hazırlayan:** Sistem Analizi (Otomatik + Manuel)  
**Amaç:** Supabase migration öncesi mevcut veri kalitesini belgelemek  
**Kural:** Salt okunur analiz. Hiçbir veri değiştirilmedi.

---

## EXECUTIVE SUMMARY

Mevcut sistem gerçek anlamda bir "veritabanına" sahip değil. JSONBlob neredeyse boş; tüm sistem index.html içindeki 1.084 ürünlük sabit JS dizisinin üzerinde çalışıyor. Stok takibi yok, ayarlar kodun içine gömülü, müşteri kaydı tutulmuyor. Migration'ın ana işi "veriyi taşımak" değil, "veriyi ilk kez doğru şekilde yapılandırmak" olacak.

---

## 1. VERİ KAYNAKLARI HARİTASI

| Kaynak | Konum | Kayıt | Format | Durum |
|--------|-------|-------|--------|-------|
| **İnline ürün dizisi** | `index.html` satır ~1391 | **1.084 ürün** (ID 1-1084) | JS array literal | **ANA KAYNAK** |
| `new-products.json` | Proje kökü | 51 ürün (ID 186-236) | JSON | Inline array'in alt kümesi (tekrar) |
| `erenler-products.json` | Proje kökü | 84 ürün | JSON | ID yok, unit yok, farklı şube? |
| **JSONBlob** | Bulut (jsonblob.com) | 2 sipariş | JSON blob | Neredeyse boş |
| `admin.html` DEFAULT_SETTINGS | `admin.html` satır ~995 | 7 alan | JS object literal | Hardcoded |
| `admin.html` DEFAULT_PROMOS | `admin.html` satır ~987 | 6 kupon kodu | JS object literal | Hardcoded |
| localStorage | Tarayıcı (istemci) | Bilinmiyor | JSON | Taşınamaz, erişilemez |

---

## 2. KOLEKSİYON SAYIMLARI

### 2.1 Products (Ürünler)
```
index.html inline array:  1.084 kayıt (ID 1 → 1.084, ardışık, boşluk yok)
new-products.json:           51 kayıt (ID 186-236) ← inline array'in alt kümesi
erenler-products.json:       84 kayıt (ID'siz)
JSONBlob products:            0 kayıt ← BOŞ
```

### 2.2 Orders (Siparişler)
```
JSONBlob orders:   2 kayıt
  AG-20260627-9749 → 27.06.2026 00:37 | 18,00 TL | ürün ID:2 x1 | durum:0
  AG-20260627-1256 → 27.06.2026 10:32 | 29,90 TL | ürün ID:17 x1 | durum:0
```

### 2.3 Stock (Stok)
```
JSONBlob stock:   {} — TAMAMEN BOŞ
```

### 2.4 Campaigns (Kampanyalar)
```
JSONBlob campaigns:  [] — TAMAMEN BOŞ
```

### 2.5 Promos/Coupons (Promosyonlar)
```
JSONBlob promos:  {} — TAMAMEN BOŞ
DEFAULT_PROMOS (admin.html hardcode):
  AYDIN5  → %5 indirim
  AYDIN10 → %10 indirim
  EKMEK   → Hediye Ekmek
  HEDIYE  → Hediye Ülker Çikolatalı Gofret
  CIKO    → Hediye Ülker Çikolatalı Gofret
  BEDAVA  → Ücretsiz teslimat
```

### 2.6 Settings (Ayarlar)
```
JSONBlob settings:  {} — TAMAMEN BOŞ
DEFAULT_SETTINGS (admin.html hardcode):
  threshold:     1.000 TL (ücretsiz teslimat eşiği)
  waNumber:      905444789461
  branch1Name:   Geyras (Merkez) Şube
  branch1Addr:   Geyras Mah. Aydın Cad. No:1
  branch2Name:   Efeler Şube
  branch2Addr:   Efeler Mah. Gros Cad. No:5
  adminPass:     aydin2026 ← KRİTİK GÜVENLİK AÇIĞI
```

### 2.7 Invoices (Faturalar)
```
JSONBlob invoices:  koleksiyon yok ← collection hiç oluşmamış
```

---

## 3. ÜRÜN KALİTE ANALİZİ (1.084 ÜRÜN)

### 3.1 Temel Alanlar
```
ID boşluğu (1-1084 arası):      YOK — ardışık
Fiyatı sıfır (0 TL) ürün:       0 adet ✅
Fiyatı boş (null) ürün:         0 adet ✅
Kategorisi boş ürün:             0 adet ✅
Görseli (img) olan ürün:    ~1.084 adet ✅ (Unsplash URL'leri)
```

### 3.2 Fiyat Aralığı
```
Minimum fiyat:   7,90 TL  (Derby Banyo Sabunu)
Maksimum fiyat:  1.690 TL (Dana Bonfile — kasap kategorisi)
```

### 3.3 Kategori Dağılımı (index.html)
```
manav:          163 ürün  (%15,0)
temel-gida:     134 ürün  (%12,4)
sut-sarkuteri:  123 ürün  (%11,3)
kozmetik:       114 ürün  (%10,5)
icecek:          95 ürün  (%8,8)
atistirmalik:    93 ürün  (%8,6)
temizlik:        88 ürün  (%8,1)
kasap:           86 ürün  (%7,9)
ev-gerecleri:    79 ürün  (%7,3)
kahvaltilik:     70 ürün  (%6,5)
anne-bebek:      39 ürün  (%3,6)
TOPLAM:       1.084 ürün
```

### 3.4 Duplicate İsimler ⚠️ KRİTİK
```
Aynı isimde birden fazla ürün: 76 farklı isimde tekrar var

En çok tekrarlananlar:
  'She Deodorant 150ml'     → 4 kez (ID 230, 332, 960, 1078)
                               Fiyatlar: 69,90 / 74,95 / 74,95 / 74,95 TL
  'Arko Nem Krem 250ml'     → 4 kez (ID 229, 333, 961, 1079)
                               Fiyatlar: 104,90 / 109,95 / 109,95 / 109,95 TL
  'Derby Banyo Sabunu'      → 4 kez (ID 231, 329, 957, 1075)
                               Fiyatlar: 7,90 / 8,95 / 8,95 / 8,95 TL
  'Maydanoz'                → 3 kez (ID 58, 244, 800)
                               Fiyatlar: 14,90 / 19,95 / 19,95 TL
  'Dana Bonfile'            → 3 kez (ID 180, 249, 824)
                               Fiyatlar: 349,90 / 1.690 / 1.690 TL
  'Enginar'                 → 3 kez (ID 133, 190, 791)
                               Fiyatlar: 64,90 / 59,90 / 69,95 TL

SORUN: Fiyat güncellemek yerine yeni ID ile aynı ürün eklenmiş.
        Sistemde fiyat geçmişi yok, sadece kopya ürün var.
KARAR GEREKLİ: Hangi kopyalar birleştirilecek, hangisi silinecek?
```

### 3.5 Yazım Hataları (Badge'lerde)
```
"DOŞAL" → "DOĞAL" olmalı (ID 75, 168, 170 civarı)
"SAŞLIKLI" → "SAĞLIKLI" olmalı (ID 171 civarı)
```

---

## 4. SİPARİŞ KALİTE ANALİZİ

### 4.1 2 Siparişin Detayı
```
Her iki siparişte:
  name:  "" (boş)     ← Müşteri adı kaydedilmemiyor
  phone: "" (boş)     ← Müşteri telefonu kaydedilmiyor
  addr:  "Belirtilmedi"  ← Adres kaydedilmiyor
  status: 0 (beklemede)  ← Hiç işlenmemiş

KAYIT: Sepeti WhatsApp'a gönderim sistemde order olarak kaydedilmiyor
       ya da çok nadir order oluşturuluyor.
```

### 4.2 Encoding Sorunu ⚠️
```
JSONBlob'daki sipariş ürün isimleri bozulmuş:
  'KÄ±vÄ±rcÄ±k SalatalÄ±k' → gerçek: 'Kıvırcık Salatalık'
  'Ä°Ã§im YarÄ±m YaÄlÄ± SÃ¼t' → gerçek: 'İçim Yarım Yağlı Süt'

SEBEP: api/db.js read-modify-write işlemi sırasında UTF-8 encoding kaybolmuş
RISK: Migration'da bu 2 sipariş doğrudan kopyalanamaz; Türkçe karakterler düzeltilmeli
```

### 4.3 Referans Bütünlüğü
```
Sipariş 1 → ürün ID:2 → index.html'de "Kıvırcık Salatalık" — MEVCUT ✅
Sipariş 2 → ürün ID:17 → index.html'de "İçim Yarım Yağlı Süt" — MEVCUT ✅
Stokta olmayan ürüne referans: SIFIR ✅
```

---

## 5. ERENLER-PRODUCTS.JSON ANALİZİ

```
Kayıt sayısı: 84 (not: başlangıçta 86 söylenmişti, gerçek: 84)
Alanlar:      name, price, cat (sadece 3 alan — ID yok, unit yok)

Ana listeyle isim eşleşmesi:
  43 / 84 → Ana listede (index.html) bulunan ürünler
  41 / 84 → Ana listede BULUNMAYAN ürünler (Efeler şubesine özel mi?)

Fiyat farkları: Eşleşen ürünlerde fiyatlar farklı
  Örnek: 'BİBER BAHÇE' → erenler: 74,95 TL, ana liste farklı
  
YORUM: Bu dosya büyük ihtimalle Efeler Şubesi için hazırlanmış
        farklı fiyatlı ürün listesi. Şube spesifik fiyatlandırma
        mevcut sistemde desteklenmiyor, bu yüzden ayrı dosya açılmış.
```

---

## 6. STOK ANALİZİ

```
JSONBlob stock: {} — TAMAMEN BOŞ

Mevcut sistemde gerçek stok takibi YOK.
Stok bilgisi localStorage'da browser bazlı tutulabilir,
ama sunucu tarafında sıfır stok verisi mevcut.

Migration'da: Tüm ürünler için başlangıç stoku sıfır
              ya da manuel olarak girilmeli.
```

---

## 7. SUPABASE MİGRATION RİSKLERİ

| # | Risk | Önem | Açıklama |
|---|------|------|----------|
| R1 | **Duplicate ürünler** | 🔴 KRİTİK | 76 isimde çift/üçlü ürün var. Migration öncesi hangi ID'nin "doğru" olduğuna karar verilmeli. |
| R2 | **Stok verisi yok** | 🔴 KRİTİK | Tüm stok sıfırdan manuel girilecek. İlk sayım zorunlu. |
| R3 | **Sipariş encoding bozukluğu** | 🟡 ORTA | 2 siparişin Türkçe karakterleri bozuk. Migration scripti UTF-8 fix yapmalı. |
| R4 | **Settings hardcoded** | 🟡 ORTA | Şube adları, WA numarası, eşik değerleri admin.html'de. Supabase'e manuel taşınmalı. |
| R5 | **Kupon kodları hardcoded** | 🟡 ORTA | 6 kupon kodu admin.html'de. Supabase'e manuel taşınmalı. |
| R6 | **adminPass güvenlik açığı** | 🔴 KRİTİK | 'aydin2026' plain text kodda. Supabase Auth'a geçildiğinde bu şifre geçersiz sayılmalı. |
| R7 | **new-products.json gereksiz** | 🟢 DÜŞÜK | ID 186-236 zaten inline array'de var. Bu dosya silinebilir. |
| R8 | **erenler-products.json eşleştirme** | 🟡 ORTA | 41 ürün ana listede yok. Efeler şubesi ürünü mü? Karar verilmeli. |
| R9 | **localStorage verisi taşınamaz** | 🟡 ORTA | Tarayıcıda kaydedilmiş ürün güncellemeleri/stok kayıpları. Sunucuya taşıma imkansız. |
| R10 | **Müşteri verisi yok** | 🟢 DÜŞÜK | 2 siparişin müşteri bilgisi boş. Tarihsel analiz için kullanılamaz. |

---

## 8. HANGİ VERİ MASTER KAYNAK KABUL EDİLMELİ?

```
KARAR: index.html inline JS array (1.084 ürün) MASTER KAYNAK'tır.

Gerekçe:
  ✅ JSONBlob'da product verisi yok (0 kayıt)
  ✅ Sistem localStorage yoksa bu array'i kullanıyor
  ✅ En güncel ve en kapsamlı veri buradadır
  ✅ ID'ler 1-1084 arasında ardışık ve eksiksiz

new-products.json → ARTIK GEREKLI DEĞİL (inline array'in kopyası)
erenler-products.json → EFELER ŞUBE verisinin ham hali olabilir,
                         ayrıca değerlendirilmeli

Sipariş verisi: JSONBlob'daki 2 sipariş migrate edilebilir
                (UTF-8 düzeltmesiyle)

Settings/Promos: admin.html'den manuel taşıma
```

---

## 9. MİGRATION ÖNCESİ DÜZELTME LİSTESİ

Aşağıdaki işlemler migration script çalışmadan önce tamamlanmalı:

### 9.1 Zorunlu (Engelleyici)
```
[ ] DUPLİKATLAR: 76 duplicate isimli ürün grubu için karar:
    - Aynı ürün farklı fiyat → tek kayda indir, eski fiyatı price_history'e aktar
    - Farklı boyut/ambalaj → isimler farklılaştırılmalı (örn: "Kivi 1kg" vs "Kivi 500g")
    Not: 1.084 üründen bazıları birleştirileceği için toplam sayı düşebilir

[ ] STARTİNG STOCK: Tüm ürünler için başlangıç stok miktarı belirlenmeli
    (Fiziksel sayım veya makul tahmin)

[ ] ADMİN ŞİFRESİ: 'aydin2026' geçersiz sayıldığı için Supabase Auth'da
    yeni şifre oluşturulmalı

[ ] ENCODING FİX: 2 siparişteki bozuk Türkçe karakterler düzeltilmeli
```

### 9.2 Önemli (Migration kalitesi için)
```
[ ] ERENLER ÜRÜNLER: 84 üründen 41 tanesi ana listede yok.
    Bunlar Efeler şubesi ürünleri mi? Sisteme eklenecek mi?
    Hangi şubeye atanacak?

[ ] AYARLAR: Şube bilgileri, WA numarası, threshold
    Supabase settings tablosuna manuel girilecek

[ ] KUPON KODLARI: 6 kupon migration scripti veya manuel giriş
```

### 9.3 Opsiyonel (Sonra yapılabilir)
```
[ ] BADGE YAZIM HATALARI: "DOŞAL" → "DOĞAL", "SAŞLIKLI" → "SAĞLIKLI"
[ ] new-products.json silinebilir (artık gereksiz)
[ ] SKT alanı eklenebilir (mevcut veride yok)
[ ] Barkod alanı eklenebilir (mevcut veride yok)
```

---

## 10. BACKUP DOSYALARI

Aşağıdaki dosyalar `data/backup/` klasörüne tarihli olarak kaydedildi:

```
data/backup/
├── jsonblob_raw_20260627.json       (1,8 KB)  ← JSONBlob tam içerik
├── admin_settings_20260627.json     (0,6 KB)  ← DEFAULT_SETTINGS (şifre REDACTED)
├── erenler-products_20260627.json   (5,5 KB)  ← Erenler ürün listesi
└── new-products_20260627.json      (10,9 KB)  ← ID 186-236 ürünler

NOT: index.html (359 KB, 1.084 ürün) zaten git'te yedeklenmiş durumda.
     Ayrıca backup/before-saas-refactor tag'i 717ea2c commit'ini işaret ediyor.
```

---

## ÖZET PUAN KARTI

| Kriter | Durum | Notlar |
|--------|-------|--------|
| Ürün sayısı | 1.084 ✅ | Kapsamlı katalog |
| ID bütünlüğü | ✅ TAMAM | 1-1084 ardışık, boşluk yok |
| Fiyat kalitesi | ✅ TAMAM | Sıfır/boş fiyat yok |
| Kategori kalitesi | ✅ TAMAM | Tüm ürünlerde dolu |
| Duplicate ürünler | ⚠️ SORUN | 76 isimde tekrar |
| Stok verisi | ❌ YOK | Sıfırdan başlanacak |
| Sipariş geçmişi | ❌ NEREDEYSE YOK | Sadece 2 sipariş |
| Müşteri verisi | ❌ YOK | 0 kayıt |
| Encoding kalitesi | ⚠️ SORUN | Sipariş alanlarında bozulma |
| Güvenlik | ❌ KRİTİK | adminPass hardcoded |
| Backend kullanımı | ❌ KULLANILMIYOR | JSONBlob neredeyse boş |

---

*Rapor hazırlanma tarihi: 27 Haziran 2026*  
*Sonraki adım: Duplicate ürünlerin manuel incelemesi + başlangıç stok kararı*
