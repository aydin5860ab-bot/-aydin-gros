# AYDIN GROS OS — Master Blueprint
## Yazılım Anayasası v1.0

> Hazırlık: 27 Haziran 2026 | Branch: refactor-saas-foundation  
> Bu belge tamamlanmadan tek satır uygulama kodu yazılmaz.  
> Her mimari karar bu belgeden türetilir.

---

# İÇİNDEKİLER

1. Sistem Mimarisi
2. Modüller
3. Veritabanı ER Diyagramı
4. Kullanıcı Rolleri
5. Yetki Matrisi
6. Market İş Akışları
7. POS İş Akışları
8. Sipariş İş Akışları
9. Stok Hareketleri
10. Satın Alma Süreci
11. İade Süreci
12. Fire Süreci
13. Sayım Süreci
14. Kampanya Sistemi
15. Kupon Sistemi
16. Sadakat Puanı
17. Çok Şube Yapısı
18. Çok Kasa Yapısı
19. Tenant (SaaS) Yapısı
20. API Tasarımı
21. Veritabanı Şeması
22. Güvenlik Mimarisi
23. Audit Log Sistemi
24. Bildirim Sistemi
25. Backup ve Recovery
26. Performans Stratejisi
27. Mobil Uygulama Mimarisi
28. Yapay Zeka — Hermes AI Mimarisi
29. e-Fatura, POS ve Terazi Entegrasyon Planı
30. 2 Yıllık Geliştirme Yol Haritası

---

# BÖLÜM 1 — SİSTEM MİMARİSİ

## 1.1 Vizyon

Aydın Gros OS; tek şubeli küçük bir marketten başlayıp, çok şubeli, çok kasalı, çok kiracılı bir SaaS market zinciri yönetim platformuna dönüşebilecek şekilde tasarlanmış ticari bir yazılım sistemidir.

## 1.2 Katmanlı Mimari

```
┌─────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                    │
│  ┌─────────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │  Müşteri Web    │  │  Admin Panel │  │  POS Ekranı│ │
│  │  (Next.js SSR)  │  │  (Next.js)   │  │  (PWA)     │ │
│  └────────┬────────┘  └──────┬───────┘  └─────┬──────┘ │
└───────────┼──────────────────┼────────────────┼─────────┘
            │                  │                │
┌───────────▼──────────────────▼────────────────▼─────────┐
│                      API GATEWAY LAYER                   │
│         Next.js API Routes / Vercel Edge Functions       │
│    Authentication │ Rate Limiting │ Tenant Resolution    │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│                    BUSINESS LOGIC LAYER                  │
│  ┌──────────┐ ┌─────────┐ ┌────────┐ ┌───────────────┐ │
│  │ Stok     │ │ Sipariş │ │  Kasa  │ │   Kampanya    │ │
│  │ Servisi  │ │ Servisi │ │ Servis │ │   Servisi     │ │
│  └──────────┘ └─────────┘ └────────┘ └───────────────┘ │
│  ┌──────────┐ ┌─────────┐ ┌────────┐ ┌───────────────┐ │
│  │ Kullanıcı│ │ Raporlama│ │Bildirim│ │  Hermes AI   │ │
│  │ Servisi  │ │ Servisi │ │ Servis │ │   Servisi     │ │
│  └──────────┘ └─────────┘ └────────┘ └───────────────┘ │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│                      DATA LAYER                          │
│  ┌─────────────────────┐   ┌───────────────────────┐   │
│  │  PostgreSQL         │   │  Supabase Storage      │   │
│  │  (Supabase)         │   │  (Görseller, belgeler) │   │
│  │  Row Level Security │   └───────────────────────┘   │
│  └─────────────────────┘                                │
│  ┌─────────────────────┐   ┌───────────────────────┐   │
│  │  Upstash Redis      │   │  Resend (Email)        │   │
│  │  (Cache, Rate limit)│   │                        │   │
│  └─────────────────────┘   └───────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## 1.3 Teknoloji Yığını

| Katman | Teknoloji | Gerekçe |
|---|---|---|
| Frontend | Next.js 15 (App Router) | SSR/SSG, SEO, Vercel optimizasyonu |
| Stil | Tailwind CSS + shadcn/ui | Hız, tutarlılık, özelleştirilebilirlik |
| Tip sistemi | TypeScript | Hata önleme, refactor güvenliği |
| Veritabanı | PostgreSQL (Supabase) | ACID, RLS, gerçek zamanlı, ücretsiz başlangıç |
| Auth | Supabase Auth + JWT | Hazır, güvenli, çok kiracı desteği |
| Dosya depolama | Supabase Storage | Ürün görselleri, faturalar |
| Cache | Upstash Redis | Rate limiting, session cache, API cache |
| Email | Resend | Bildirimler, şifre sıfırlama |
| SMS | Netgsm (ileride) | Sipariş bildirimleri |
| Deploy | Vercel | Mevcut, otomatik CI/CD |
| AI | Claude API (Hermes) | Fiyat önerileri, stok tahminleri |
| Monitoring | Vercel Analytics + Sentry | Hata takibi, performans |

## 1.4 Çok Kiracılı (Multi-Tenant) Mimari Yaklaşımı

**Seçilen strateji: Shared Database + Row Level Security**

```
Tenant A (Aydın Gros)          Tenant B (Başka Market)
        │                               │
        ▼                               ▼
   [JWT Token]                     [JWT Token]
   tenant_id: A                    tenant_id: B
        │                               │
        └──────────────┬────────────────┘
                       ▼
              [PostgreSQL + RLS]
              Her sorgu otomatik
              tenant_id filtresi alır
              B, A'nın verisini göremez
```

## 1.5 Dağıtım Mimarisi

```
Kullanıcı
   │
   ▼
