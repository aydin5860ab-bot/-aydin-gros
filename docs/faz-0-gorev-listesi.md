# Aydın Gros OS — Faz 0 Görev Listesi
**Yazar:** Aydın Gros Geliştirme Ekibi  
**Tarih:** 27 Haziran 2026  
**Versiyon:** 1.0  
**Referans:** master-blueprint.md (38 bölüm)

---

## Faz 0 Nedir?

Faz 0, tek satır uygulama kodu yazmadan önce tamamlanması gereken **altyapı, ortam ve temel güvenlik** hazırlıklarıdır. Bu adımlar atlanırsa sonraki fazlarda büyük sorunlar çıkar. Her görev sırayla uygulanmalıdır. Acele edilmemeli.

**Süre:** 4–6 hafta (1 kişi ile çalışıyorsa)  
**Kritik kural:** Bir görev bitmeden bir sonrakine geçilmez.

---

## BÖLÜM A — Hesap ve Ortam Kurulumu

### A1. Supabase Projesi Oluştur
```
[ ] Supabase.com hesabı aç (ücretsiz plan yeterli başlangıç için)
[ ] Yeni proje oluştur: "aydingros-production"
[ ] Proje bölgesi: EU (West) veya EU (Frankfurt) — KVKK için Avrupa
[ ] Veritabanı şifresi: güçlü, güvenli sakla (password manager)
[ ] Supabase proje URL ve anon key not al
[ ] Service role key not al (ASLA client-side'da kullanılmayacak)
```

### A2. Vercel Proje Yapılandırması
```
[ ] Mevcut Vercel projesi kontrol et (zaten var: aydin-gros.vercel.app)
[ ] Vercel → Settings → Environment Variables:
    SUPABASE_URL=https://xxx.supabase.co
    SUPABASE_ANON_KEY=eyJhb...
    SUPABASE_SERVICE_ROLE_KEY=eyJhb... (gizli, sadece server-side)
    DATABASE_URL=postgresql://...
    NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
    NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhb...
[ ] Production, Preview, Development için ayrı .env.local dosyası
[ ] Hiçbir secret kod deposuna commit edilmeyecek
```

### A3. Git Deposu Temizliği
```
[ ] .gitignore kontrol et: .env*, .env.local ekli mi?
[ ] refactor-saas-foundation branch'i aktif mi? Kontrol et.
[ ] Gereksiz dosyaları main'e merge etmeden sil:
    old_index.html, original_index.html
    test_index.html, test_dump.html
    restore_emojis.js, restore_emojis2.js, restore_emojis3.js
[ ] Bu silme işlemi main'e değil, refactor branch'e yapılacak
```

### A4. Geliştirme Ortamı
```
[ ] Node.js 20+ LTS kurulu mu? node --version
[ ] npm veya pnpm hangisi kullanılacak? Karar ver. (Öneri: pnpm)
[ ] Next.js 15 için minimum gereksinimler kontrol edildi mi?
[ ] VS Code eklentileri: ESLint, Prettier, Tailwind IntelliSense
[ ] Supabase CLI kur: npm install -g supabase
    supabase --version ile doğrula
```

---

## BÖLÜM B — Veritabanı Şeması Tasarımı (SQL, Kod Değil)

### B1. Temel Tablo Listesini Onayla
```
[ ] master-blueprint.md Bölüm 3'teki 43 tabloyu listele
[ ] Her tablonun amacını bir cümleyle yaz
[ ] Faz 0'da hangi tabloların ZORUNLU olduğuna karar ver (çekirdek 15 tablo)
[ ] Hangi tabloların Faz 1'e ertelenebileceğini belirle
```

### B2. Faz 0 Çekirdek Tablo Listesi (Öneri)
```
Zorunlu (Faz 0'da hazır olacak):
[ ] tenants                 → SaaS izolasyonu için
[ ] users                   → Tüm kullanıcılar
[ ] roles / permissions     → Yetki yapısı
[ ] branches                → Şube bilgisi
[ ] products                → Ürün kataloğu
[ ] product_categories      → Kategoriler
[ ] stock                   → Anlık stok
[ ] stock_movements         → Stok hareketleri
[ ] orders                  → Siparişler
[ ] order_items             → Sipariş kalemleri
[ ] cash_sessions           → Kasa oturumu
[ ] cash_transactions       → Kasa hareketleri
[ ] audit_logs              → Denetim kaydı
[ ] settings                → Tenant ayarları
[ ] migrations (Supabase)   → Şema versiyonu

Faz 1'e ertelenebilir:
  customers, loyalty_transactions, coupons,
  campaigns, invoices, purchase_orders,
  suppliers, financial_transactions, ai_requests
```

