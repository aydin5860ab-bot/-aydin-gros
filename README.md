# Aydın GROS POS Operating System — v1.0.0-RC1

Aydın GROS OS, modern marketler ve süpermarket zincirleri için tasarlanmış, bulut tabanlı, çevrimdışı (offline-first) çalışabilen, tam donanım entegrasyonlu ve yapay zeka destekli web tabanlı bir Satış Noktası (POS) ve Yönetim Sistemidir.

---

## 🚀 Öne Çıkan Ürün Özellikleri (Product Highlights)

1. **İlk Açılış Kurulum Sihirbazı (`/setup.html`)**:
   - Yeni market kurulumlarında profil bilgileri, şube ve kasa envanteri ile başlangıç yöneticisi kaydını 1 dakikada tamamlar.
2. **Yerleşik Lisans Sistemi (Licensing)**:
   - **Starter**: Temel POS ve envanter yönetimi (tek kasa, tek şube).
   - **Pro**: Gelişmiş promosyon, sadakat programları, şubeler arası transfer (3 kasa, 2 şube).
   - **Enterprise**: Sınırsız kasa, Hermes Yapay Zeka entegrasyonu, tam e-fatura desteği.
   - Ayarlar panelinden lisans anahtarı girilerek anında aktifleşir.
3. **Tek Tıkla Bulut & Yerel Yedekleme (1-Click Backup & Restore)**:
   - Anlık verileri yerel JSON dosyası olarak aktarır veya Supabase bulut veritabanının yedeğini anında sunucudan indirir.
4. **Çevrimdışı Çalışma & Otomatik Senkronizasyon (Offline-First)**:
   - İnternet kesildiğinde sepet, ödeme ve iade işlemlerini lokal tarayıcı belleğine (localStorage) kaydeder. Bağlantı geldiğinde otomatik arka plan kuyruğuyla Supabase veritabanına aktarır.
5. **Güvenli Eşzamanlılık Kilidi (AsyncLock)**:
   - Birden fazla kasa aynı anda işlem yaparken stokların çakışmasını engeller, envanter doğruluğunu garanti eder.

---

## 🛠️ Kurulum ve Başlangıç Kılavuzu (Setup Guide)

### 1. Sistem Gereksinimleri
- Node.js v18.0.0 veya üzeri
- Supabase Cloud Hesabı (veya Docker yerel kurulum)

### 2. Ortam Değişkenleri (`.env.local`)
Kök dizinde `.env.local` dosyası oluşturun ve aşağıdaki değişkenleri ekleyin:
```env
SUPABASE_URL=https://<proje-kodu>.supabase.co
SUPABASE_ANON_KEY=<anonim-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
SUPABASE_TENANT_ID=11111111-1111-1111-1111-111111111111
CRON_SECRET=test_cron_secret_token_12345
```

### 3. Bağımlılıkların Kurulumu ve Başlatılması
```bash
# Gerekli kütüphaneleri yükleyin
npm install

# Geliştirici sunucusunu başlatın
npm run dev
```
Uygulama yerel olarak `http://localhost:3000` adresinde çalışmaya başlayacaktır.

---

## 📘 Kullanıcı ve Operasyon Kılavuzları

- [Pilot Kurulum Kontrol Listesi](file:///C:/Users/PC/.gemini/antigravity-ide/brain/9cd149e6-535e-44d0-83ad-b04535959b3c/pilot_installation_checklist.md): Donanım entegrasyonu, kiosk modu ve ağ yapılandırma adımları.
- [Kasiyer Kullanım Kılavuzu](file:///C:/Users/PC/.gemini/antigravity-ide/brain/9cd149e6-535e-44d0-83ad-b04535959b3c/cashier_user_manual.md): Satış yapma, ödeme alma (nakit/kart/karma), iade işlemleri ve kasa kapatma.
- [Yönetici Kullanım Kılavuzu](file:///C:/Users/PC/.gemini/antigravity-ide/brain/9cd149e6-535e-44d0-83ad-b04535959b3c/manager_user_manual.md): Stok takibi, cari borç/tahsilat, Z raporları denetimi ve sistem yedeklemeleri.

---

## 🔑 Lisans Anahtarları (Mock Activation Keys)

Aşağıdaki şablonlardaki lisans anahtarlarını Ayarlar panelinden girerek ilgili sürümleri aktifleştirebilirsiniz:
- **Starter**: `AG-STAR-MEMBER-112233`
- **Pro**: `AG-PRO-MEMBER-998877`
- **Enterprise**: `AG-ENT-MEMBER-556677`

---

## 📄 Lisans
Aydın GROS OS ticari hakları Aydın Gros Ltd. Şti. firmasına aittir. İzinsiz kopyalanamaz veya dağıtılamaz.