Vercel Edge Network (CDN + SSL)
   │
   ├── /              → Next.js müşteri sitesi (SSR)
   ├── /admin         → Next.js admin paneli (CSR, korumalı)
   ├── /pos           → Next.js POS ekranı (PWA, korumalı)
   └── /api/*         → Next.js API Routes
          │
          ├── Supabase (veritabanı)
          ├── Upstash Redis (cache)
          ├── Resend (email)
          └── Claude API (AI)
```

---

# BÖLÜM 2 — MODÜLLER

## 2.1 Modül Haritası

```
AYDIN GROS OS
│
├── 🏪 MAĞAZA MODÜLLERİ
│   ├── Ürün Kataloğu           → Ürün CRUD, fotoğraf, barkod
│   ├── Kategori Yönetimi       → Hiyerarşik kategoriler
│   ├── Fiyat Yönetimi          → Normal, kampanyalı, şubeye özel
│   └── Web Vitrin              → SEO, müşteri arayüzü
│
├── 🛒 SATIŞ MODÜLLERİ
│   ├── POS / Kasa              → Dokunmatik satış ekranı
│   ├── Online Sipariş          → Web üzerinden sipariş
│   ├── WhatsApp Entegrasyon    → Sipariş bildirimi
│   └── Kasa Oturumu            → Açılış/kapanış, Z raporu
│
├── 📦 STOK MODÜLLERİ
│   ├── Stok Takibi             → Anlık seviyeler
│   ├── Stok Hareketleri        → Tüm giriş/çıkışlar
│   ├── Satın Alma              → Tedarikçi alışları
│   ├── Transfer                → Şubeler arası
│   ├── Fire/İmha               → Bozulan ürünler
│   └── Sayım                   → Periyodik stok sayımı
│
├── 👥 KULLANICI MODÜLLERİ
│   ├── Kimlik Doğrulama        → Giriş, çıkış, oturum
│   ├── Rol Yönetimi            → Yetki atama
│   ├── Personel Yönetimi       → Kasiyer, müdür, depo
│   └── Müşteri Yönetimi        → Kayıtlı müşteriler
│
├── 🎁 PAZARLAMA MODÜLLERİ
│   ├── Kampanya Motoru         → İndirim kuralları
│   ├── Kupon Sistemi           → Kod bazlı indirimler
│   ├── Sadakat Puanı           → Puan kazanma/harcama
│   └── Duyuru Sistemi          → Müşteri bildirimleri
│
├── 📊 RAPORLAMA MODÜLLERİ
│   ├── Satış Raporları         → Günlük, haftalık, aylık
│   ├── Stok Raporları          → Kritik stok, hareketler
│   ├── Kasa Raporları          → Z raporu, fark analizi
│   ├── Personel Raporları      → Kasiyer performansı
│   └── Kar Marjı Analizi       → Ürün bazlı karlılık
│
├── 🏢 ORGANİZASYON MODÜLLERİ
│   ├── Çok Şube Yönetimi       → Şube bazlı operasyon
│   ├── Çok Kasa Yönetimi       → Kasa bazlı kontrol
│   └── Tedarikçi Yönetimi      → Tedarikçi kayıtları
│
├── 🔒 GÜVENLİK MODÜLLERİ
│   ├── Audit Log               → Her işlem kaydı
│   ├── Şüpheli İşlem Tespiti   → Anomali uyarıları
│   └── Yetki Denetimi          → Erişim kontrolü
│
├── 🤖 AI MODÜLLERİ (Hermes)
│   ├── Fiyat Öneri Motoru      → Rakip analizi + öneri
│   ├── Stok Tahmin             → Ne zaman sipariş verilmeli
│   ├── Satış Tahmini           → Dönemsel tahmin
│   └── Anomali Tespiti         → Olağandışı stok düşüşü
│
└── ⚙️ PLATFORM MODÜLLERİ
    ├── Tenant Yönetimi         → SaaS abonelik yönetimi
    ├── Bildirim Sistemi        → Email, SMS, push
    ├── Backup Sistemi          → Otomatik yedekleme
    └── Entegrasyon Katmanı     → e-Fatura, POS, Terazi
```

## 2.2 Modül Bağımlılık Haritası

```
Temel (hiçbir modüle bağımlı değil):
  Tenant → Branch → User → Category → Product

Orta katman (Temel'e bağımlı):
  Stock ← Product + Branch
  ProductPrice ← Product + Branch + Campaign
  Register ← Branch

Üst katman (Orta'ya bağımlı):
  Order ← Product + Stock + Register + Customer + Coupon
  StockMovement ← Stock + Order/Invoice
  CashTransaction ← Register + Order

Raporlama (hepsine bağımlı):
  DailyReport ← Order + CashTransaction + StockMovement
  AuditLog ← User + tüm tablolar
```

---

# BÖLÜM 3 — VERİTABANI ER DİYAGRAMI

## 3.1 Temel İlişkiler

```
TENANT (1)────────────────────(N) BRANCH
   │                                │
   │                                │
   (N)                              (N)
   │                                │
USER ──────assigned_branch──────────┘
   │
   │ (kasiyer olarak)
   ▼
REGISTER (N)────────────(1) BRANCH
   │
   │
   (N)
   │
CASH_SESSION
   │
   (N)
   │
CASH_TRANSACTION


TENANT (1)────────────────────(N) CATEGORY
TENANT (1)────────────────────(N) PRODUCT
CATEGORY (1)──────────────────(N) PRODUCT

PRODUCT (1)───────────────────(N) PRODUCT_PRICE
PRODUCT (1)───────────────────(N) STOCK          ←── per BRANCH
PRODUCT (1)───────────────────(N) STOCK_MOVEMENT ←── per BRANCH

ORDER (1)─────────────────────(N) ORDER_ITEM
ORDER_ITEM (N)────────────────(1) PRODUCT

ORDER ─── customer_id ────────(N/1) USER (customer role)
ORDER ─── branch_id  ────────(N/1) BRANCH
ORDER ─── register_id ───────(N/1) REGISTER (POS siparişi ise)

COUPON (1)────────────────────(N) COUPON_USAGE
COUPON_USAGE ── order_id ────(1) ORDER
COUPON_USAGE ── user_id  ────(1) USER

LOYALTY_ACCOUNT ─────────────(1) USER
LOYALTY_ACCOUNT (1)──────────(N) LOYALTY_TRANSACTION
LOYALTY_TRANSACTION ─ order_id → ORDER

SUPPLIER (N)──────────────────(1) TENANT
SUPPLIER (1)──────────────────(N) INVOICE
INVOICE (1)───────────────────(N) INVOICE_ITEM
INVOICE_ITEM ─ product_id ───(1) PRODUCT

AUDIT_LOG ── user_id ────────(1) USER
AUDIT_LOG ── tenant_id ──────(1) TENANT

NOTIFICATION ── user_id ─────(1) USER
```

## 3.2 Temel Tablolar Özet

```
┌────────────────────────────────────────────────────────────────┐
│  TENANT          BRANCH           REGISTER         USER        │
│  ─────────       ──────────       ────────          ──────      │
│  id (PK)         id (PK)          id (PK)           id (PK)    │
│  name            tenant_id(FK)    branch_id(FK)     tenant_id  │
│  slug            name             tenant_id(FK)     branch_id  │
│  plan            address          name              email       │
│  settings(json)  phone            type              password_h  │
│  status          is_active        is_active         role        │
│                                                     is_active   │
├────────────────────────────────────────────────────────────────┤
│  CATEGORY        PRODUCT          PRODUCT_PRICE     STOCK       │
│  ──────────       ───────          ─────────────     ─────      │
│  id (PK)         id (PK)          id (PK)           id (PK)    │
│  tenant_id       tenant_id        product_id(FK)    product_id  │
│  name            category_id      branch_id(FK)     branch_id   │
│  emoji           name             price             tenant_id   │
│  sort_order      unit             old_price         quantity    │
│  parent_id       barcode          badge_text        reserved_q  │
│                  image_url        valid_from        min_thresh  │
│                  is_active        valid_until       updated_at  │
│                  is_featured                                     │
├────────────────────────────────────────────────────────────────┤
│  ORDER           ORDER_ITEM       CASH_SESSION      CASH_TXN    │
│  ──────          ──────────       ────────────      ────────    │
│  id (PK)         id (PK)          id (PK)           id (PK)    │
│  order_number    order_id(FK)     register_id       session_id  │
│  tenant_id       product_id       branch_id         register_id │
│  branch_id       quantity         cashier_id        order_id    │
│  register_id     unit_price       opening_amt       type        │
│  customer_id     cost_price       closing_amt       method      │
│  channel         discount         expected_amt      amount      │
│  status          total            difference        cashier_id  │
│  payment_method                   opened_at         created_at  │
│  total                            closed_at                     │
│  created_at                       status                        │
└────────────────────────────────────────────────────────────────┘
```

---

# BÖLÜM 4 — KULLANICI ROLLERİ

## 4.1 Rol Hiyerarşisi

```
                    ┌─────────────────┐
                    │  SUPER ADMIN    │ ← SaaS platform sahibi
                    │  (Platform)     │   Tüm tenant'lara erişir
                    └────────┬────────┘
                             │
              ┌──────────────▼──────────────┐
              │       TENANT ADMIN          │ ← Market sahibi
              │    (Market Seviyesi)        │   Tüm şubelere erişir
              └──┬──────────────────────┬───┘
                 │                      │
    ┌────────────▼──────┐   ┌──────────▼──────────┐
    │  BRANCH MANAGER   │   │   BRANCH MANAGER    │
    │  (Şube A Müdürü)  │   │   (Şube B Müdürü)   │
    └──────┬────────────┘   └────────────┬─────────┘
           │                             │
      ┌────┴────┐                   ┌────┴────┐
      │         │                   │         │
   ┌──▼──┐  ┌──▼────┐           ┌──▼──┐  ┌──▼────┐
   │KAS- │  │ DEPO  │           │KAS- │  │ DEPO  │
   │İYER │  │ PERS. │           │İYER │  │ PERS. │
   └─────┘  └───────┘           └─────┘  └───────┘

Ayrı kanalda:
   ┌─────────────────┐
   │    CUSTOMER     │ ← Web sitesi müşterisi
   │ (Müşteri)       │   Admin panele erişemez
   └─────────────────┘
```

## 4.2 Rol Tanımları

| Rol | Kod | Kapsam | Açıklama |
|---|---|---|---|
| Platform Admin | `super_admin` | Tüm sistem | SaaS sahibi, destek, faturalandırma |
| Market Sahibi | `tenant_admin` | Tenant | Tüm şubeler, tüm raporlar, ayarlar |
| Şube Müdürü | `branch_manager` | Tek şube | Kendi şubesinin tüm operasyonu |
| Kasiyer | `cashier` | Atandığı kasa | Satış, iade, kasa açma/kapama |
| Depo Personeli | `warehouse` | Şube deposu | Stok giriş/çıkış, sayım |
| Müşteri | `customer` | Web sitesi | Sipariş verme, geçmiş görme |

## 4.3 Özel Durumlar

- Bir kullanıcı yalnızca bir role sahip olabilir
- `branch_manager` birden fazla şubeye atanabilir (ileride)
- `cashier` yalnızca bir kasaya atanır (vardiya bazlı)
- `tenant_admin` aynı zamanda kasiyer işlevi görebilir
- `customer` rol kaydı zorunlu değil — misafir sipariş açık olabilir

---

# BÖLÜM 5 — YETKİ MATRİSİ

## 5.1 Modül Bazlı Yetki Tablosu

Semboller: ✅ Tam erişim | 🔶 Kısıtlı | ❌ Erişim yok

```
MODÜL / İŞLEM              │S.ADM│T.ADM│B.MGR│KAS. │DEP. │MÜŞ.│
───────────────────────────┼─────┼─────┼─────┼─────┼─────┼────┤
ÜRÜN YÖNETİMİ              │     │     │     │     │     │    │
  Ürün ekleme/silme         │  ✅ │  ✅ │  ❌ │  ❌ │  ❌ │ ❌ │
  Ürün düzenleme            │  ✅ │  ✅ │  🔶*│  ❌ │  ❌ │ ❌ │
  Fiyat güncelleme          │  ✅ │  ✅ │  🔶†│  ❌ │  ❌ │ ❌ │
  Ürün görüntüleme          │  ✅ │  ✅ │  ✅ │  ✅ │  ✅ │ ✅ │
  Barkod yönetimi           │  ✅ │  ✅ │  ❌ │  ❌ │  🔶 │ ❌ │
───────────────────────────┼─────┼─────┼─────┼─────┼─────┼────┤
KATEGORİ YÖNETİMİ          │     │     │     │     │     │    │
  Kategori ekle/sil         │  ✅ │  ✅ │  ❌ │  ❌ │  ❌ │ ❌ │
  Kategori görüntüleme      │  ✅ │  ✅ │  ✅ │  ✅ │  ✅ │ ✅ │
───────────────────────────┼─────┼─────┼─────┼─────┼─────┼────┤
STOK YÖNETİMİ              │     │     │     │     │     │    │
  Stok görüntüleme          │  ✅ │  ✅ │  ✅ │  🔶‡│  ✅ │ ❌ │
  Stok manuel düzeltme      │  ✅ │  ✅ │  ✅ │  ❌ │  ✅ │ ❌ │
  Stok giriş (alış)         │  ✅ │  ✅ │  ✅ │  ❌ │  ✅ │ ❌ │
  Fire kaydı                │  ✅ │  ✅ │  ✅ │  ❌ │  ✅ │ ❌ │
  Transfer oluşturma        │  ✅ │  ✅ │  ✅ │  ❌ │  🔶 │ ❌ │
  Transfer onaylama         │  ✅ │  ✅ │  ✅ │  ❌ │  ❌ │ ❌ │
  Sayım başlatma            │  ✅ │  ✅ │  ✅ │  ❌ │  🔶 │ ❌ │
  Sayım girişi              │  ✅ │  ✅ │  ✅ │  ❌ │  ✅ │ ❌ │
  Sayım onaylama            │  ✅ │  ✅ │  ✅ │  ❌ │  ❌ │ ❌ │
───────────────────────────┼─────┼─────┼─────┼─────┼─────┼────┤
SİPARİŞ YÖNETİMİ           │     │     │     │     │     │    │
  Sipariş görüntüleme       │  ✅ │  ✅ │  ✅ │  ✅ │  ❌ │ 🔶§│
  Sipariş durum güncelleme  │  ✅ │  ✅ │  ✅ │  ✅ │  ❌ │ ❌ │
  Sipariş iptali (küçük)    │  ✅ │  ✅ │  ✅ │  🔶¶│  ❌ │ ❌ │
  Sipariş iptali (büyük)    │  ✅ │  ✅ │  ✅ │  ❌ │  ❌ │ ❌ │
  Sipariş notu ekleme       │  ✅ │  ✅ │  ✅ │  ✅ │  ❌ │ 🔶 │
───────────────────────────┼─────┼─────┼─────┼─────┼─────┼────┤
KASA YÖNETİMİ              │     │     │     │     │     │    │
  Kasa açma                 │  ✅ │  ✅ │  ✅ │  ✅ │  ❌ │ ❌ │
  Satış yapma               │  ✅ │  ✅ │  ✅ │  ✅ │  ❌ │ ❌ │
  İade yapma                │  ✅ │  ✅ │  ✅ │  ✅ │  ❌ │ ❌ │
  Satış iptali (küçük)      │  ✅ │  ✅ │  ✅ │  🔶¶│  ❌ │ ❌ │
  İndirim verme (düşük)     │  ✅ │  ✅ │  ✅ │  🔶#│  ❌ │ ❌ │
  İndirim verme (yüksek)    │  ✅ │  ✅ │  ✅ │  ❌ │  ❌ │ ❌ │
  Kasa kapanış              │  ✅ │  ✅ │  ✅ │  🔶 │  ❌ │ ❌ │
  Z raporu görüntüleme      │  ✅ │  ✅ │  ✅ │  🔶 │  ❌ │ ❌ │
  Kasalar arası para        │  ✅ │  ✅ │  ✅ │  ❌ │  ❌ │ ❌ │
───────────────────────────┼─────┼─────┼─────┼─────┼─────┼────┤
KULLANICI YÖNETİMİ         │     │     │     │     │     │    │
  Kullanıcı ekleme          │  ✅ │  ✅ │  🔶 │  ❌ │  ❌ │ ❌ │
  Kullanıcı silme           │  ✅ │  ✅ │  ❌ │  ❌ │  ❌ │ ❌ │
  Rol atama                 │  ✅ │  ✅ │  🔶 │  ❌ │  ❌ │ ❌ │
  Şifre sıfırlama           │  ✅ │  ✅ │  🔶 │  ❌ │  ❌ │ ❌ │
  Kendi profilini düzenleme │  ✅ │  ✅ │  ✅ │  ✅ │  ✅ │ ✅ │
───────────────────────────┼─────┼─────┼─────┼─────┼─────┼────┤
KAMPANYA / KUPON           │     │     │     │     │     │    │
  Kampanya oluşturma        │  ✅ │  ✅ │  ❌ │  ❌ │  ❌ │ ❌ │
  Kupon oluşturma           │  ✅ │  ✅ │  🔶 │  ❌ │  ❌ │ ❌ │
  Kupon görüntüleme         │  ✅ │  ✅ │  ✅ │  ✅ │  ❌ │ ❌ │
───────────────────────────┼─────┼─────┼─────┼─────┼─────┼────┤
RAPORLAMA                  │     │     │     │     │     │    │
  Tüm şubeler raporu        │  ✅ │  ✅ │  ❌ │  ❌ │  ❌ │ ❌ │
  Kendi şubesi raporu       │  ✅ │  ✅ │  ✅ │  ❌ │  ❌ │ ❌ │
  Kendi kasa raporu         │  ✅ │  ✅ │  ✅ │  ✅ │  ❌ │ ❌ │
  Stok raporu               │  ✅ │  ✅ │  ✅ │  ❌ │  ✅ │ ❌ │
  Personel raporu           │  ✅ │  ✅ │  ✅ │  ❌ │  ❌ │ ❌ │
  Karlılık analizi          │  ✅ │  ✅ │  ❌ │  ❌ │  ❌ │ ❌ │
───────────────────────────┼─────┼─────┼─────┼─────┼─────┼────┤
AYARLAR                    │     │     │     │     │     │    │
  Tenant genel ayarları     │  ✅ │  ✅ │  ❌ │  ❌ │  ❌ │ ❌ │
  Şube ayarları             │  ✅ │  ✅ │  ✅ │  ❌ │  ❌ │ ❌ │
  Bildirim ayarları         │  ✅ │  ✅ │  🔶 │  🔶 │  🔶 │ 🔶 │
  Entegrasyon ayarları      │  ✅ │  ✅ │  ❌ │  ❌ │  ❌ │ ❌ │
```

**Dipnotlar:**
- `*` Branch Manager ürün açıklamasını düzenleyebilir, kategori/barkod değiştiremez
- `†` Branch Manager yalnızca kendi şubesine özel fiyat override ekleyebilir
- `‡` Kasiyer yalnızca kendi şubesinin stok seviyesini görebilir
- `§` Müşteri yalnızca kendi siparişlerini görebilir
- `¶` Kasiyer küçük iptal için manager PIN'i girmek zorunda kalır
- `#` Kasiyer maksimum %5 indirim verebilir, üstü manager onayı

---

# BÖLÜM 6 — MARKET İŞ AKIŞLARI

## 6.1 Günlük Market Operasyon Döngüsü

```
SABAH (08:00 — Açılış)
───────────────────────
1. Şube müdürü sisteme giriş yapar
2. Her kasiyer kendi kasasını açar:
   a. Kasa seçilir
   b. Açılış nakit sayımı girilir
   c. Sistem kasa oturumu başlatır
3. Gece gelen siparişler (online) kontrol edilir
4. Kritik stok uyarıları incelenir
5. Günlük kampanyalar aktifleştirilir

GÜN İÇİ (08:00 — 22:00, Normal Operasyon)
──────────────────────────────────────────
Paralel akışlar:
  [POS Kanalı]     → Kasiyerler satış yapar
  [Online Kanal]   → Müşteriler web'den sipariş verir
  [WhatsApp]       → Siparişler WhatsApp'tan gelir
  [Stok]           → Depo personeli alış/çıkış yapar
  [İzleme]         → Müdür panel üzerinden izler

AKŞAM (22:00 — Kapanış)
────────────────────────
1. Son online sipariş alım saati belirlenir
2. Her kasiyer kasasını kapatır:
   a. Kapanış nakit sayımı girilir
   b. Sistem fark hesaplar
   c. Müdür onaylar
   d. Z raporu otomatik oluşur
3. Günlük rapor otomatik gönderilir (email)
4. Kritik stok bildirimleri gönderilir
5. Gece yedeklemesi başlar
```

## 6.2 Haftalık Rutin

```
PAZARTESİ  → Haftalık satış raporu incelenir
SALI       → Tedarikçi sipariş takibi
ÇARŞAMBA   → Stok sayımı (yüksek devir ürünler)
PERŞEMBE   → Kampanya planlaması (hafta sonu için)
CUMA       → Hafta sonu hazırlığı, stok takviyesi
CUMARTESİ  → Yoğun gün — ek kasiyer, artırılmış stok
PAZAR      → Tam stok sayımı (ayda bir zorunlu)
```

## 6.3 Aylık Rutin

```
Ayın 1'i    → Tam stok sayımı
             → Aylık rapor inceleme
             → Performans değerlendirme

Ayın 15'i   → Ara stok kontrolü
             → Tedarikçi fatura mutabakatı

Ayın sonu   → Kar/zarar hesabı
             → Bir sonraki ay kampanya planlaması
             → Personel performans değerlendirmesi
```

---

# BÖLÜM 7 — POS İŞ AKIŞLARI

## 7.1 Kasa Açılış Akışı

```
Kasiyer → Sisteme Giriş
   │
   ▼
Kasa Seçimi (atanmış kasalar listelenir)
   │
   ▼
Açılış Nakit Girişi
   │
   ├── Kasiyer kasadaki nakit sayar
   └── Tutarı girer (örn: ₺500)
   │
   ▼
Sistem Doğrulama
   │
   ├── Önceki oturum kapatılmış mı? → Evet: devam
   │                                 → Hayır: uyarı (müdür gerekli)
   │
   ▼
Kasa Oturumu Açılır
   │
   ├── cash_sessions tablosuna kayıt
   ├── Status: OPEN
   ├── opening_amount kaydedilir
   └── opened_at = şu an
   │
   ▼
Satış Ekranı Aktif
```

## 7.2 Satış Akışı (Normal)

```
Ürün Seçimi/Barkod Okuma
   │
   ▼
Sepete Ekleme (UI güncellenir, stok henüz düşmez)
   │
   ▼
Kupon/İndirim Uygulaması (opsiyonel)
   │
   ▼
Ödeme Alma
   │
   ├── Nakit
   │   ├── Alınan tutar girilir
   │   └── Para üstü hesaplanır
   │
   ├── Kart
   │   ├── Kart okutulur (entegrasyon ileride)
   │   └── Onay beklenir
   │
   └── Karma (nakit + kart)
   │
   ▼
Ödeme Onayı → Atomik İşlem Başlar
   │
   ├── 1. Stok düşürülür (her ürün için)
   ├── 2. Stok hareketi kaydedilir (type: sale)
   ├── 3. Sipariş oluşturulur
   ├── 4. Sipariş kalemleri oluşturulur
   ├── 5. Kasa işlemi kaydedilir
   ├── 6. Sadakat puanı eklenir (kayıtlı müşteri ise)
   └── 7. Audit log kaydedilir
   │
   ▼
Fiş Oluşturulur (dijital/yazıcı)
   │
   ▼
Yeni Satış İçin Hazır
```

## 7.3 Satış İptali Akışı

```
Kasiyer "İptal" düğmesine basar
   │
   ▼
Tutar Kontrolü
   │
   ├── ₺0 — ₺100 arası → Kasiyer iptal edebilir
   │                     (PIN gerekmez, log tutulur)
   │
   ├── ₺100 — ₺500 arası → Müdür PIN'i gerekli
   │                        Müdür PIN'ini girer
   │                        Log'a müdür adı işlenir
   │
   └── ₺500 üzeri → Tenant Admin onayı gerekli
                    Admin uygulama üzerinden onaylar
                    Log'a admin adı işlenir
   │
   ▼
İptal Nedeni Seçimi (zorunlu)
   ├── Müşteri vazgeçti
   ├── Fiyat hatası
   ├── Ürün bulunamadı
   └── Diğer (metin girişi)
   │
   ▼
Atomik Geri Alma
   ├── Stok geri eklenir
   ├── Stok hareketi (type: void)
   ├── Sipariş status: cancelled
   ├── Kasa işlemi (type: void)
   └── Audit log (iptal eden + onaylayan)
```

## 7.4 Kasa Kapanış Akışı

```
Kasiyer "Kasayı Kapat" düğmesine basar
   │
   ▼
Sistem X Raporu Gösterir (anlık durum):
   ├── Toplam satış: ₺X
   ├── Nakit satış: ₺X
   ├── Kart satışı: ₺X
   ├── İade toplamı: ₺X
   └── Net kasa tutarı (beklenen): ₺X
   │
   ▼
Kasiyer Kapanış Sayımı Girer
   │
   ▼
Fark Hesabı
   │
   ├── Fark = 0 veya tolerans içinde (₺5 altı)
   │   → Otomatik onay
   │
   ├── Fark > ₺5 ve < ₺100
   │   → Açıklama zorunlu (kasiyer girer)
   │   → Müdür onayı gerekli
   │
   └── Fark > ₺100
       → Ciddi uyarı
       → Müdür + Admin onayı
       → Audit log'a kırmızı işaret
   │
   ▼
Z Raporu Oluşur (geri alınamaz işlem)
   ├── Rapor PDF olarak saklanır
   ├── Müdüre email gönderilir
   └── Kasa status: CLOSED
```

---

# BÖLÜM 8 — SİPARİŞ İŞ AKIŞLARI

## 8.1 Sipariş Kanalları

```
┌─────────────────────────────────────────────────┐
│                 SİPARİŞ KANALLARI               │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │   WEB    │  │ WHATSAPP │  │     POS      │  │
│  │  Sitesi  │  │  (Müşt.) │  │   (Kasa)     │  │
│  └────┬─────┘  └────┬─────┘  └──────┬───────┘  │
│       │             │               │           │
│       └─────────────┴───────────────┘           │
│                     │                           │
│                     ▼                           │
│              MERKEZ SİPARİŞ MOTORUWait             │
│         (Ortak durum makinesi, loglama)         │
│                     │                           │
│        ┌────────────┴────────────┐              │
│        ▼                        ▼              │
│   TESLİMAT                  MAĞAZADAN          │
│   (Adrese)                  TESLIM             │
└─────────────────────────────────────────────────┘
```

## 8.2 Web Sipariş Akışı

```
Müşteri Web Sitesine Girer
   │
   ▼
Ürünleri Sepete Ekler
   │
   ▼
Adres Girişi / Seçimi
   │
   ├── GPS ile otomatik (Nominatim)
   └── Elle giriş
   │
   ▼
Teslimat Şubesi Belirlenir (adrese en yakın)
   │
   ▼
Sipariş Özeti Gösterilir
   │
   ▼
Ödeme Yöntemi Seçimi
   ├── Kapıda nakit
   ├── Kapıda kart
   └── Online (ileride — Stripe)
   │
   ▼
Sipariş Verilir
   │
   ├── Sistem stok kontrolü yapar (reserved_quantity artırılır)
   ├── Sipariş numarası üretilir (AG-2026-000001)
   ├── WhatsApp bildirimi tetiklenir (market'e)
   └── Müşteriye onay emaili gönderilir
   │
   ▼
Müşteri Takip Ekranında Durumu İzler
```

## 8.3 Sipariş Durum Makinesi

```
              [OLUŞTURULDU]
                   │
                   ▼
            [ONAYLANDI] ←─── Admin/Müdür onaylar
                   │
                   ▼
           [HAZIRLANIYOR] ←─ Depo/personel hazırlıyor
                   │
                   ▼
             [YOLDA] ←────── Kurye/araç çıktı
                   │
                   ▼
            [TESLİM EDİLDİ] (Terminal, başarılı)

Her aşamadan iptal edilebilir:
  [OLUŞTURULDU] → [İPTAL]
  [ONAYLANDI]   → [İPTAL] (müdür onayı)
  [HAZIRLANIY.] → [İPTAL] (admin onayı)
  [YOLDA]       → [İPTAL] (admin onayı + iade süreci)

İade:
  [TESLİM EDİLDİ] → [İADE TALEBİ] → [İADE ONAYLANDI] → [İADE TAMAMLANDI]
```

## 8.4 Sipariş Numaralandırma Sistemi

```
Format: AG-YYYY-NNNNNN
  AG     = Tenant kodu (her tenant farklı)
  YYYY   = Yıl
  NNNNNN = Sıralı numara (her yıl sıfırlanır, 6 hane)

Örnek: AG-2026-000001

Şube için: AGM-2026-000001 (M = Merkez)
           AGE-2026-000001 (E = Efeler)
```

---

# BÖLÜM 9 — STOK HAREKETLERİ

## 9.1 Hareket Tipleri ve Kurallar

```
Tip              │ Stok Etkisi │ Kim Yapabilir   │ Onay Gerekli?
─────────────────┼─────────────┼─────────────────┼──────────────
purchase         │ + (artış)   │ Depo, Müdür     │ Hayır
sale             │ - (azalış)  │ Sistem (otom.)  │ Hayır
void             │ + (geri)    │ Sistem (otom.)  │ İptal onayı
adjustment_plus  │ + (artış)   │ Depo, Müdür     │ Evet (müdür)
adjustment_minus │ - (azalış)  │ Depo, Müdür     │ Evet (müdür)
waste            │ - (azalış)  │ Depo, Müdür     │ Evet (müdür)
transfer_out     │ - (azalış)  │ Depo, Müdür     │ Evet (hedef)
transfer_in      │ + (artış)   │ Sistem (otom.)  │ Transfer onayı
return           │ + (artış)   │ Sistem (otom.)  │ İade onayı
internal_use     │ - (azalış)  │ Müdür           │ Evet (müdür)
initial          │ + (artış)   │ Admin, Müdür    │ Hayır
count_adjust     │ +/- (fark)  │ Sistem (sayım)  │ Evet (müdür)
```

## 9.2 Stok Hareketi Kaydının Zorunlu Alanları

Her stok hareketi kaydında şunlar bulunmalı:

```
- id: UUID (benzersiz kayıt kimliği)
- tenant_id, branch_id: hangi market, hangi şube
- product_id: hangi ürün
- user_id: işlemi yapan kişi (sistem ise null değil, sistem kullanıcısı)
- type: hareket tipi (yukarıdaki liste)
- quantity_change: değişim miktarı (+ veya -)
- quantity_before: işlem öncesi stok (anlık fotoğraf)
- quantity_after: işlem sonrası stok (anlık fotoğraf)
- reference_type: ilgili kaynak (order/invoice/transfer/count/manual)
- reference_id: kaynak kaydın UUID'si
- note: açıklama (fire için sebep, düzeltme için gerekçe vb.)
- created_at: zaman damgası (UTC)
```

## 9.3 Kritik Stok Uyarı Sistemi

```
Ürün stoğu min_threshold'ın altına düşünce:

Seviye 1 (sarı): Stok < min_threshold
  → Bildirim: Depo personeli + Müdür
  → Gösterge: Admin panelde sarı badge

Seviye 2 (turuncu): Stok < min_threshold / 2
  → Bildirim: Müdür + Admin (email)
  → Gösterge: Turuncu badge, liste başına çekilir

Seviye 3 (kırmızı): Stok = 0
  → Bildirim: Tüm yöneticiler (anlık)
  → Web sitesinde ürün "Stokta Yok" gösterilir
  → Otomatik satışa kapanır
```

## 9.4 Stok Tutarsızlık Önleme

```
Aynı anda 2 kasa aynı ürünü satmak istediğinde:

Kasa 1: "Ekmek x3 sat" isteği
Kasa 2: "Ekmek x2 sat" isteği (aynı anda)

Stok = 4 ekmek

PostgreSQL "SELECT FOR UPDATE" ile:
  → Kasa 1'in isteği önce işlenir: 4-3 = 1 ekmek kalır
  → Kasa 2'nin isteği: 1 < 2, YETERSİZ STOK hatası verilir
  → Kasa 2 kasiyerine: "Ekmek stoğu yetersiz (1 adet kaldı)"

Hiçbir zaman negatif stok oluşmaz.
```

---

# BÖLÜM 10 — SATIN ALMA SÜRECİ

## 10.1 Tedarikçi Tanımı

```
Tedarikçi kaydında bulunması gerekenler:
- Şirket adı, yetkili kişi, telefon
- E-fatura mükellefiyeti (ilerisi için)
- Ödeme vadesi (peşin, 7 gün, 30 gün)
- Teslimat süresi
- Kategoriler (hangi ürün gruplarını sağlıyor)
- Fiyat listesi (opsiyonel — karşılaştırma için)
```

## 10.2 Alış Faturası Akışı

```
Tedarikçi Malı Getirir
   │
   ▼
Depo Personeli / Müdür Ürünleri Teslim Alır
   │
   ▼
Sisteme Fatura Girişi
   ├── Tedarikçi seçilir
   ├── Fatura numarası girilir
   ├── Fatura tarihi
   └── Ürün satırları eklenir:
       ├── Ürün (barkod veya isim ile ara)
       ├── Miktar
       ├── Alış fiyatı (KDV dahil/hariç seçimi)
       └── KDV oranı
   │
   ▼
Sistem Kontrolleri
   ├── Alış fiyatı mevcut satış fiyatından yüksek mi? → Uyarı
   ├── Beklenmedik yüksek alım miktarı? → Uyarı
   └── Aynı fatura numarası daha önce girilmiş mi? → Hata
   │
   ▼
Fatura Onaylanır
   │
   ├── Stok hareketi oluşur (type: purchase, her ürün için)
   ├── Alış maliyeti güncellenir (maliyet ortalaması hesabı)
   └── Audit log: kim, hangi fatura, ne zaman
   │
   ▼
Ödeme Durumu Takibi
   ├── Peşin: anında "ödendi" işaretlenir
   └── Vadeli: vade tarihi + hatırlatma bildirimi
```

## 10.3 Maliyet Hesaplama Yöntemi

**Ağırlıklı Ortalama Maliyet (AVCO)** yöntemi kullanılacak:

```
Yeni Ortalama Maliyet =
  (Mevcut Stok × Mevcut Maliyet + Yeni Miktar × Yeni Maliyet)
  ─────────────────────────────────────────────────────────────
                     Toplam Yeni Stok

Örnek:
  Mevcut: 10 kg domates, maliyet ₺15/kg
  Alış: 20 kg domates, alış fiyatı ₺18/kg

  Yeni maliyet = (10×15 + 20×18) / (10+20)
               = (150 + 360) / 30
               = 510 / 30
               = ₺17/kg
```

Bu yöntem seçilme nedeni: Lifo/Fifo'ya göre uygulaması kolay, KOBİ için standarttır.

---

# BÖLÜM 11 — İADE SÜRECİ

## 11.1 İade Türleri

```
1. Satış Günü İadesi (Kasa İadesi)
   Aynı gün, aynı kasadan alınan ürün iade edilir
   Orijinal ödeme yöntemine geri ödeme

2. Sonraki Gün İadesi
   Farklı gün, farklı kasiyer olabilir
   Sipariş numarası ile aranır
   Müdür onayı gerektirebilir

3. Online Sipariş İadesi
   Teslimat sonrası iade talebi
   Admin onayı zorunlu
   Para iadesi farklı kanaldan (ileride Stripe refund)

4. Kısmi İade
   Siparişin bir kısmı iade edilir
   Sadece iade edilen kalemler işlenir
```

## 11.2 İade Akışı

```
İade Talebi Gelir
   │
   ▼
Orijinal Sipariş Bulunur (numara / tarih+tutar / telefon)
   │
   ▼
İade Edilecek Ürünler Seçilir
   │
   ▼
Yetki Kontrolü
   ├── 0-100 TL: Kasiyer onaylar
   ├── 100-500 TL: Müdür PIN gerekli
   └── 500 TL+: Admin onayı
   │
   ▼
İade Nedeni Seçilir (zorunlu):
   ├── Ürün bozuk/defolu
   ├── Yanlış ürün teslim edildi
   ├── Müşteri vazgeçti
   ├── Eksik teslimat
   └── Diğer (metin)
   │
   ▼
Ürün Fiziksel Kontrolü
   ├── İade edilebilir → stoka geri al
   └── İade edilemez  → fire olarak kaydet
   │
   ▼
Atomik İşlem
   ├── stock_movements: type=return (kullanılabilir)
   ├── stock_movements: type=waste (hasarlı)
   ├── cash_transactions: type=refund
   └── audit_log
```

## 11.3 İade Kısıtlamaları

İade süresi: 3 gün (tenant ayarından yapılandırılabilir).
İade edilemeyen kategoriler: Manav, Kasap (müdür override ile istisna mümkün, log tutulur).

---

# BÖLÜM 12 — FİRE SÜRECİ

## 12.1 Fire Türleri

```
Bozulma/çürüme    → Manav, kasap ürünlerinde yaygın
Mekanik hasar     → Düşme, ezilme, paket yırtılması
Son kullanma t.   → Raf ömrü biten ürünler
Dökülme/kırılma   → Sıvı, cam ürünler
Kayıp/belirle.    → Stok farkı ama neden bilinmiyor
```

## 12.2 Fire Akışı

```
Personel Hasarlı Ürünü Tespit Eder
   │
   ▼
Fire Formu
   ├── Ürün + Miktar
   ├── Neden (zorunlu)
   └── Tahmini maliyet etkisi (sistem hesaplar)
   │
   ▼
Onay
   ├── Değer < 500 TL: Müdür onaylar
   └── Değer > 500 TL: Admin onayı + detaylı gerekçe
   │
   ▼
stock_movements: type=waste
   ├── Maliyet kaydedilir
   ├── Stok düşürülür
   └── Audit log
   │
   ▼
Aylık Fire Raporu (otomatik, ayın sonu)
   ├── Ürün bazlı fire miktarı
   ├── Toplam maliyet etkisi
   └── Hermes AI önerisi (sipariş miktarı azalt?)
```

## 12.3 Fire Eşik Uyarısı

```
Aylık fire > stok değerinin %5'i  → Müdüre uyarı
Aylık fire > stok değerinin %10'u → Admin kritik uyarı
```

---

# BÖLÜM 13 — SAYIM SÜRECİ

## 13.1 Sayım Türleri

```
Tam Sayım   → Tüm ürünler, ayda bir zorunlu (Pazar günü)
Kısmi Sayım → Yüksek devir kategoriler, haftalık
Spot Sayım  → Şüpheli düşüşlerde tek ürün/kategori
```

## 13.2 Sayım Akışı

```
Müdür Sayım Başlatır
   ├── Tip ve kapsam seçilir
   └── Sistem anlık stok "fotoğrafı" alır
   │
   ▼
Sayımcılara Liste Dağıtılır
   ├── KÖR SAYIM: miktar gösterilmez
   └── Tablet/mobilde sayım formu açılır
   │
   ▼
Fiziksel Sayım Yapılır
   │
   ▼
Sistem Farkları Hesaplar
   ├── Fark = 0: yeşil
   ├── Fark küçük (+/-2): sarı
   └── Fark büyük: kırmızı — inceleme gerekli
   │
   ▼
Müdür İnceler ve Onaylar
   └── stock_movements: type=count_adjust
   │
   ▼
Sayım Raporu Kaydedilir (değiştirilemez)
```

**Kör sayım prensibi:** Sayımcı sistemi önceden okuyamaz. Karşılaştırma yalnızca müdür onayında gösterilir.

---

# BÖLÜM 14 — KAMPANYA SİSTEMİ

## 14.1 Kampanya Türleri

```
percentage_off    → Belirli ürün/kategoride yüzde indirim
fixed_amount      → Sepette sabit tutar düşümü
cart_threshold    → Belirli tutarın üzerinde indirim
buy_x_get_y       → 3 al 2 öde, 2 al 1 bedava
category_discount → Kategori genelinde indirim
bundle            → Belirli ürünler sepette olunca hediye/indirim
free_shipping     → Ücretsiz teslimat
flash_sale        → Belirli saat aralığında aktif
```

## 14.2 Kampanya Öncelik Kuralları

```
1. Flash sale her zaman önceliklidir
2. Ürün spesifik kampanya, genel kampanyayı geçer
3. Stacking (biriktirme) tenant admin tarafından açılıp kapatılabilir
4. Maksimum indirim tavanı yapılandırılabilir (örn: %30)
5. Kupon + kampanya birlikteliği yapılandırılabilir
```

## 14.3 Kampanya Kapsam Boyutları

```
Müşteri hedefi: Tüm / Sadece üyeler / VIP / Yeni müşteri
Ürün hedefi:    Tüm / Kategori / Belirli ürünler
Şube hedefi:    Tüm / Belirli şube(ler)
Kanal hedefi:   Web / POS / WhatsApp / Hepsi
```

---

# BÖLÜM 15 — KUPON SİSTEMİ

## 15.1 Kupon Türleri

```
percentage  → AYDIN10: %10 indirim
fixed       → GROS50: 50 TL indirim
gift        → EKMEK: hediye ürün sepete eklenir
shipping    → BEDAVA: teslimat ücretsiz
```

## 15.2 Kupon Kontrol Sırası

```
1. Kupon var mı?             → Hayır: "Geçersiz kod"
2. Aktif mi?                 → Hayır: "Süresi dolmuş"
3. Tarih aralığında mı?      → Hayır: "Kampanya bitti"
4. Kanal uyumlu mu?          → Hayır: "Bu kanalda geçersiz"
5. Min tutar sağlandı mı?    → Hayır: "Min X TL gerekli"
6. Toplam limit doldu mu?    → Evet: "Kupon tükendi"
7. Kişi başı limit aşıldı mı?→ Evet: "Zaten kullandınız"
8. Ürün kısıtı var mı?       → Kontrol et
```

Tüm kontroller geçince kupon "rezerve" edilir. Sipariş tamamlanınca kullanım kaydedilir.

---

# BÖLÜM 16 — SADAKAT PUANI

## 16.1 Kazanım ve Harcama

```
Kazanım oranı:    1 puan / 10 TL harcama (yapılandırılabilir)
Kampanya dışı:    2 puan / 10 TL
Doğum günü haft.: 3 puan / 10 TL

Harcama:          100 puan = 10 TL indirim
Minimum kullanım: 50 puan
Son kullanma:     1 yıl (yapılandırılabilir)
```

## 16.2 Seviyeler

```
BRONZ  (0-999 puan)      Temel üyelik
GÜMÜŞ  (1000-4999)       +%5 bonus puan
ALTIN  (5000-14999)      +%10 bonus, öncelikli teslimat
PLATİN (15000+)          +%20 bonus, VIP destek, erken kampanya
```

## 16.3 Puan İşlem Akışı

```
Sipariş tamamlanınca:
  → loyalty_transactions: type=earn
  → Seviye kontrolü → terfi varsa bildirim

Puan kullanımında:
  → Sepette "Puanlarımı Kullan" seçilir
  → loyalty_transactions: type=redeem
  → İndirim olarak uygulanır

İadede:
  → Kazanılan puan geri alınır
  → Kullanılan puan: bakiye eksiye düşerse sıfırlanır
```

## 16.4 Süre Sonu (Expiry)

Her ayın 1'inde otomatik: 1 yıldan eski puanlar silinir. 30 gün öncesinden kullanıcıya hatırlatma gönderilir.

---

# BÖLÜM 17 — ÇOK ŞUBE YAPISI

## 17.1 Şube Bağımsızlık Prensibi

```
Her şubenin KENDİNE AİT:
  Stok seviyeleri
  Kasa ve işlemler
  Personel kadrosu
  Çalışma saatleri
  Teslimat bölgesi
  Şubeye özel fiyat override

Tenant ile PAYLAŞILAN:
  Ürün kataloğu (şube değiştiremez)
  Müşteri veritabanı
  Kampanya ve kupon havuzu
  Marka ve genel ayarlar
  Sadakat puan havuzu
```

## 17.2 Şubeler Arası Transfer

```
Kaynak Şube Müdürü transfer başlatır
  → Hedef şube, ürün, miktar seçilir
  → Kaynak stokta reserved_quantity artar

Hedef Şube Müdürü onaylar
  → Fiziksel teslim sayımı
  → Fark varsa raporlanır

Onay sonrası sistem:
  → Kaynak: stock_movements type=transfer_out
  → Hedef:  stock_movements type=transfer_in
```

## 17.3 Müşteri İçin Şube Deneyimi

```
Adres girişi → En yakın teslimat şubesi otomatik seçilir
O şubenin stoğuna göre ürünler listelenir
Stokta yoksa: "Diğer şubeden X gün içinde temin edilebilir"
```

---

# BÖLÜM 18 — ÇOK KASA YAPISI

## 18.1 Kasa Tipleri

```
standard     → Normal kasa, kasiyer atar
self_service → Self-servis kasa (ileride)
online       → Web siparişleri sanal kasası
mobile       → Gezici kasa (market içi)
```

## 18.2 Vardiya Yönetimi

```
Vardiya değişimi:
  Kasiyer A kasayı kapatmadan kısa X raporu alır
  Kasiyer B yeni oturum açar
  Kasadaki nakit = Kasiyer B'nin açılış kasası olarak devredilir
```

## 18.3 Kasa Güvenlik Eşikleri (yapılandırılabilir)

```
nakit_limit_uyari    = 5.000 TL   (kasadan para çekilmeli)
nakit_limit_kritik   = 10.000 TL  (acil çekim zorunlu)
iptal_limit_kasiyer  = 100 TL     (üstü müdür onayı)
indirim_limit_kasiy  = %5          (üstü müdür onayı)
kapa_farki_tolerans  = 10 TL      (altı otomatik onay)
```

## 18.4 Z Raporu (Geri Alınamaz)

```
Kasa kapanışında otomatik üretilir:
  Vardiya özeti (satış, iade, iptal, nakit/kart)
  Açılış ve kapanış kasası + fark
  PDF olarak saklanır
  Müdüre email gönderilir
  Kasa status: CLOSED
```

---

# BÖLÜM 19 — TENANT (SaaS) YAPISI

## 19.1 Tenant Yaşam Döngüsü

```
KAYIT → DENEME (14 gün) → AKTİF → ASKIDA → İPTAL → ARŞİV

Deneme: Tüm özelliklere tam erişim, 100 ürün / 50 sipariş limiti
        Gün 7: "7 gün kaldı" hatırlatması
        Gün 14: Kart eklenmezse ASKIDA

Askıda: Read-only mod, 3 gün ödeme gelmezse İPTAL

İptal: Veri 30 gün saklanır (KVKK dışa aktarma imkanı)
       30 gün sonra ARŞİV

Arşiv: Anonim olarak 5 yıl saklanır, sonra kalıcı silme
```

## 19.2 Abonelik Planları

```
BAŞLANGIÇ: 1 şube, 2 kasa, 3 kullanıcı, 500 ürün, 90 gün geçmiş
PROFESYONEL: 3 şube, 10 kasa, 15 kullanıcı, 5000 ürün, 1 yıl
KURUMSAL: Sınırsız her şey + API + e-Fatura + Hermes AI tam erişim
```

## 19.3 Tenant İzolasyon Mekanizması

```
DB: Her tabloda tenant_id, PostgreSQL RLS otomatik filtreler
API: JWT içinde tenant_id, her istekte doğrulanır
Test: Tenant A token ile Tenant B verisi çekilemez (403 veya boş liste)
```

## 19.4 Super Admin Paneli

```
Tüm tenant'ların listesi ve durumu
Aktif kullanıcı sayıları (son 30 gün)
Abonelik geliri özeti
Hata ve alarm merkezi
Tenant'a özel destek girişi (impersonate — izinli, loglanır)
Platform geneli performans metrikleri
```


---

# BÖLÜM 20 — API TASARIMI

## 20.1 API Tasarım Prensipleri

```
REST standartları:
  GET    → Veri okuma (idempotent)
  POST   → Yeni kayıt oluşturma
  PUT    → Tam güncelleme
  PATCH  → Kısmi güncelleme
  DELETE → Silme (soft delete)

Versiyonlama: /api/v1/... (ilerisi için hazır)
Content-Type: application/json
Auth: Bearer token (JWT)
Tenant: JWT'den otomatik çözülür (URL'de taşınmaz)
```

## 20.2 Kimlik Doğrulama Endpoint'leri

```
POST /api/v1/auth/login
  Body: { email, password }
  Response: { access_token, refresh_token, user, tenant }

POST /api/v1/auth/refresh
  Body: { refresh_token }
  Response: { access_token }

POST /api/v1/auth/logout
  Header: Bearer token
  Response: { success: true }

POST /api/v1/auth/forgot-password
  Body: { email }
  Response: { message: "Email gönderildi" }

POST /api/v1/auth/reset-password
  Body: { token, new_password }
  Response: { success: true }
```

## 20.3 Ürün Endpoint'leri

```
GET    /api/v1/products          → Liste (filtre: category, search, page)
GET    /api/v1/products/:id      → Tek ürün
POST   /api/v1/products          → Yeni ürün [tenant_admin]
PATCH  /api/v1/products/:id      → Güncelle [tenant_admin]
DELETE /api/v1/products/:id      → Pasife al [tenant_admin]

GET    /api/v1/products/:id/stock       → Stok seviyeleri (şube bazlı)
GET    /api/v1/products/:id/movements   → Stok hareketleri

GET    /api/v1/categories               → Kategori listesi
POST   /api/v1/categories               → Yeni kategori [tenant_admin]
PATCH  /api/v1/categories/:id           → Güncelle [tenant_admin]
```

## 20.4 Sipariş Endpoint'leri

```
GET    /api/v1/orders                   → Liste (filtre: status, branch, date)
GET    /api/v1/orders/:id               → Sipariş detayı
POST   /api/v1/orders                   → Yeni sipariş (web/pos)
PATCH  /api/v1/orders/:id/status        → Durum güncelle
POST   /api/v1/orders/:id/cancel        → İptal (yetki kontrolü)
POST   /api/v1/orders/:id/return        → İade başlat

GET    /api/v1/orders/my                → Müşterinin kendi siparişleri
```

## 20.5 Stok Endpoint'leri

```
GET    /api/v1/stock                    → Tüm şube stok özeti
GET    /api/v1/stock/:branch_id         → Şube stoku
POST   /api/v1/stock/adjustment         → Manuel düzeltme
POST   /api/v1/stock/waste              → Fire kaydı
POST   /api/v1/stock/transfer           → Transfer başlat
PATCH  /api/v1/stock/transfer/:id       → Transfer onayla

GET    /api/v1/stock/movements          → Hareketler (filtre: branch, product, type, date)
GET    /api/v1/stock/alerts             → Kritik stok uyarıları
```

## 20.6 Kasa Endpoint'leri

```
GET    /api/v1/registers                → Kasa listesi
POST   /api/v1/registers/:id/open       → Kasa aç
POST   /api/v1/registers/:id/close      → Kasa kapat
GET    /api/v1/registers/:id/session    → Aktif oturum
GET    /api/v1/registers/:id/x-report   → X raporu (anlık)
GET    /api/v1/registers/:id/z-reports  → Geçmiş Z raporları

POST   /api/v1/cash-transactions        → Yeni kasa işlemi
POST   /api/v1/cash-transactions/:id/void → İptal
```

## 20.7 Raporlama Endpoint'leri

```
GET    /api/v1/reports/daily            → Günlük rapor (?date=&branch=)
GET    /api/v1/reports/weekly           → Haftalık (?week=&branch=)
GET    /api/v1/reports/monthly          → Aylık (?month=&branch=)
GET    /api/v1/reports/products/top     → En çok satan ürünler
GET    /api/v1/reports/products/low     → En az satan
GET    /api/v1/reports/margin           → Kar marjı analizi
GET    /api/v1/reports/staff            → Personel performansı
```

## 20.8 API Yanıt Formatı (Standart Zarf)

```json
Başarılı tek kayıt:
{
  "success": true,
  "data": { ...kayıt... }
}

Başarılı liste:
{
  "success": true,
  "data": [...],
  "meta": {
    "total": 1084,
    "page": 1,
    "limit": 20,
    "pages": 55
  }
}

Hata:
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Yetersiz stok: Domates (mevcut: 2 kg, istenen: 5 kg)",
    "field": "quantity"
  }
}
```

## 20.9 Hata Kodları

```
AUTH_REQUIRED          → 401: Giriş gerekli
AUTH_FORBIDDEN         → 403: Bu işlem için yetkin yok
NOT_FOUND              → 404: Kayıt bulunamadı
VALIDATION_ERROR       → 422: Geçersiz veri
INSUFFICIENT_STOCK     → 409: Yetersiz stok
DUPLICATE_ENTRY        → 409: Zaten var (kupon kodu vb.)
REGISTER_CLOSED        → 409: Kasa kapalı
RATE_LIMIT_EXCEEDED    → 429: Çok fazla istek
SERVER_ERROR           → 500: Sunucu hatası
PLAN_LIMIT_EXCEEDED    → 403: Abonelik limiti doldu
```

---

# BÖLÜM 21 — VERİTABANI ŞEMASI

## 21.1 Tam Tablo Listesi (43 tablo)

```
Platform:
  tenants, subscription_plans, tenant_invoices

Organizasyon:
  branches, registers, suppliers

Kullanıcılar:
  users, user_sessions, customer_addresses

Ürünler:
  categories, products, product_barcodes,
  product_prices, product_images

Stok:
  stock, stock_movements, stock_counts,
  stock_count_items, stock_transfers, stock_transfer_items

Satış:
  orders, order_items, order_status_history

Kasa:
  cash_sessions, cash_transactions

Pazarlama:
  campaigns, campaign_targets, coupons,
  coupon_usages, loyalty_accounts, loyalty_transactions

Satın Alma:
  invoices (purchase), invoice_items

Denetim:
  audit_logs, notifications, notification_preferences

Raporlama:
  daily_reports (materialized/cache)

Entegrasyon:
  webhook_endpoints, webhook_deliveries,
  integration_settings
```

## 21.2 Kritik Tablo Detayları

### tenants
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
name            VARCHAR(100) NOT NULL
slug            VARCHAR(50) UNIQUE NOT NULL
plan            VARCHAR(20) NOT NULL DEFAULT 'trial'
plan_expires_at TIMESTAMPTZ
status          VARCHAR(20) NOT NULL DEFAULT 'trial'
settings        JSONB DEFAULT '{}'
created_at      TIMESTAMPTZ DEFAULT NOW()
updated_at      TIMESTAMPTZ DEFAULT NOW()

-- settings JSON yapısı:
{
  "delivery_threshold": 1000,
  "whatsapp_number": "905444789461",
  "announcements": "...",
  "loyalty_earn_rate": 1,
  "loyalty_redeem_rate": 100,
  "loyalty_expiry_days": 365,
  "return_window_days": 3,
  "max_discount_pct": 30,
  "allow_coupon_stacking": false,
  "logo_url": null,
  "primary_color": "#FF6B35",
  "timezone": "Europe/Istanbul"
}
```

### products
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
tenant_id       UUID NOT NULL REFERENCES tenants(id)
category_id     UUID REFERENCES categories(id)
legacy_id       INTEGER          -- Eski integer ID (migration için)
name            VARCHAR(200) NOT NULL
unit            VARCHAR(50) NOT NULL
barcode         VARCHAR(50)
sku             VARCHAR(50)
description     TEXT
is_active       BOOLEAN DEFAULT true
is_featured     BOOLEAN DEFAULT false
created_at      TIMESTAMPTZ DEFAULT NOW()
updated_at      TIMESTAMPTZ DEFAULT NOW()
deleted_at      TIMESTAMPTZ      -- Soft delete
```

### stock
```sql
id                UUID PRIMARY KEY DEFAULT gen_random_uuid()
product_id        UUID NOT NULL REFERENCES products(id)
branch_id         UUID NOT NULL REFERENCES branches(id)
tenant_id         UUID NOT NULL REFERENCES tenants(id)
quantity          NUMERIC(10,3) NOT NULL DEFAULT 0
reserved_quantity NUMERIC(10,3) NOT NULL DEFAULT 0
min_threshold     NUMERIC(10,3) DEFAULT 5
max_threshold     NUMERIC(10,3)
updated_at        TIMESTAMPTZ DEFAULT NOW()
UNIQUE(product_id, branch_id)
```

### stock_movements
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
product_id      UUID NOT NULL REFERENCES products(id)
branch_id       UUID NOT NULL REFERENCES branches(id)
tenant_id       UUID NOT NULL REFERENCES tenants(id)
user_id         UUID NOT NULL REFERENCES users(id)
type            VARCHAR(30) NOT NULL
  -- purchase, sale, void, adjustment_plus, adjustment_minus,
  -- waste, transfer_out, transfer_in, return, internal_use,
  -- initial, count_adjust
quantity_change NUMERIC(10,3) NOT NULL
quantity_before NUMERIC(10,3) NOT NULL
quantity_after  NUMERIC(10,3) NOT NULL
reference_type  VARCHAR(30)
  -- order, invoice, transfer, count, manual
reference_id    UUID
note            TEXT
created_at      TIMESTAMPTZ DEFAULT NOW()
-- NOT NULL after create: kayıt hiç değiştirilemez
```

### orders
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
order_number    VARCHAR(20) UNIQUE NOT NULL
tenant_id       UUID NOT NULL REFERENCES tenants(id)
branch_id       UUID NOT NULL REFERENCES branches(id)
register_id     UUID REFERENCES registers(id)
customer_id     UUID REFERENCES users(id)
channel         VARCHAR(20) NOT NULL DEFAULT 'web'
  -- web, pos, whatsapp, phone
status          VARCHAR(30) NOT NULL DEFAULT 'pending'
  -- pending, confirmed, preparing, on_way, delivered,
  -- cancelled, return_requested, returned
payment_method  VARCHAR(20)
  -- cash, card, online, mixed
payment_status  VARCHAR(20) DEFAULT 'pending'
subtotal        NUMERIC(10,2) NOT NULL
discount_amount NUMERIC(10,2) DEFAULT 0
coupon_code     VARCHAR(20)
tax_amount      NUMERIC(10,2) DEFAULT 0
delivery_fee    NUMERIC(10,2) DEFAULT 0
total           NUMERIC(10,2) NOT NULL
customer_name   VARCHAR(100)
customer_phone  VARCHAR(20)
delivery_address TEXT
delivery_coords JSONB
notes           TEXT
cancelled_at    TIMESTAMPTZ
cancelled_by    UUID REFERENCES users(id)
cancel_reason   TEXT
created_at      TIMESTAMPTZ DEFAULT NOW()
updated_at      TIMESTAMPTZ DEFAULT NOW()
```

### audit_logs
```sql
id            UUID PRIMARY KEY DEFAULT gen_random_uuid()
tenant_id     UUID REFERENCES tenants(id)
branch_id     UUID REFERENCES branches(id)
user_id       UUID REFERENCES users(id)
action        VARCHAR(100) NOT NULL
  -- format: entity.operation (product.create, order.cancel)
entity_type   VARCHAR(50)
entity_id     UUID
old_value     JSONB
new_value     JSONB
ip_address    INET
user_agent    TEXT
metadata      JSONB
created_at    TIMESTAMPTZ DEFAULT NOW()
-- Bu tablo için UPDATE ve DELETE yetkisi hiçbir role verilmez
```

## 21.3 Row Level Security (RLS) Şablonu

```sql
-- Her tablo için RLS aktif edilir:
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Okuma: yalnızca kendi tenant verisi
CREATE POLICY products_tenant_isolation ON products
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id')::UUID);

-- Uygulama her request başında:
SET LOCAL app.tenant_id = 'X-X-X-X-X';
-- Artık tüm sorgular sadece bu tenant'ın verisini döner
```

## 21.4 İndeks Stratejisi

```sql
-- Sık sorgulanan alanlar için:
CREATE INDEX idx_products_tenant_category ON products(tenant_id, category_id);
CREATE INDEX idx_orders_tenant_status ON orders(tenant_id, status, created_at DESC);
CREATE INDEX idx_stock_movements_product ON stock_movements(product_id, branch_id, created_at DESC);
CREATE INDEX idx_audit_logs_tenant_date ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX idx_orders_customer ON orders(customer_id, created_at DESC);

-- Arama için:
CREATE INDEX idx_products_name_search ON products USING gin(to_tsvector('turkish', name));
```

---

# BÖLÜM 22 — GÜVENLİK MİMARİSİ

## 22.1 Kimlik Doğrulama Katmanı

```
Token Stratejisi:
  access_token:  15 dakika ömür (kısa, çalınırsa kısa süre zarar)
  refresh_token: 30 gün ömür (httpOnly cookie, JS okuyamaz)

Token İçeriği (JWT payload):
  {
    "sub": "user-uuid",
    "tenant_id": "tenant-uuid",
    "branch_id": "branch-uuid-or-null",
    "role": "cashier",
    "session_id": "session-uuid",
    "iat": 1234567890,
    "exp": 1234568790
  }

Token Doğrulama:
  Her API isteğinde imza doğrulanır
  Blacklist: Redis'te iptal edilen token'lar saklanır
  Logout: refresh_token blacklist'e eklenir
```

## 22.2 Şifre Politikası

```
Minimum uzunluk: 8 karakter
Zorunlu: En az 1 büyük harf, 1 rakam
Yasaklı: Kullanıcı adı, "123456", "password" gibi
Hash: bcrypt, cost factor: 12
Salt: bcrypt otomatik üretir (rainbow table koruması)

Kilitlenmw politikası:
  5 başarısız deneme → 15 dakika kilit
  10 başarısız deneme → 1 saat kilit + email bildirimi
  20 başarısız deneme → Hesap askıya + admin bildirimi
```

## 22.3 Rate Limiting

```
Giriş endpoint'i: 10 istek / dakika / IP
Şifre sıfırlama: 3 istek / saat / email
Genel API: 100 istek / dakika / kullanıcı
Public API: 30 istek / dakika / IP

Aşılınca: 429 Too Many Requests + Retry-After header
Araç: Upstash Redis (sliding window algoritması)
```

## 22.4 Input Validation

```
Tüm API endpoint'lerinde Zod şema validasyonu
Validasyon sırası:
  1. Tip kontrolü (string mi, number mı)
  2. Format kontrolü (email, telefon, UUID)
  3. Uzunluk kontrolü (max 200 karakter vb.)
  4. İş kuralı kontrolü (stok > 0 mu vb.)

XSS Koruması:
  Veritabanına kaydedilen tüm string'ler escape edilir
  HTML içeriği temizlenir (DOMPurify sunucu tarafında)

SQL Injection:
  Parametreli sorgular (prepared statements)
  Supabase client zaten güvenli — raw SQL kaçınılır
```

## 22.5 HTTPS ve Başlıklar

```
HTTPS: Vercel otomatik (HSTS dahil)

Security Headers (next.config):
  Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-{X}'
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
```

## 22.6 Hassas Veri Yönetimi

```
Şifreler: Asla plain text saklanmaz, asla log'a yazılmaz
API anahtarları: Yalnızca Vercel env vars
JWT secret: Yalnızca Vercel env vars, en az 32 karakter random
Müşteri verileri: KVKK uyumlu saklama ve silme hakkı
Kredi kartı: Asla kendi sistemimizde saklanmaz (ileride Stripe vault)

Log'a yazılmayacaklar:
  - Şifreler
  - JWT token'ları
  - Kredi kartı bilgileri
  - Kişisel kimlik bilgileri (TC kimlik vb.)
```

---

# BÖLÜM 23 — AUDIT LOG SİSTEMİ

## 23.1 Tasarım İlkeleri

```
DEĞIŞTIRILEMEZ: audit_logs tablosuna INSERT dışında yetki yok
                UPDATE ve DELETE hiçbir role verilmez
                Supabase RLS ile zorlanır

OTOMATIK: Her kritik işlemde otomatik tetiklenir
          Geliştirici "unutma" riski taşımaz
          Middleware katmanında merkezi loglama

YAPILI: JSON formatında hem makine hem insan okuyabilir

SORGULANABILIR: "Kim, ne zaman, ne yaptı, ne idi, ne oldu"
                sorusunu yanıtlayabilir
```

## 23.2 Log Kategorileri ve Aksiyon Kodları

```
AUTH:
  auth.login.success        auth.login.failed
  auth.logout               auth.password_changed
  auth.account_locked       auth.password_reset_requested

ÜRÜN:
  product.created           product.updated
  product.deleted           product.price_changed
  product.stock_threshold_changed

SİPARİŞ:
  order.created             order.status_changed
  order.cancelled           order.item_modified
  order.return_requested    order.refunded

STOK:
  stock.adjusted            stock.waste_recorded
  stock.transfer_created    stock.transfer_approved
  stock.count_started       stock.count_completed

KASA:
  register.opened           register.closed
  cash.sale                 cash.void
  cash.refund               cash.discount_applied
  cash.large_transaction    cash.discrepancy_noted

KULLANICI:
  user.created              user.updated
  user.role_changed         user.deactivated
  user.login_as             (impersonation)

AYARLAR:
  settings.updated          campaign.created
  coupon.created            plan.upgraded

ŞÜPHELI:
  suspicious.multiple_voids
  suspicious.large_discount
  suspicious.after_hours_login
  suspicious.rapid_stock_drop
```

## 23.3 Şüpheli İşlem Otomatik Tespiti

```
Kural 1: Aynı kasiyerden aynı gün 3+ iptal
  → Uyarı log kaydı
  → Müdüre anlık bildirim
  → Renk kodu: turuncu

Kural 2: Kapanış sayımında 100 TL+ negatif fark
  → Müdür + Admin bildirim
  → Renk kodu: kırmızı

Kural 3: Mesai saatleri dışı (22:00-07:00) sisteme giriş
  → Anlık bildirim
  → IP kaydı

Kural 4: Aynı üründe normal hız 3 katı stok düşüşü
  → Müdür bildirim
  → Hermes AI analiz tetiklenir

Kural 5: Kısa sürede çok sayıda yüksek indirim
  → 30 dakika içinde 5+ max indirim
  → Admin bildirim
```

## 23.4 Log Saklama ve Arşivleme

```
Aktif: Son 90 gün → ana tabloda, hızlı sorgu
Soğuk arşiv: 90 gün - 5 yıl → Supabase daha düşük maliyetli
Silme: 5 yıldan eski → yasal zorunluluk yoksa silinir

Arşivleme süreci:
  Her gece 03:00: 90 günden eski kayıtlar arşiv tablosuna taşınır
  Arşiv tablosu: ayrı storage class, daha yavaş ama ucuz
```

---

# BÖLÜM 24 — BİLDİRİM SİSTEMİ

## 24.1 Bildirim Kanalları

```
Email (Resend):
  → Sipariş onayı müşteriye
  → Günlük rapor müdüre
  → Kritik stok uyarısı
  → Şüpheli işlem uyarısı
  → Kasa kapanış özeti
  → Vade yaklaşan fatura

In-App (Dashboard):
  → Gerçek zamanlı bildirim paneli
  → Okunmamış sayısı badge
  → Tıklayınca ilgili sayfaya yönlendirir

Push (ileride — PWA ile):
  → Yeni sipariş (müdür)
  → Kritik stok (depo)
  → Kasiyer vardiya hatırlatması

WhatsApp (ileride — WhatsApp Business API):
  → Sipariş onayı müşteriye
  → Teslimat durumu güncellemesi
```

## 24.2 Bildirim Tercihleri

```
Her kullanıcı kendi tercihlerini belirler:
  Email bildirimleri: açık/kapalı (per kategori)
  In-app: açık/kapalı (per kategori)
  Push: açık/kapalı (per kategori)

Tenant admin tüm kullanıcılara varsayılan belirler
Kullanıcı kendi tercihini override edebilir
```

## 24.3 Kritik Bildirimler (Kapatılamaz)

```
Şüpheli işlem uyarısı → Admin'e her zaman gider
Büyük kasa farkı      → Müdür + Admin her zaman
Veri güvenlik ihlali  → Admin her zaman
Abonelik sona erme    → Admin her zaman
```

## 24.4 Bildirim Şablonları

```
Her bildirim tipi için ayrı şablon:
  Dil: Türkçe (varsayılan)
  Format: HTML email + plain text fallback
  Değişkenler: {musteri_adi}, {siparis_no}, {tutar} vb.
  Branding: Tenant logo + renk palette
```

---

# BÖLÜM 25 — BACKUP VE RECOVERY

## 25.1 Yedekleme Stratejisi (3-2-1 Kuralı)

```
3 kopya:
  1. Canlı Supabase veritabanı
  2. Supabase otomatik Point-in-Time Recovery (PITR)
  3. Harici depolama (Cloudflare R2 veya AWS S3)

2 farklı ortam:
  1. Supabase altyapısı
  2. Bağımsız object storage

1 uzak lokasyon:
  Farklı cloud provider veya bölge
```

## 25.2 Yedekleme Takvimi

```
Sürekli:    WAL (Write-Ahead Log) streaming → PITR sağlar
6 saatte 1: Artımlı snapshot
Her gece 02:00: Tam veritabanı dump (pg_dump)
Her Pazar:  Haftalık tam backup → Uzak depolamaya kopyalanır
Ayın 1'i:   Aylık backup → 1 yıl saklanır
```

## 25.3 Kurtarma Hedefleri

```
RPO (Ne kadar veri kaybedebiliriz?): Maksimum 6 saat
RTO (Ne kadar sürede toparlanabiliriz?): Maksimum 2 saat

Senaryo 1 — Veri bozulması:
  PITR ile dakika hassasiyetinde geri dön
  Süre: 15-30 dakika

Senaryo 2 — Tam sistem çöküşü:
  Yeni Supabase projesi + en son backup restore
  Süre: 1-2 saat

Senaryo 3 — Yanlış veri silme (soft delete olduğu için nadir):
  deleted_at alanı sıfırlanır (recovery basit)
  Süre: 5 dakika
```

## 25.4 Backup Test Protokolü

```
Aylık test (otomatik veya manuel):
  1. Random bir backup seçilir
  2. Test Supabase projesi oluşturulur
  3. Backup restore edilir
  4. Kontrol listesi çalışır:
     - Tablo sayıları doğru mu?
     - Son 10 sipariş var mı?
     - Ürün fiyatları mantıklı mı?
     - Kullanıcı girişi çalışıyor mu?
  5. Sonuç loglanır
  6. Test projesi silinir

Başarısız test → Hemen inceleme ve düzeltme
```

## 25.5 Müşteri Veri Dışa Aktarma (KVKK)

```
Tenant admin istediğinde:
  /api/v1/export/orders → Tüm sipariş geçmişi (CSV/JSON)
  /api/v1/export/products → Ürün kataloğu
  /api/v1/export/stock-movements → Stok hareketleri
  /api/v1/export/customers → Müşteri listesi (KVKK uyumlu)

Otomatik haftalık:
  Şifreli ZIP olarak tenant admin emailine gönderilir
  (Kurumsal plan)
```

---

# BÖLÜM 26 — PERFORMANS STRATEJİSİ

## 26.1 Hedef Metrikler

```
Web Sitesi (Müşteri):
  LCP (Largest Contentful Paint): < 2.5 saniye
  INP (Interaction to Next Paint): < 200ms
  CLS (Cumulative Layout Shift): < 0.1
  FCP (First Contentful Paint): < 1.5 saniye
  Mobil Lighthouse Skoru: > 85

Admin Panel:
  Sayfa yükleme: < 2 saniye
  API yanıt süresi: < 200ms (p95)
  Rapor üretimi: < 5 saniye

POS Ekranı:
  Satış işlemi: < 1 saniye (atomik commit)
  Ürün arama: < 150ms
  Kasa açma: < 2 saniye
```

## 26.2 Rendering Stratejisi

```
/                    → SSR (SEO kritik, dinamik ürünler)
/category/[cat]      → ISR 5 dakika (yarı statik)
/product/[id]        → ISR 5 dakika
/admin/*             → CSR (auth gerektiriyor, SEO gerekmez)
/pos                 → CSR (PWA, offline desteği)
/api/*               → Edge Functions (yakın sunucu)
```

## 26.3 Veri Getirme Stratejisi

```
Ürün listesi:
  Server component → Supabase'den sayfalı çekme (limit 20)
  Filtreleme: server-side (URL params → DB query)
  Arama: PostgreSQL full-text search (Turkish tokenizer)

Admin paneli:
  TanStack Query ile client-side fetching
  Stale-while-revalidate (60 saniye)
  Optimistic updates (UI hızlı, sunucu yavaş olabilir)

POS:
  Ürün listesi: Service Worker cache (offline desteği)
  Satış işlemi: Direkt API, cache bypass
```

## 26.4 Önbellekleme Katmanları

```
L1 — Tarayıcı Cache:
  Statik dosyalar: 1 yıl (hash'li URL'ler)
  Ürün görselleri: 1 hafta (CDN'den)

L2 — Vercel CDN:
  Static sayfalar: Edge cache
  ISR sayfalar: 5 dakika edge cache

L3 — Upstash Redis:
  Ürün fiyatları: 5 dakika cache
  Kategori listesi: 30 dakika cache
  Rate limiting counters: sliding window

L4 — Supabase:
  Connection pooling (PgBouncer)
  Read replica (ileride — yüksek trafik için)
```

## 26.5 Görsel Optimizasyon

```
Format: WebP + AVIF (JPEG fallback)
Boyutlandırma: next/image otomatik resizing
Lazy loading: viewport dışı görseller yüklenmez
Prioritize: Hero ve ilk ürün görselleri eager+fetchpriority=high
CDN: Supabase Storage CDN URL'leri

Ürün görseli boyutu kuralları:
  Liste: 400×400px
  Detay: 800×800px
  Admin thumbnail: 100×100px
```

## 26.6 Veritabanı Performansı

```
Bağlantı havuzu: PgBouncer (Supabase dahili)
Sorgu optimizasyonu:
  N+1 sorunları: JOIN veya batch loading
  Büyük listeler: cursor pagination (offset yerine)
  Raporlar: materialized view (günlük rapor tablosu)

Yavaş sorgu eşiği: 100ms → Loglama
Sorgu analizi: EXPLAIN ANALYZE (development ortamında)
```

---

# BÖLÜM 27 — MOBİL UYGULAMA MİMARİSİ

## 27.1 Mobil Strateji: PWA Önce

```
Faz 1 (Mevcut): Responsive web (mobil uyumlu)
Faz 2 (3 ay): PWA — POS ekranı offline-capable
Faz 3 (6-12 ay): React Native uygulaması (isteğe bağlı)
```

## 27.2 PWA Özellikleri (POS için)

```
Kurulum: "Ana ekrana ekle" (iOS Safari + Android Chrome)
Offline: Service Worker ile son ürün kataloğu cache'de kalır
         İnternet kesilince: uyarı gösterilir, cache'den çalışır
         Satış işlemi: online gelince senkronize edilir (queue)
Push bildirim: Yeni sipariş, kritik stok (Android'de çalışır)

Dokunmatik UX:
  Büyük düğmeler (min 48×48px)
  Barkod kameradan okuma (Web API)
  Numpad klavye (kasa için optimize)
  Swipe hareketleri (sipariş durumu için)
```

## 27.3 Kasiyer POS Ekranı Tasarım Prensipleri

```
Sol panel (60%): Ürün arama ve listeleme
Sağ panel (40%): Sepet, toplam, ödeme

Ürün arama: Barkod okuma VEYA isim ile
Dokunmatik ürün seçimi: Kategori > Ürün > Miktar
Hızlı tuşlar: En çok satan 12 ürün ana ekranda
Sayısal pad: Miktar ve tutar girişi için büyük keypad
Ödeme: Nakit / Kart / Karma tek dokunuşla

Tablet (iPad veya Android 10"+) optimizasyonu
Landscape mod zorunlu (geniş panel için)
```

## 27.4 Müşteri Web Sitesi Mobil UX

```
Alt navigasyon çubuğu:
  [Ana Sayfa] [Kategoriler] [Sepet] [Siparişlerim] [Profil]

Ürün listesi: 2 sütunlu grid (akıllı telefon)
Sepet: Alt çekmece veya tam sayfa
Adres: GPS otomatik + harita gösterimi
Ödeme: Minimalist form (6 alan max)

Performans:
  İlk yükleme: < 3 saniye (3G üzerinde)
  Görsel lazy load: Viewport'a girerken
```

---

# BÖLÜM 28 — YAPAY ZEKA — HERMES AI MİMARİSİ

## 28.1 Hermes AI Nedir?

Hermes AI, Aydın Gros OS'un yerleşik yapay zeka asistanıdır. Market sahibine karar destek sağlar. Otomatik öneriler, anomali tespiti ve tahminleme yapar.

İsim seçimi: Hermes — Yunan mitolojisinde ticaret ve iletişim tanrısı. Market ve ticaret bağlamıyla uyumlu.

## 28.2 Hermes AI Modülleri

```
1. Fiyat Öneri Motoru
   Rakip fiyat analizi + maliyet + kar marjı → optimal fiyat önerisi

2. Stok Tahmin Motoru
   Geçmiş satış hızı + mevsimsellik + tatiller → ne zaman sipariş ver

3. Fire Risk Analizi
   Hangi ürünler fire riski taşıyor → sipariş miktarını azalt

4. Satış Tahmini
   Önümüzdeki hafta/ay ne kadar ciro bekleniyor

5. Anomali Tespiti
   Normal dışı stok düşüşü, şüpheli işlem işaretleme

6. Kampanya Önerisi
   Hangi ürünler indirime girmeye hazır (stok birikimi)

7. Chatbot Asistan
   "Bu hafta en çok ne sattım?" gibi doğal dil soruları
```

## 28.3 Hermes AI Teknik Mimarisi

```
Veri Akışı:
  Veritabanı → ETL Pipeline → Feature Store → Model → Öneri API

Günlük ETL (Extract-Transform-Load):
  Her gece 01:00
  Son 90 günün satış, stok, fire verileri çekilir
  Zaman serisi formatına dönüştürülür
  Feature store güncellenir

Model Katmanı:
  Fiyat önerisi: Kural tabanlı + Claude API (doğal dil açıklama)
  Stok tahmini: Exponential Smoothing (basit, açıklanabilir)
  Anomali: Z-score (istatistiksel eşik)
  Chatbot: Claude API (claude-haiku-4-5 — hızlı, ekonomik)

Sonuç Katmanı:
  Öneriler notifications tablosuna yazılır
  Admin dashboardda "Hermes Önerileri" bölümünde gösterilir
  Kullanıcı "Kabul Et" veya "Yoksay" diyebilir
  Her karar loglanır (öğrenme için)
```

## 28.4 Hermes Öneri Formatı

```json
{
  "id": "hermes-rec-001",
  "type": "reorder_suggestion",
  "priority": "high",
  "product_id": "uuid",
  "product_name": "Salkım Domates",
  "message": "Domates stoğu 3 günde tükeniyor. Geçen hafta satış hızına göre en az 50 kg sipariş öneriyorum.",
  "data": {
    "current_stock": 8,
    "daily_avg_sales": 2.7,
    "days_remaining": 3,
    "suggested_order_qty": 50
  },
  "action": "create_purchase_order",
  "created_at": "..."
}
```

## 28.5 Hermes AI Plan Kısıtları

```
Başlangıç planı: Hermes kapalı
Profesyonel planı: Temel öneriler (stok tahmini, fiyat öneri)
Kurumsal planı: Tüm Hermes modülleri + Chatbot + API erişimi
```

## 28.6 Veri Gizliliği

```
Hermes hesaplamaları: Sadece tenant'ın kendi verisi kullanılır
Claude API çağrılarında: PII (kişisel veri) gönderilmez
Model payload: Yalnızca sayısal veri (satış, stok miktarları)
Müşteri isimleri, telefonları: Hermes'e hiç ulaşmaz
```

---

# BÖLÜM 29 — ENTEGRASYON PLANI

## 29.1 e-Fatura Entegrasyonu

```
Kapsam: Türkiye Gelir İdaresi Başkanlığı (GİB) e-Fatura sistemi
Gereklilik: Yıllık ciro 4 Milyon TL üzeri işletmeler (2024 itibari)

Entegrasyon Yöntemi: Özel entegratör üzerinden
  Önerilen: Logo Entegrasyon, Mikro, Türkticaret.net
  Alternatif: GİB API (karmaşık, entegratör tercih edilmeli)

Veri Akışı:
  Aydın Gros OS → Entegratör API → GİB → Alıcıya e-Fatura

Gerekli Veriler:
  Satıcı: VKN/TCKN, unvan, adres, vergi dairesi
  Alıcı: VKN/TCKN veya T.C. kimlik
  Ürün: KDV oranı zorunlu (şu an eksik — eklenmeli)
  Tutar: KDV dahil/hariç ayrımı

Geliştirme Önceliği: Faz 3 (4-6. ay)
Ön koşul: KDV oranı ürün tablosuna eklenmeli (Faz 1'de)
```

## 29.2 Fiziksel POS / Yazar Kasa Entegrasyonu

```
Türkiye'de Geçerli Standartlar:
  ÖKC (Ödeme Kaydedici Cihaz): Vergi levhalı yazarkasa
  Yeni Nesil ÖKC: İnternet bağlantılı, GİB'e otomatik rapor

Entegrasyon Planı:
  Faz 1: Manuel bağlantı (günlük satış tutarı elle girilir)
  Faz 2: Yarı otomatik (CSV import)
  Faz 3: API entegrasyonu (üretici API'si varsa)

Kart Okuyucu (POS Terminali):
  Şu an: Bağımsız terminal, tutarı elle girilir
  İleride: Stripe Terminal veya Iyzico POS entegrasyonu

Geliştirme Önceliği: Faz 3-4 (6-12. ay)
```

## 29.3 Terazi (Baskül) Entegrasyonu

```
Kullanım Senaryosu: Manav, kasap ürünleri gramaj bazlı satış
  Müşteri tezgaha gelir → Ürün tartılır → Barkod basılır → Kasada okutulur

Desteklenen Protokol: Barkod tabanlı ağırlık etiketi (EAN-13/128)
  İlk 2 hane: ürün kodu prefix (örn: 20 = tartılı ürün)
  Sonraki haneler: ürün kodu + ağırlık

Sistem Gereksinimi:
  Barkod tarama → ağırlığı çöz → fiyatı hesapla
  Örn: Barcode 2001000500 → Domates (kod: 010) → 500g → fiyat

Geliştirme: Ürün tablosuna "is_weighted" ve "price_per_unit" eklenir
            Barkod parser yazılır (basit algoritma)

Öncelik: Faz 2 (2-3. ay, kasap/manav müşterileri için kritik)
```

## 29.4 Kargo / Teslimat Entegrasyonu

```
Kısa vade: WhatsApp + kendi kurye (mevcut model)
Orta vade: Trendyol Go, Getir Gıda gibi platformlarla entegrasyon
Uzun vade: Yandex, inDriver gibi kurye API'leri

Veri: Sipariş → Kurye API → Takip numarası → Müşteriye SMS/Email
```

## 29.5 Muhasebe Entegrasyonu

```
Öncelik: Düşük (market sahibi önce operasyonu oturtmalı)

Hedefler: Logo Tiger, Mikro, Paraşüt, Luca
Veri: Günlük satış toplamları, KDV beyannamesi verisi
Format: Excel/CSV dışa aktarma (ilk aşama)
API entegrasyonu: Faz 4+ (12. ay sonrası)
```

---

# BÖLÜM 30 — 2 YILLIK GELİŞTİRME YOL HARİTASI

## 30.1 Faz 0: Hazırlık (0-2. Hafta)

```
AMAC: Sağlam temel, güvenli altyapı

Altyapı:
  [ ] Supabase projesi kurulumu (test + production)
  [ ] Vercel environment variables yapılandırması
  [ ] Next.js 15 projesi oluşturulması
  [ ] TypeScript + ESLint + Prettier kurulumu
  [ ] Temel CI/CD pipeline (GitHub Actions)
  [ ] Staging ortamı (vercel preview deployments)

Veritabanı:
  [ ] Tam PostgreSQL şeması oluşturulması
  [ ] Row Level Security policy'leri
  [ ] Temel indeksler
  [ ] Seed verileri (test için)

Güvenlik:
  [ ] JWT kimlik doğrulama altyapısı
  [ ] Supabase Auth kurulumu
  [ ] Rate limiting (Upstash Redis)
  [ ] Environment variable yönetimi

Göç:
  [ ] JSONBlob export scripti
  [ ] Veri dönüşüm scriptleri
  [ ] Migration ve doğrulama
  [ ] Canlıya geçiş planı
```

## 30.2 Faz 1: Çekirdek Sistem (1-3. Ay)

```
AMAÇ: Temel operasyon — Aydın Gros günlük işini yapabilsin

Ay 1:
  [ ] Kimlik doğrulama (giriş, çıkış, şifre sıfırlama)
  [ ] Ürün kataloğu CRUD (admin panel)
  [ ] Kategori yönetimi
  [ ] Temel stok takibi
  [ ] Stok hareketi kaydı
  [ ] Migration tamamlanması ve canlıya geçiş

Ay 2:
  [ ] Sipariş motoru (web kanalı)
  [ ] WhatsApp entegrasyon korunur + otomasyonu
  [ ] Sipariş durum yönetimi
  [ ] Basit admin dashboard
  [ ] Kullanıcı yönetimi (rol atama)
  [ ] Kritik stok uyarıları

Ay 3:
  [ ] POS / Kasa modülü (temel)
  [ ] Kasa açma/kapama
  [ ] X ve Z raporları
  [ ] Satın alma (alış faturası)
  [ ] Fire kaydı
  [ ] Email bildirimleri (Resend)
  [ ] Temel raporlar (günlük satış)

Başarı Kriteri Faz 1:
  - Günlük POS işlemleri sorunsuz
  - Web siparişleri çalışıyor
  - Stok takibi tutarlı
  - Temel raporlar alınabiliyor
```

## 30.3 Faz 2: Operasyonel Olgunluk (4-6. Ay)

```
AMAÇ: 3 kasalı market tam kapasitede çalışsın

Ay 4:
  [ ] Çok kasa desteği (tam)
  [ ] Vardiya yönetimi
  [ ] Kasa güvenlik kuralları (onay eşikleri)
  [ ] Stok sayım modülü
  [ ] Stok transfer sistemi
  [ ] Müşteri kayıt sistemi

Ay 5:
  [ ] Kampanya motoru
  [ ] Kupon sistemi
  [ ] Müşteri sadakat puanı
  [ ] Gelişmiş raporlama
  [ ] Kar marjı analizi
  [ ] Tedarikçi yönetimi

Ay 6:
  [ ] PWA (POS ekranı offline)
  [ ] Terazi entegrasyonu (barkod)
  [ ] Barkod okuyucu desteği
  [ ] Audit log tam implementasyon
  [ ] Şüpheli işlem tespiti
  [ ] e-Fatura hazırlığı (KDV oranı ekleme)

Başarı Kriteri Faz 2:
  - 3 kasa eş zamanlı çalışıyor
  - Stok sayımı sistemden yapılıyor
  - Kampanyalar web + POS'ta çalışıyor
  - Sadakat puanı müşterilerde kullanılıyor
```

## 30.4 Faz 3: SaaS ve Çok Şube (7-12. Ay)

```
AMAÇ: Ürün SaaS olarak başka marketlere satılabilir hale gelsin

Ay 7-8:
  [ ] Çok şube desteği (tam)
  [ ] Tenant onboarding akışı
  [ ] Super admin paneli
  [ ] Abonelik plan yönetimi
  [ ] Çok şube raporlama
  [ ] Şubeler arası transfer (tam)

Ay 9-10:
  [ ] Hermes AI — Stok tahmini
  [ ] Hermes AI — Fiyat önerisi
  [ ] Hermes AI — Fire analizi
  [ ] e-Fatura entegrasyonu (entegratör API)
  [ ] Gelişmiş bildirim sistemi (push, SMS)
  [ ] Müşteri segmentasyonu

Ay 11-12:
  [ ] React Native mobil uygulama (MVP)
  [ ] WhatsApp Business API entegrasyonu
  [ ] Kargo entegrasyonu (temel)
  [ ] API erişimi (kurumsal müşteriler)
  [ ] Performans optimizasyonu
  [ ] Yük testi + güvenlik penetrasyon testi

Başarı Kriteri Faz 3:
  - 3+ başka market aynı sistemde çalışıyor
  - Hermes önerileri gerçek değer katıyor
  - e-Fatura sorunsuz çalışıyor
  - Mobil uygulama App Store'da
```

## 30.5 Faz 4: Büyüme ve Ekosistem (13-24. Ay)

```
AMAÇ: Pazar liderliği, ekosistem genişlemesi

Ay 13-16:
  [ ] Gelişmiş analitik (BI dashboard)
  [ ] Müşteri uygulama (React Native)
  [ ] Gelişmiş Hermes AI (chatbot asistan)
  [ ] POS terminal entegrasyonu (kart okuyucu API)
  [ ] Muhasebe yazılımı entegrasyonları
  [ ] Açık API pazarı

Ay 17-20:
  [ ] Franchise/zincir market desteği
  [ ] Çoklu para birimi (uluslararası genişleme)
  [ ] Gelişmiş tedarik zinciri yönetimi
  [ ] Tahmin tabanlı otomatik sipariş
  [ ] Müşteri davranış analizi
  [ ] A/B test altyapısı

Ay 21-24:
  [ ] Yapay zeka tabanlı fiyat optimizasyonu
  [ ] Computer vision (raf boşluğu tespiti — ileride)
  [ ] IOT entegrasyonu (akıllı terazi, sıcaklık sensörü)
  [ ] Marketplace (ürün içeriği paylaşımı arası tenant)
  [ ] Uluslararası genişleme altyapısı
  [ ] IPO/M&A hazırlığı (kurumsal raporlama)
```

## 30.6 Öncelik ve Bağımlılık Matrisi

```
KRİTİK YOL (Bunlar tamamlanmadan sonraki faz başlamaz):

Faz 0 → Faz 1:
  Supabase + Auth + Temel schema hazır olmalı

Faz 1 → Faz 2:
  Temel sipariş + stok + POS çalışıyor olmalı
  Migration tamamlanmış olmalı

Faz 2 → Faz 3:
  Operasyonel veriler birikmiş olmalı (AI için)
  Tek tenant tam çalışıyor olmalı
  Güvenlik penetrasyon testi geçilmiş olmalı

Faz 3 → Faz 4:
  En az 3 ödeme yapan tenant olmalı
  Hermes AI gerçek değer göstermiş olmalı
  Mobil uygulama beta'da olmalı
```

## 30.7 Teknik Borç Yönetimi

```
Her sprint'te %20 kapasite teknik borç için ayrılır:
  - Test coverage artırma (hedef: %80)
  - Refactoring (karmaşık kodlar sadeleştirme)
  - Bağımlılık güncellemeleri (güvenlik yamalar)
  - Dokümantasyon güncellemeleri
  - Performans iyileştirmeleri

"Teknik borç bankası": Her ayın son sprintinde teknik borç ödemesi
Kural: Teknik borç 3 aydan fazla birikmez
```

---

# BELGE SONU — ONAY VE REVİZYON

## Belgenin Durumu

```
Versiyon:  1.0
Durum:     TASLAK — İnceleme bekliyor
Hazırlayan: Teknik Mimari Ekibi
Tarih:     27 Haziran 2026

Bu belge onaylanmadan:
  - Hiçbir production kodu yazılamaz
  - Hiçbir veritabanı şeması oluşturulamaz
  - Hiçbir harici servis aboneliği alınamaz

Onay için gerekli:
  [ ] Tenant/SaaS mimarisi onayı
  [ ] Veritabanı şeması incelemesi
  [ ] Güvenlik mimarisi onayı
  [ ] Yol haritası öncelik onayı
  [ ] Hermes AI kapsamı onayı
```

## Revizyon Geçmişi

```
v1.0 — 27 Haziran 2026 — İlk taslak oluşturuldu
```

## Bir Sonraki Adımlar

```
1. Bu belgeyi incele ve geri bildirim ver
2. Faz 0 kapsamını onayla
3. Supabase projesi oluşturma kararı
4. Geliştirme başlangıç tarihi belirleme
5. Faz 1 sprint planlaması
```

---

*Bu belge, Aydın Gros OS projesinin yazılım anayasasıdır.*
*Her teknik karar bu belgeyle uyumlu olmak zorundadır.*
*Belge, sistem geliştikçe güncellenecek ve versiyonlanacaktır.*