### B3. SQL Şema Taslağı Hazırla
```
[ ] Her çekirdek tablo için CREATE TABLE SQL'i yaz
[ ] UUID primary key kullanıldığını doğrula (gen_random_uuid())
[ ] tenant_id her tabloda var mı? Kontrol et.
[ ] created_at DEFAULT now(), updated_at, deleted_at ekli mi?
[ ] İndeksler: tenant_id, foreign key'ler, sık sorgulanan alanlar
[ ] SQL taslağı: database/schema/v0001_initial.sql olarak kaydet
[ ] Kodu review et: SQL yazım hataları, eksik foreign key'ler
```

### B4. RLS (Row Level Security) Kuralları Taslağı
```
[ ] Her tablo için: ALTER TABLE x ENABLE ROW LEVEL SECURITY;
[ ] Temel RLS politikası taslağı:
    CREATE POLICY "tenant_isolation" ON products
    USING (tenant_id = current_setting('app.tenant_id')::UUID);
[ ] Service role için bypass politikası (admin işlemleri için)
[ ] RLS politikaları ayrı dosyaya: database/schema/v0002_rls.sql
```

### B5. Supabase'de Şemayı Uygula (Sadece Test Projesi)
```
[ ] Supabase local development kur:
    supabase init
    supabase start (Docker gerektirir)
[ ] SQL çalıştır: supabase db reset
[ ] Tabloların oluştuğunu Supabase Studio'da doğrula
[ ] RLS politikalarını kontrol et
[ ] Supabase Migration olarak kaydet:
    supabase migration new initial_schema
```

---

## BÖLÜM C — Mevcut Veri Yedekleme ve Analizi

### C1. JSONBlob'dan Tüm Veriyi Çek
```
[ ] api/db.js'teki JSONBlob URL'ini not al
[ ] Tarayıcıda GET isteği at: https://jsonblob.com/api/jsonBlob/019f0673...
[ ] Ham JSON'u kaydet: data/backup/jsonblob_raw_20260627.json
[ ] Kaydedilen dosyayı git'e commit ETME (production veri)
```

### C2. Mevcut Veri Sayımı
```
[ ] products collection: kaç kayıt?
[ ] orders collection: kaç kayıt?
[ ] stock collection: kaç kayıt?
[ ] promos collection: kaç kayıt?
[ ] settings collection: kaç kayıt?
[ ] campaigns collection: kaç kayıt?
[ ] invoices collection: kaç kayıt?
```

### C3. Veri Kalitesi Analizi
```
[ ] Tüm ürünlerin ID'si var mı? ID 1-185 (index.html) vs 186-236 (new-products.json)
[ ] Ürünlerde eksik alan var mı? (unit, cat, price, img)
[ ] erenler-products.json'daki 86 kayıt nerede? JSONBlob'da var mı?
[ ] Sipariş kayıtlarında: tarih, müşteri, tutar formatı tutarlı mı?
[ ] Stok kaydında şube bilgisi var mı? (Mevcut: sadece {"1": 50})
[ ] Analiz sonucunu yaz: data/analysis/data_quality_report.md
```

### C4. Migration Mapping Tablosu
```
[ ] Her mevcut alan → yeni tablo/kolon eşlemesi:
    Eski: {id, name, unit, cat, price, old, badge, btype, img, feat}
    Yeni: products.{id, name, unit, category_id, price, old_price, ...}
[ ] Eşleme tablosunu yaz: docs/migration-mapping.md
[ ] Kaybedilecek alanlar var mı? (badge, btype → UI'da tutulabilir)
```

---

## BÖLÜM D — Güvenlik Temizliği

### D1. Hardcoded Secret Temizliği (KRİTİK)
```
[ ] admin.html satır 1000: adminPass:'aydin2026'
    → Bu şifre GEÇERSİZ SAYILMALI
    → Yeni sistem için Supabase Auth kullanılacak
    → Mevcut admin şifresi kod deposundan KALDIRILACAK
    → NOT: admin.html değiştirilmeyecek (kırılabilir),
           sadece belgelenecek ve migration'da görmezden gelinecek

[ ] api/db.js satır 1: JSONBlob URL public mu?
    → JSONBlob URL public olduğu için bu zaten bilinen bir risk
    → Yeni sistemde tüm veri Supabase'e taşınacak
    → Mevcut URL değiştirilmeyecek (sistem bozulur)

[ ] .env.local oluştur — secrets buraya taşınacak (Faz 1)
[ ] Supabase service role key ASLA client koda girmeyecek
```

