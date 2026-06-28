"""
Erenler Cep — Apify Tabanlı Ürün Katalog Scraper
==================================================
Cloudflare'i bypass eden Apify cheerio-scraper kullanır.

Kurulum:
  pip install requests

Çalıştırma:
  python scripts/scrape_erenler.py

Çıktı: erenler_urunler.csv
  Alanlar: ad, fiyat, eski_fiyat, birim, kategori, stok, gorsel_url, urun_url, kategori_slug

Ortam değişkeni (opsiyonel):
  APIFY_TOKEN=apify_api_...   (yoksa kod içindeki değer kullanılır)
"""

import os
import re
import sys
import csv
import time
import json
import requests
from urllib.parse import urljoin

# Windows konsolunda UTF-8 emoji desteği
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# ── Konfigürasyon ─────────────────────────────────────────────────────────────

APIFY_TOKEN  = os.getenv("APIFY_TOKEN", "")
APIFY_BASE   = "https://api.apify.com/v2"
ACTOR_ID     = "apify~cheerio-scraper"

BASE_URL     = "https://www.erenlercep.com"
OUTPUT_FILE  = "erenler_urunler.csv"

CATEGORIES = [
    # MANAV
    ("meyve-sebze",       "Meyve & Sebze"),
    # GIDA — ana sayfa
    ("gida",              "Temel Gıda"),
    # GIDA — alt kategoriler
    ("atistirmalik",      "Atıştırmalık"),
    ("bakliyat",          "Bakliyat"),
    ("makarna",           "Makarna"),
    ("baharat",           "Baharat"),
    ("konserve",          "Konserveler"),
    ("dondurma",          "Dondurma"),
    ("kahve",             "Çay & Kahve"),
    ("hazir-corba",       "Hazır Çorba"),
    ("unlu-mamuller",     "Unlu Mamuller"),
    ("ekmek",             "Ekmek"),
    ("tatli",             "Tatlı"),
    ("recel",             "Reçel & Marmelat"),
    ("sucuk",             "Sucuk"),
    ("salam",             "Salam & Sosis"),
    ("bal",               "Bal"),
    ("yogurt",            "Yoğurt"),
    # İÇECEKLER
    ("icecek",            "İçecek"),
    # SÜT & KAHVALTILIK
    ("sut",               "Süt"),
    # KASAP
    ("kasap",             "Kasap"),
    # TEMİZLİK — ana sayfa
    ("temizlik",          "Temizlik"),
    # TEMİZLİK — alt kategoriler
    ("islak-havlu",       "Islak Havlu"),
    ("kagit-havlu",       "Kağıt Havlu"),
    # KİŞİSEL BAKIM
    ("parfum",            "Parfüm"),
    ("kisisel-bakim",     "Kişisel Bakım"),
]

MAX_PAGES_PER_CATEGORY = 10  # Her kategori için maksimum sayfa

# ── Apify pageFunction (Cheerio ile ürün çekme) ───────────────────────────────
# Bu fonksiyon Apify sunucularında çalışır — Cloudflare bypass dahil