### D2. Supabase Auth Yapılandırması
```
[ ] Supabase Dashboard → Authentication → Settings
[ ] Email/Password provider: AÇIK
[ ] Magic Link: isteğe göre (opsiyonel)
[ ] JWT expire time: 15 dakika (access), 30 gün (refresh)
[ ] Site URL: https://aydin-gros.vercel.app
[ ] Redirect URLs: https://aydin-gros.vercel.app/auth/callback
[ ] Email şablonları Türkçe'ye çevir (opsiyonel Faz 0'da)
```

### D3. İlk Admin Kullanıcısı Oluştur
```
[ ] Supabase SQL Editor ile:
    INSERT INTO tenants (name, plan) VALUES ('Aydın Gros', 'professional');
    → tenant_id not al
[ ] Supabase Auth ile ilk admin kullanıcısı oluştur:
    Email: aydin5860.ab@gmail.com
    Güçlü şifre oluştur (password manager)
[ ] users tablosuna tenant_id ve rol ekle
[ ] 'aydin2026' şifresinin artık geçersiz olduğunu belgele
```

---

## BÖLÜM E — Next.js Proje Kurulumu (Altyapı Sadece)

### E1. Next.js 15 Projesi Oluştur
```
[ ] Mevcut index.html, admin.html dokunulmadan kalacak
[ ] Yeni Next.js projesi: "aydin-gros-app" klasörü veya proje root'u
[ ] Karar: Mevcut repo'ya mı entegre, ayrı repo mu?
    Öneri: Mevcut repo, /app klasörüne Next.js
[ ] pnpm create next-app@latest . --typescript --tailwind --app
[ ] Versiyon kilitle: package.json kontrol et
```

### E2. Temel Bağımlılıklar
```
[ ] @supabase/supabase-js ekle
[ ] @supabase/ssr ekle (Next.js SSR için)
[ ] zod ekle (veri doğrulama)
[ ] Diğer bağımlılıklar Faz 1'de eklenecek
[ ] pnpm install ile bağımlılıkları yükle
[ ] pnpm dev ile proje çalışıyor mu? Doğrula.
```

### E3. Supabase Client Yapılandırması
```
[ ] lib/supabase/client.ts → tarayıcı istemcisi
[ ] lib/supabase/server.ts → server-side istemci
[ ] lib/supabase/middleware.ts → middleware istemci
[ ] Ortam değişkenleri doğru okunuyor mu? Test et.
```

### E4. Proje Klasör Yapısı Oluştur
```
[ ] Aşağıdaki klasörleri oluştur (dosya değil, sadece klasör):
    app/
      (auth)/login/
      (dashboard)/
      api/
    components/
      ui/
      layout/
    lib/
      supabase/
      utils/
    database/
      schema/
      migrations/
    docs/           ← zaten var
    data/
      backup/
      analysis/
[ ] Her klasöre .gitkeep ekle (boş klasör için)
```

---

## BÖLÜM F — Temel Sayfa İskeleti (İçeriksiz)

### F1. Login Sayfası İskeleti
```
[ ] app/(auth)/login/page.tsx: sadece boş sayfa
[ ] Herhangi bir stil veya form YOK (Faz 1'de)
[ ] Sadece "Login sayfası buraya gelecek" metni
[ ] Vercel'e deploy et, çalışıyor mu? Kontrol et.
```

### F2. Dashboard İskeleti
```
[ ] app/(dashboard)/page.tsx: sadece boş sayfa
[ ] Auth kontrolü: Supabase session yoksa login'e yönlendir
[ ] Middleware.ts ile korunan route kurulumu
[ ] Test: Giriş olmadan /dashboard'a git → login'e yönlenir mi?
```

### F3. API Route İskeleti
```
[ ] app/api/health/route.ts: 200 OK dönen basit endpoint
[ ] Test: GET /api/health → {"status": "ok"} döner mi?
[ ] Bu endpoint Faz 1 boyunca canary test olarak kullanılacak
```

---

## BÖLÜM G — CI/CD ve Deploy

### G1. Vercel Deploy Testi
```
[ ] git push → Vercel otomatik deploy ediyor mu?
[ ] Preview URL çalışıyor mu?
[ ] Production URL (aydin-gros.vercel.app) bozulmadı mı?
[ ] Mevcut index.html ve admin.html hâlâ erişilebilir mi?
    (Strangler Fig: eski sistem çalışmaya devam ediyor)
```

### G2. Branch Stratejisi
```
[ ] main: sadece production deploy
[ ] refactor-saas-foundation: aktif geliştirme
[ ] feature/*: her görev için ayrı branch
[ ] Merge kuralı: PR açılır, review edilir, sonra merge
[ ] Hiçbir feature doğrudan main'e push edilmez
```

### G3. Temel Test Kurulumu
```
[ ] Faz 0'da sadece E2E yoklama testi:
    GET /api/health → 200 OK
    GET / → 200 OK
[ ] Playwright yüklenmesi Faz 1'de
[ ] pnpm test komutu var mı? package.json kontrol et.
```

---

## BÖLÜM H — Belgeleme ve Kural Çerçevesi

### H1. CLAUDE.md Oluştur (Proje Rehberi)
```
[ ] Proje root'una CLAUDE.md yaz (1 sayfa)
    İçerik:
      - Projenin amacı (1 paragraf)
      - Teknoloji yığını
      - Klasör yapısı
      - Geliştirme kuralları (kod yazmadan önce blueprint oku)
      - "Mevcut index.html ve admin.html'e dokunma"
      - Güvenlik kuralları (secret yok, RLS zorunlu)
[ ] CLAUDE.md git'e commit edilir
```

### H2. Görev Takip Sistemi
```
[ ] GitHub Projects veya Notion'da Faz 0 panosu oluştur
[ ] Her A1, A2... görevi bir kart olarak ekle
[ ] Durum: Yapılacak / Devam Ediyor / Tamamlandı
[ ] Her görev tamamlandığında kartı güncelle
```

### H3. Teknik Kararlar Belgesi
```
[ ] docs/decisions/ klasörü oluştur
[ ] Her önemli teknik karar için bir kayıt:
    ADR-001: Neden Supabase (ve Neon değil)?
    ADR-002: Neden pnpm (ve npm değil)?
    ADR-003: Neden multi-tenant shared DB (ayrı DB değil)?
[ ] Kararlar değişirse eski karar arşivlenir, yenisi eklenir
```

---

## FAZ 0 TAMAMLANMA KRİTERLERİ

Aşağıdakilerin tümü sağlanmadan Faz 1'e GEÇİLMEZ:

```
✅ Supabase projesi canlı, bağlantı test edildi
✅ Tüm ortam değişkenleri Vercel'e girildi, kod deposunda yok
✅ Çekirdek 15 tablo SQL olarak yazıldı ve test DB'de çalışıyor
✅ RLS politikaları yazıldı ve test edildi (tenant izolasyonu çalışıyor)
✅ Mevcut JSONBlob verisi yedeklendi ve kalite analizi yapıldı
✅ admin.html'deki hardcoded şifre belgelendi, geçersiz sayıldı
✅ İlk admin kullanıcısı Supabase Auth'da oluşturuldu
✅ Next.js 15 projesi ayağa kalktı (pnpm dev çalışıyor)
✅ Vercel'e deploy edildi, aydin-gros.vercel.app bozulmadı
✅ GET /api/health → 200 OK çalışıyor
✅ Auth koruması test edildi (giriş olmadan dashboard'a erişilemiyor)
✅ CLAUDE.md commit edildi
✅ Faz 1 görev listesi hazır
```

---

## FAZ 0 → FAZ 1 GEÇİŞ ONAY TOPLANTISI

Faz 0 tamamlandığında:

```
Gündem:
  1. Tüm tamamlanma kriterleri kontrol edilir
  2. Test DB'deki şema gözden geçirilir
  3. Veri kalitesi raporu incelenir
  4. Risk listesi güncellenir
  5. Faz 1 öncelik sırası kararlaştırılır

Faz 1'in ilk hedefi:
  → Ürün Kataloğu modülü (CRUD + fiyat geçmişi)
  → Mevcut ürünlerin JSONBlob → Supabase migration scripti
  → Admin login sayfası (gerçek auth)
```

---

## RİSK LİSTESİ (FAZ 0 ÖZELİNE)

| # | Risk | Etki | Önlem |
|---|------|------|-------|
| R1 | Supabase ücretsiz plan limitleri yetmez | Orta | Faz 0'da yeterli, Faz 1'de Pro plan |
| R2 | Vercel deploy mevcut sistemi bozar | Yüksek | Her deploy sonrası index.html test et |
| R3 | JSONBlob verisinde veri bozukluğu çıkar | Orta | Kalite analizi (C3) önce yapılır |
| R4 | Supabase bölge seçimi sonradan değiştirilemez | Düşük | Baştan EU seç |
| R5 | Docker gerektiren Supabase CLI kurulamaz | Düşük | Supabase Studio web ile devam |

---

*Bu belge Faz 0 boyunca güncel tutulacak. Her görev tamamlandığında `[x]` işaretlenecek.*  
*Belge değişikliği: git commit ile kayıt altına alınacak.*