PAGE_FUNCTION = r"""
async function pageFunction(context) {
    const { $, request, pushData } = context;
    const url = request.url;

    // URL'den kategori slug'ını al
    const catMatch = url.match(/erenlercep\.com\/([^/?]+)/);
    const catSlug = catMatch ? catMatch[1] : '';

    $('.product-thumb').each(function() {
        // Ad
        const nameEl = $(this).find('.name a').first();
        const name = nameEl.text().trim() || $(this).find('.name').first().text().trim();
        if (!name || name.length < 2) return;

        // Fiyatlar
        const newPriceEl = $(this).find('.price-new').first();
        const normalPriceEl = $(this).find('.price-normal').first();
        const oldPriceEl = $(this).find('.price-old').first();

        const priceText = newPriceEl.length ? newPriceEl.text() : normalPriceEl.text();
        const price = parseFloat(
            priceText.replace(/\./g, '').replace(',', '.').replace(/[^0-9.]/g, '')
        );

        const oldPriceText = oldPriceEl.text();
        const oldPrice = oldPriceEl.length
            ? parseFloat(oldPriceText.replace(/\./g, '').replace(',', '.').replace(/[^0-9.]/g, ''))
            : null;

        if (isNaN(price) || price <= 0) return;

        // Görsel
        const imgEl = $(this).find('img').first();
        let imageUrl = imgEl.attr('data-src') || imgEl.attr('data-lazy-src') || imgEl.attr('src') || '';
        if (imageUrl.startsWith('data:')) imageUrl = '';  // placeholder base64 temizle
        if (imageUrl && !imageUrl.startsWith('http')) {
            imageUrl = 'https://www.erenlercep.com' + imageUrl;
        }

        // Ürün linki
        const linkEl = $(this).find('a').first();
        let productUrl = linkEl.attr('href') || '';
        if (productUrl && !productUrl.startsWith('http')) {
            productUrl = 'https://www.erenlercep.com' + productUrl;
        }

        // Stok durumu
        const cardText = $(this).text().toLowerCase();
        let stock = 'mevcut';
        if ($(this).find('.out-of-stock, .stok-yok').length > 0
            || cardText.includes('stokta yok')
            || cardText.includes('tükendi')) {
            stock = 'stokta_yok';
        }

        // Birim (ürün adından)
        const unitMatch = name.match(/(\d+[\.,]?\d*)\s*(gr|g|kg|ml|l|lt|li|lu|adet|paket|kutu|şişe|tüp|kap)\b/i);
        const unit = unitMatch ? unitMatch[0].trim() : '';

        pushData({
            ad:           name,
            fiyat:        price,
            eski_fiyat:   oldPrice || '',
            birim:        unit,
            kategori_slug: catSlug,
            stok:         stock,
            gorsel_url:   imageUrl,
            urun_url:     productUrl,
        });
    });
}
"""

# ── Apify API Fonksiyonları ───────────────────────────────────────────────────

def build_start_urls() -> list[dict]:
    """Tüm kategori sayfaları için URL listesi oluştur."""
    urls = []
    for slug, _ in CATEGORIES:
        for page in range(1, MAX_PAGES_PER_CATEGORY + 1):
            url = f"{BASE_URL}/{slug}" if page == 1 else f"{BASE_URL}/{slug}?page={page}"
            urls.append({"url": url})
    return urls


def start_apify_run() -> dict:
    """Apify actor'ı başlat, runId ve datasetId döndür."""
    start_urls = build_start_urls()
    print(f"📡 Apify çalıştırılıyor — {len(start_urls)} URL taranacak...")

    payload = {
        "startUrls":         start_urls,
        "pageFunction":      PAGE_FUNCTION,
        "maxConcurrency":    10,
        "maxRequestRetries": 2,
    }

    resp = requests.post(
        f"{APIFY_BASE}/acts/{ACTOR_ID}/runs?token={APIFY_TOKEN}",
        json=payload,
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()["data"]
    print(f"✅ Apify run başlatıldı: {data['id']}")
    return {"runId": data["id"], "datasetId": data["defaultDatasetId"], "status": data["status"]}


def poll_run_status(run_id: str) -> dict:
    """Run durumunu sorgula."""
    resp = requests.get(
        f"{APIFY_BASE}/actor-runs/{run_id}?token={APIFY_TOKEN}",
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()["data"]


def wait_for_run(run_id: str, poll_interval: int = 10, timeout_minutes: int = 15) -> dict:
    """Run tamamlanana kadar bekle."""
    print(f"⏳ Tarama bekleniyor (maks {timeout_minutes} dk)...")
    deadline = time.time() + timeout_minutes * 60
    prev_finished = 0

    while time.time() < deadline:
        run = poll_run_status(run_id)
        status = run["status"]
        stats = run.get("stats", {})
        finished = stats.get("requestsFinished", 0)
        total    = stats.get("requestsTotal", 0)

        if finished != prev_finished:
            pct = int(finished / total * 100) if total else 0
            print(f"   {finished}/{total} URL ({pct}%)  —  durum: {status}")
            prev_finished = finished

        if status == "SUCCEEDED":
            print(f"✅ Tarama tamamlandı!")
            return run
        if status in ("FAILED", "ABORTED", "TIMED-OUT"):
            raise RuntimeError(f"Apify run başarısız: {status}")

        time.sleep(poll_interval)

    raise TimeoutError(f"Apify run {timeout_minutes} dakikada bitmedi.")


def fetch_dataset(dataset_id: str) -> list[dict]:
    """Dataset'ten tüm ürünleri çek."""
    print(f"📥 Ürün verisi indiriliyor (dataset: {dataset_id})...")
    resp = requests.get(
        f"{APIFY_BASE}/datasets/{dataset_id}/items"
        f"?token={APIFY_TOKEN}&format=json&clean=true&limit=50000",
        timeout=60,
    )
    resp.raise_for_status()
    items = resp.json()
    print(f"   {len(items)} ham kayıt alındı.")
    return items


# ── Post-processing ───────────────────────────────────────────────────────────

CATEGORY_SLUG_TO_NAME = {slug: name for slug, name in CATEGORIES}

def enrich(items: list[dict]) -> list[dict]:
    """Kategori adı ekle, stoksuz olmayanları öne al."""
    for item in items:
        slug = item.get("kategori_slug", "")
        item["kategori"] = CATEGORY_SLUG_TO_NAME.get(slug, slug)
    return items


def deduplicate(items: list[dict]) -> list[dict]:
    """Aynı ada sahip ürünlerde en düşük fiyatı tut."""
    seen: dict[str, dict] = {}
    for item in items:
        key = item["ad"].lower().strip()
        existing = seen.get(key)
        if not existing:
            seen[key] = item
        else:
            ep = float(existing["fiyat"]) if existing["fiyat"] else float("inf")
            np = float(item["fiyat"])     if item["fiyat"]     else float("inf")
            if np < ep:
                seen[key] = item
    return list(seen.values())


def save_csv(items: list[dict], path: str):
    fields = ["ad", "fiyat", "eski_fiyat", "birim", "kategori", "kategori_slug", "stok", "gorsel_url", "urun_url"]
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fields, delimiter=";", extrasaction="ignore")
        writer.writeheader()
        writer.writerows(items)
    print(f"💾 Kaydedildi → {path}  ({len(items)} ürün)")


def print_summary(items: list[dict]):
    by_cat: dict[str, int] = {}
    for item in items:
        by_cat.setdefault(item.get("kategori", "?"), 0)
        by_cat[item.get("kategori", "?")] += 1

    stok_yok = sum(1 for i in items if i.get("stok") == "stokta_yok")
    with_img  = sum(1 for i in items if i.get("gorsel_url"))

    print("\n" + "=" * 50)
    print(f"  TOPLAM ÜRÜN     : {len(items)}")
    print(f"  Görselı olan    : {with_img}")
    print(f"  Stokta yok      : {stok_yok}")
    print("  Kategori dağılımı:")
    for cat, count in sorted(by_cat.items(), key=lambda x: -x[1]):
        print(f"    {cat:<28} {count}")
    print("=" * 50)


# ── Ana ───────────────────────────────────────────────────────────────────────

def main():
    print("=" * 50)
    print("  Erenler Cep Scraper  —  Apify Edition")
    print("=" * 50 + "\n")

    if not APIFY_TOKEN or APIFY_TOKEN == "apify_api_...":
        print("❌ APIFY_TOKEN eksik. .env.local veya ortam değişkenine ekle.")
        return

    try:
        # 1. Başlat
        run_info = start_apify_run()

        # 2. Bekle
        final_run = wait_for_run(run_info["runId"])

        # 3. Veriyi çek
        raw_items = fetch_dataset(final_run["defaultDatasetId"])

        if not raw_items:
            print("⚠️  Hiç ürün bulunamadı. Apify pageFunction'ı veya sitemap'i kontrol et.")
            return

        # 4. İşle
        enriched  = enrich(raw_items)
        unique    = deduplicate(enriched)

        # 5. Kaydet
        save_csv(unique, OUTPUT_FILE)
        print_summary(unique)

    except requests.HTTPError as e:
        print(f"❌ HTTP Hatası: {e}")
        print(f"   Yanıt: {e.response.text[:300] if e.response else ''}")
    except (RuntimeError, TimeoutError) as e:
        print(f"❌ {e}")


if __name__ == "__main__":
    main()
