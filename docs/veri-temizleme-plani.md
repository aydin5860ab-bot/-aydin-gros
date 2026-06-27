# Aydın Gros — Veri Temizleme Planı
**Tarih:** 27 Haziran 2026  
**Referans:** data/analysis/data_quality_report.md  
**Kural:** Bu belge karar ve analiz dokümanıdır. Hiçbir veri değiştirilmedi.

---

## BÖLÜM 1 — DUPLICATE ÜRÜN GRUPLARI (76 GRUP)

### Karar Kategorileri

| Kod | Anlamı |
|-----|--------|
| **A — AYRI ÜRÜN** | Farklı gramaj/hacim → farklı ürün; isim normalize et, her ikisi migrate edilir |
| **B — BİRLEŞTİR** | Aynı ürün, encoding/format farkı veya fiyat güncellemesi → en yüksek ID master |
| **C — SİL** | Tam kopya, fiyat ve birim aynı → düşük ID'li sil |
| **M — MANUEL** | Sahip bizzat karar vermeli |

---

### 1.1 — 4 KOPYA GRUPLAR (3 grup)

#### G01 · She Deodorant 150ml × 4
| ID | Birim | Fiyat | Görsel |
|----|-------|-------|--------|
| 230 | kutu | 69,90 TL | photo-1585232350538 |
| 332 | kutu | 74,95 TL | photo-1585232350538 (aynı) |
| 960 | kutu | 74,95 TL | photo-1585232350538 (aynı) |
| **1078** | **150 ml** | **74,95 TL** | photo-1585386959984 (farklı) |

**Farklar:** ID 1078'de birim formatı "kutu"→"150 ml", görsel farklı  
**Karar: B — BİRLEŞTİR** → Master: ID 1078 (en son, doğru birim formatı, güncel fiyat)  
Silinecekler: ID 230, 332, 960

---

#### G02 · Arko Nem Krem 250ml × 4
| ID | Birim | Fiyat | Görsel |
|----|-------|-------|--------|
| 229 | kap | 104,90 TL | photo-1556228578-8c89e (aynı) |
| 333 | kap | 109,95 TL | photo-1556228578-8c89e (aynı) |
| 961 | **tup** | 109,95 TL | photo-1556228578-8c89e (aynı) |
| **1079** | **250 ml** | **109,95 TL** | photo-1556228453 (farklı) |

**Farklar:** "tup" = "tüp" (encoding bozukluğu), ID 1079'da birim "250 ml"  
**Karar: B — BİRLEŞTİR** → Master: ID 1079 (en son, birim standardize edilmiş)  
Silinecekler: ID 229, 333, 961

---

#### G03 · Derby Banyo Sabunu × 4
| ID | Birim | Fiyat | Görsel |
|----|-------|-------|--------|
| 231 | adet | 7,90 TL | photo-1584552539577 (aynı) |
| 329 | adet | 8,95 TL | photo-1584552539577 (aynı) |
| 957 | adet | 8,95 TL | photo-1584552539577 (aynı) |
| **1075** | adet | **8,95 TL** | photo-1612817283958 (farklı) |

**Not:** ID 1075'te isim "DERBY BANYO SABUNU" (büyük harf), diğerleri küçük harf  
**Karar: B — BİRLEŞTİR** → Master: ID 329 (daha erken, aynı güncel fiyat, doğru büyük harf)  
Silinecekler: ID 231 (eski fiyat), ID 957, ID 1075 (büyük harf tutarsızlığı)

---

### 1.2 — 3 KOPYA GRUPLAR (8 grup)

#### G04 · Dana Bonfile × 3  ⚠️ FARKLI ÜRÜN
| ID | Birim | Fiyat | Görsel |
|----|-------|-------|--------|
| **180** | **500g** | **349,90 TL** | photo-1558030006 (aynı) |
| 249 | **1 kg** | 1.690 TL | photo-1558030006 (aynı) |
| 824 | **1 kg** | 1.690 TL | photo-1558030006 (aynı) |

**Farklar:** 500g vs 1kg → tamamen farklı satış birimi  
**Karar: A — AYRI ÜRÜN** → İsimleri normalize et:  
- ID 180 → "Dana Bonfile 500g" olarak adlandırılacak  
- ID 249 → "Dana Bonfile 1kg" olarak adlandırılacak  
- ID 824 → SİL (ID 249 ile tam kopya, aynı fiyat ve birim)  
Fiyat farkı: 1.340 TL / %383

---

#### G05 · Enginar × 3  ⚠️ MANUEL KONTROL
| ID | Birim | Fiyat | Görsel |
|----|-------|-------|--------|
| 133 | adet | 64,90 TL | photo-1598170845058 |
| 190 | adet | 59,90 TL | photo-1567375698348 |
| 791 | adet | 69,95 TL | photo-1576045057995 |

**Farklar:** Aynı birim (adet), 3 farklı fiyat, 3 farklı görsel  
**Durum:** 59,90 → 64,90 → 69,95 TL sırayla artmıyor (190 ID'si 133'ten düşük fiyatlı)  
**Karar: M — MANUEL** → Sahip hangisinin güncel fiyat olduğuna karar vermeli  
Öneri: En yüksek ID (791) master alınabilir, 19,95 TL fark kısmen fiyat güncellemesi kısmen varyans

---

#### G06 · Kivi × 3
| ID | Birim | Fiyat | Görsel |
|----|-------|-------|--------|
| 53 | 1 kg | 89,90 TL | photo-1585059895524 |
| 241 | 1 kg | 179,95 TL | photo-1618897996318 |
| 804 | 1 kg | 179,95 TL | photo-1615485290382 |

**Farklar:** ID 53 eski fiyat (89,90 TL), ID 241 ve 804 güncel fiyat (%100 zam)  
**Karar: B — BİRLEŞTİR** → Master: ID 241 (ilk güncel fiyat, görsel kaliteli)  
Silinecekler: ID 53 (eski fiyat), ID 804 (kopya)  
Fiyat farkı: 90 TL / %100 ⚠️

---

#### G07 · Avokado × 3
| ID | Birim | Fiyat | Görsel |
|----|-------|-------|--------|
| 54 | adet | 54,90 TL | photo-1519162808019 |
| 242 | adet | 114,95 TL | photo-1519162808019 (aynı) |
| 803 | adet | 114,95 TL | photo-1519162808019 (aynı) |

**Karar: B — BİRLEŞTİR** → Master: ID 242 (ilk güncel fiyat, aynı görsel)  
Silinecekler: ID 54 (eski fiyat), ID 803 (tam kopya)  
Fiyat farkı: 60 TL / %109 ⚠️

---

#### G08 · Biber Dolma × 3
| ID | Birim | Fiyat | Görsel |
|----|-------|-------|--------|
| 56 | 1 kg | 49,90 TL | photo-1513530534585 |
| 243 | 1 kg | 79,95 TL | photo-1563565375-f3fdfdbefa83 |
| 811 | 1 kg | 79,95 TL | photo-1583258292688 |

**Karar: B — BİRLEŞTİR** → Master: ID 243  
Silinecekler: ID 56 (eski fiyat), ID 811 (kopya, farklı görsel ama aynı ürün)

---

#### G09 · Maydanoz × 3
| ID | Birim | Fiyat | Görsel |
|----|-------|-------|--------|
| 58 | bağ | 14,90 TL | photo-1615485290382 |
| 244 | bağ | 19,95 TL | photo-1615485290382 (aynı) |
| 800 | **bag** | 19,95 TL | photo-1628556270448 |

**Farklar:** ID 800'de "bag" = "bağ" encoding bozukluğu  
**Karar: B — BİRLEŞTİR** → Master: ID 244 (doğru Türkçe birim, güncel fiyat)  
Silinecekler: ID 58 (eski fiyat), ID 800 (encoding hatası)

---

#### G10 · Roka × 3
| ID | Birim | Fiyat | Görsel |
|----|-------|-------|--------|
| 60 | bağ | 14,90 TL | photo-1622206151226 |
| 240 | bağ | 19,95 TL | photo-1622206151226 (aynı) |
| 807 | **bag** | 19,95 TL | photo-1576045057995 |

**Karar: B — BİRLEŞTİR** → Master: ID 240  
Silinecekler: ID 60 (eski fiyat), ID 807 (encoding hatası)

---

#### G11 · Nane × 3
| ID | Birim | Fiyat | Görsel |
|----|-------|-------|--------|
| 59 | bağ | 14,90 TL | photo-1628556270448 |
| 239 | bağ | 19,95 TL | photo-1628556270448 (aynı) |
| 808 | **bag** | 19,95 TL | photo-1628556270448 (aynı) |

**Karar: B — BİRLEŞTİR** → Master: ID 239  
Silinecekler: ID 59 (eski fiyat), ID 808 (encoding hatası)

---

### 1.3 — 2 KOPYA GRUPLAR (65 grup)

#### ⚠️ YÜKSEKFİYAT FARKI OLAN GRUPLAR (>%50)

| # | Ürün Adı | ID'ler | Birimler | Fiyatlar | Fark | Fark % | Karar |
|---|----------|--------|----------|----------|------|--------|-------|
| G12 | Dana Kıyma | 117 → 196 | 500g → **1 kg** | 189,90 → 859,90 | +670 TL | +%353 | **A — AYRI** |
| G13 | Kuzu Pirzola | 182 → 393 | 500g → **1 kg** | 299,90 → 989,95 | +690 TL | +%230 | **A — AYRI** |
| G14 | Sütaş Süzme Peynir | 19 → 431 | 500 g → **900 gr** | 79,90 → 249,95 | +170 TL | +%213 | **A — AYRI** |
| G15 | Sarımsak | 134 → 374 | **1kg → 250 gr** | 134,90 → 49,95 | -85 TL | -%63 | **A — AYRI** |
| G16 | Patates | 6 → 372 | **2.5 kg → 5 kg** | 52 → 134,95 | +83 TL | +%160 | **A — AYRI** |
| G17 | Limon | 8 → 52 | 1 kg → 1 kg | 22 → 49,90 | +28 TL | +%127 | **B — BİRLEŞTİR** |
| G18 | Ritz Kraker | 27 → 279 | 200 g → 200 gr | 29 → 64,95 | +36 TL | +%124 | **B — BİRLEŞTİR** |
| G19 | Brokoli | 154 → 382 | adet → adet | 34,90 → 74,95 | +40 TL | +%115 | **B — BİRLEŞTİR** |
| G20 | Avokado | (bkz. G07 3 kopya) | | | | | |
| G21 | Kivi | (bkz. G06 3 kopya) | | | | | |
| G22 | Pırasa | 63 → 378 | 1 kg → 1 kg | 24,90 → 44,95 | +20 TL | +%80 | **B — BİRLEŞTİR** |
| G23 | Sütaş Ayran | 294 → 438 | **1 L → 500 ml** | 44,95 → 24,95 | -20 TL | -%44 | **A — AYRI** |
| G24 | Erik | 65 → 389 | 1 kg → 1 kg | 39,90 → 69,95 | +30 TL | +%75 | **B — BİRLEŞTİR** |
| G25 | Karpuz | 51 → 496 | 1 kg → 1 kg | 14,90 → 24,95 | +10 TL | +%67 | **B — BİRLEŞTİR** |
| G26 | Kiraz | 152 → 491 | 500g → **1 kg** | 89,90 → 149,95 | +60 TL | +%67 | **A — AYRI** |
| G27 | Üzüm Siyah | 156 → 369 | 1 kg → 1 kg | 79,90 → 129,95 | +50 TL | +%63 | **B — BİRLEŞTİR** |
| G28 | Biber Dolma | (bkz. G08 3 kopya) | | | | | |
| G29 | Soğan Yeşil | 61 → 247 | bağ → bağ | 19,90 → 29,95 | +10 TL | +%50 | **B — BİRLEŞTİR** |
| G30 | Biber Sivri | 55 → 819 | 1 kg → 1 kg | 39,90 → 59,95 | +20 TL | +%50 | **B — BİRLEŞTİR** |
| G31 | Kırmızı Mercimek | 159 → 405 | 1 kg → 1 kg | 49,90 → 74,95 | +25 TL | +%50 | **B — BİRLEŞTİR** |
| G32 | Şeftali | 155 → 388 | 1 kg → 1 kg | 59,90 → 89,95 | +30 TL | +%50 | **B — BİRLEŞTİR** |

---

#### ORTA FİYAT FARKI GRUPLAR (%10-%50)

| # | Ürün Adı | ID'ler | Birimler | Fiyatlar | Fark | Karar |
|---|----------|--------|----------|----------|------|-------|
| G33 | Piliç Kanat | 181 → 256 | 1 kg → 1 kg | 99,90 → 139,95 | +40 TL | **B** |
| G34 | Çam Balı | 125 → 670 | 460g → 460 gr | 344,90 → 449,95 | +105 TL | **B** |
| G35 | Mantar | 62 → 383 | **1 kg → 500 gr** | 99,90 → 89,95 | -10 TL | **A — AYRI** |
| G36 | Çilek | 151 → 386 | 500g → 500 gr | 79,90 → 99,95 | +20 TL | **B** |
| G37 | Domates Cherry | 191 → 813 | 250g → 250 gr | 74,90 → 89,95 | +15 TL | **B** |
| G38 | Mango | 189 → 805 | adet → adet | 79,90 → 89,95 | +10 TL | **B** |
| G39 | Kavun | 157 → 495 | **1 adet → 1 kg** | 44,90 → 49,95 | +5 TL | **A — AYRI** |
| G40 | Elma Granny Smith | 135 → 514 | 1kg → 1 kg | 94,90 → 79,95 | -15 TL | **M — MANUEL** |
| G41 | Patlıcan | 136 → 380 | 1kg → 1 kg | 59,90 → 49,95 | -10 TL | **M — MANUEL** |
| G42 | Tavuk But | 120 → 521 | 1kg → 1 kg | 179,90 → 149,95 | -30 TL | **M — MANUEL** |
| G43 | Colgate Çocuk Diş Macunu | 224 → 326 | tüp → tüp | 279,90 → 299,95 | +20 TL | **B** |
| G44 | Ispanak | 377 → 806 | 500 gr → 500 gr | 34,95 → 44,95 | +10 TL | **B** |
| G45 | Üzüm Siyah | 156 → 369 | 1 kg → 1 kg | 79,90 → 129,95 | +50 TL | **B** |

---

#### DÜŞÜK FİYAT FARKI GRUPLAR (<%10 veya 0 TL)

| # | Ürün Adı | ID'ler | Birimler | Fiyatlar | Fark | Karar |
|---|----------|--------|----------|----------|------|-------|
| G46 | Dana Sote | 197 → 822 | 1 kg → 1 kg | 889,90 → 909,95 | +20 TL | **B** |
| G47 | Kuzu Kol | 199 → 826 | 1 kg → 1 kg | 829,90 → 849,95 | +20 TL | **B** |
| G48 | Kuzu But | 198 → 823 | 1 kg → 1 kg | 894,90 → 914,95 | +20 TL | **B** |
| G49 | Dana Antrikot | 201 → 828 | 1 kg → 1 kg | 1.014,90 → 1.034,95 | +20 TL | **B** |
| G50 | Perwoll Çamaşır Det. 2.97L | 219 → 311 | şişe → şişe | 199,90 → 209,95 | +10 TL | **B** |
| G51 | Vernel Max Yumuşatıcı 1.44L | 220 → 312 | şişe → şişe | 114,90 → 119,95 | +5 TL | **B** |
| G52 | Magic Çok Amaçlı Sprey 750ml | 221 → 313 | şişe → şişe | 54,90 → 59,95 | +5 TL | **B** |
| G53 | Sensodyne Diş Mac. 100ml | 223 → 325 | tüp → tüp | 229,90 → 239,95 | +10 TL | **B** |
| G54 | Sensodyne Diş Mac. 50ml | 222 → 324 | tüp → tüp | 139,90 → 149,95 | +10 TL | **B** |
| G55 | Nivea Tıraş Jeli 200ml | 226 → 328 | tüp → tüp | 244,90 → 254,95 | +10 TL | **B** |
| G56 | Taft Saç Spreyi 250ml | 227 → 331 | kutu → kutu | 209,90 → 219,95 | +10 TL | **B** |
| G57 | Hobby Saç Jölesi 250ml | 228 → 330 | tüp → tüp | 124,90 → 134,95 | +10 TL | **B** |
| G58 | Tropicana Meyve Suyu 330ml | 217 → 892 | kutu → kutu | 29,90 → 32,95 | +3 TL | **B** |
| G59 | Signal Diş Macunu 75ml | 233 → 335 | tüp → tüp | 134,90 → 139,60 | +5 TL | **B** |
| G60 | Sprite 330ml | 301 → 902 | kutu → kutu | 28,95 → 24,95 | -4 TL | **M — MANUEL** |
| G61 | Karnabahar | 381 → 796 | adet → adet | 69,95 → 59,95 | -10 TL | **M — MANUEL** |
| G62 | Havuç | 49 → 375 | 1 kg → 1 kg | 34,90 → 34,95 | +0,05 TL | **B** |
| G63 | Mutfak Makası | 116 → 761 | adet → adet | 89,90 → 89,95 | +0,05 TL | **B** |
| G64 | Uludağ Gazoz | 47 → 306 | **1 L → 330ml** | 22 → 22,95 | +1 TL | **A — AYRI** |

---

#### TAM KOPYA GRUPLAR (fiyat = 0, birim aynı)

| # | Ürün Adı | ID'ler | Fiyat | Karar |
|---|----------|--------|-------|-------|
| G65 | Plastik Poşet 50li | 485 → 781 | 34,95 TL | **C — SİL** (düşük ID kalsın: 485) |
| G66 | Kuzu Gerdan | 251 → 829 | 833,95 TL | **C — SİL** (ID 251 kalsın) |
| G67 | Dana Kaburga | 398 → 538 | 749,95 TL | **C — SİL** (ID 398 kalsın) |
| G68 | Hellmann's Mayonez | 412 → 562 | 134,95 TL | **C — SİL** (ID 412 kalsın) |
| G69 | Tamek Ketçap | 411 → 563 | 64,95 TL | **C — SİL** (ID 411 kalsın) |
| G70 | M.Birlik Zeytin Az Tuzlu | 291 → 882 | 199,95 TL | **C — SİL** (ID 291 kalsın) |
| G71 | Mutfak Kağıt Havlu 3lü | 486 → 783 | 54,95 TL | **C — SİL** (ID 486 kalsın) |

---

#### ENCODING/FORMAT FARKI GRUPLAR (aynı ürün, yazım farkı)

| # | Ürün Adı | ID'ler | Birim farkı | Karar |
|---|----------|--------|-------------|-------|
| G72 | Tere | 187 → 809 | bağ → **bag** | **B** (ID 187 kalsın, doğru Türkçe) |
| G73 | Reyhan | 188 → 801 | bağ → **bag** | **B** (ID 188 kalsın) |
| G74 | Lipton Ice Tea Limon 1.5L | 202 → 841 | şişe → **sise** | **B** (ID 202 kalsın) |
| G75 | Perwoll 2970ml | 971 → 1066 | **sise** → 2970 ml | **B** (ID 971 kalsın, birim düzeltilecek) |
| G76 | Vernel Max 1440ml | 972 → 1067 | **sise** → 1440 ml | **B** (ID 972 kalsın, birim düzeltilecek) |

*(Not: G72-G76 birim alanlarındaki 'bag' ve 'sise' UTF-8 kayıpları — 'ğ' ve 'ş' düşmüş)*

---

## BÖLÜM 2 — KARAR ÖZETİ

| Karar | Grup Sayısı | Etki |
|-------|-------------|------|
| **A — AYRI ÜRÜN** (isim normalize) | 13 grup | Her gruptaki ürünlerin isimine birim eklenir (ör: "1 kg", "500g") |
| **B — BİRLEŞTİR** (master ID) | 49 grup | Eski ID'ler silinir, fiyat geçmişine alınır |
| **C — SİL** (tam kopya) | 7 grup | Düşük ID kalır, yüksek ID silinir |
| **M — MANUEL KONTROL** | 7 grup | Sahip kararı gerekli (fiyat düşüşü veya anormal durum) |
| **TOPLAM** | **76 grup** | |

**Sonuç:** Migration öncesi en fazla ~120 ID silinecek.  
1.084 üründen yaklaşık **960–970 benzersiz ürün** kalacak.

---

## BÖLÜM 3 — MANUEL KONTROL GEREKTİREN 7 GRUP

Aşağıdaki gruplar fiyat **düşüşü** içeriyor (olağandışı) veya 3 farklı fiyat içeriyor.  
Sahip her biri için: **"Hangi fiyat güncel?"** sorusunu yanıtlamalı.

```
G05 · Enginar          → ID 133 (64,90), ID 190 (59,90), ID 791 (69,95)
                          3 farklı görsel, 3 farklı fiyat — sahip seçmeli

G40 · Elma Granny Smith → ID 135 (94,90 TL) → ID 514 (79,95 TL)  Fiyat düştü?
G41 · Patlıcan          → ID 136 (59,90 TL) → ID 380 (49,95 TL)  Fiyat düştü?
G42 · Tavuk But         → ID 120 (179,90 TL) → ID 521 (149,95 TL) Fiyat düştü?
G60 · Sprite 330ml      → ID 301 (28,95 TL) → ID 902 (24,95 TL)  Fiyat düştü?
G61 · Karnabahar        → ID 381 (69,95 TL) → ID 796 (59,95 TL)  Fiyat düştü?

Not: Fiyat düşüşleri mevsimsel indirim veya hatalı giriş olabilir.
     Her durumda mevcut raftan kontrol edilmeli.
```

---

## BÖLÜM 4 — FİYAT FARKI YÜKSEK OLAN ÜRÜNLER (%50+)

> Bu ürünler çok farklı fiyatla aynı isimle listelenmiş. Müşteri karmaşası veya yanlış sipariş riski var.

| Ürün | Düşük Fiyat | Yüksek Fiyat | Fark % | Açıklama |
|------|-------------|--------------|--------|----------|
| Dana Bonfile | 349,90 TL | 1.690 TL | +%383 | 500g vs 1kg — gerçekten farklı |
| Dana Kıyma | 189,90 TL | 859,90 TL | +%353 | 500g vs 1kg — gerçekten farklı |
| Kuzu Pirzola | 299,90 TL | 989,95 TL | +%230 | 500g vs 1kg — gerçekten farklı |
| Sütaş Süzme Peynir | 79,90 TL | 249,95 TL | +%213 | 500g vs 900gr — gerçekten farklı |
| Sarımsak | 49,95 TL | 134,90 TL | +%170 | 250gr vs 1kg — gerçekten farklı |
| Patates | 52 TL | 134,95 TL | +%160 | 2.5kg vs 5kg — gerçekten farklı |
| Limon | 22 TL | 49,90 TL | +%127 | Aynı birim (1 kg) — fiyat güncellemesi |
| Ritz Kraker | 29 TL | 64,95 TL | +%124 | Format farkı "200 g"/"200 gr" — fiyat güncellemesi |
| Brokoli | 34,90 TL | 74,95 TL | +%115 | Aynı birim — fiyat güncellemesi |
| Kivi | 89,90 TL | 179,95 TL | +%100 | Aynı birim — fiyat güncellemesi |
| Avokado | 54,90 TL | 114,95 TL | +%109 | Aynı birim — fiyat güncellemesi |

---

## BÖLÜM 5 — FARKLI GRAMAJ/BİRİM OLAN ÜRÜNLER (GERÇEKTEN AYRI ÜRÜNLER)

Bu 13 grup, farklı gramaj veya satış birimi içerdiği için **ayrı ürün** olarak taşınacak.  
Her birinin ismine birim eki eklenmelidir.

| Mevcut İsim | Önerilen Yeni İsimler |
|-------------|----------------------|
| Dana Bonfile | Dana Bonfile 500g · Dana Bonfile 1kg |
| Dana Kıyma | Dana Kıyma 500g · Dana Kıyma 1kg |
| Kuzu Pirzola | Kuzu Pirzola 500g · Kuzu Pirzola 1kg |
| Sütaş Süzme Peynir | Sütaş Süzme Peynir 500g · Sütaş Süzme Peynir 900gr |
| Sarımsak | Sarımsak 250gr · Sarımsak 1kg |
| Patates | Patates 2.5kg · Patates 5kg |
| Sütaş Ayran | Sütaş Ayran 500ml · Sütaş Ayran 1L |
| Kiraz | Kiraz 500g · Kiraz 1kg |
| Mantar | Mantar 500gr · Mantar 1kg |
| Kavun | Kavun (adet) · Kavun (kg) |
| Uludağ Gazoz | Uludağ Gazoz 330ml · Uludağ Gazoz 1L |
| Plastik Saklama Kabı | Plastik Saklama Kabı (değerlendir) |
| Elma Granny Smith | Tek birim — manuel kontrol |

---

## BÖLÜM 6 — FARKLI KATEGORİYE DÜŞEN ÜRÜNLER

Yapılan analizde **hiçbir duplicate grubun farklı kategoride** olmadığı tespit edildi.  
Tüm 76 grupta kategori tutarlı.

Bununla birlikte genel katalogda kategori yerleşimi gözden geçirilmeli:

```
Dikkat: index.html'de "sut-sarkuteri" kategorisi hem süt ürünleri hem
şarküteri hem de helva, tahin, bal gibi ürünleri barındırıyor.
Migration'da bu kategori alt kategorilere bölünebilir:
  sut-sarkuteri → sut, sarkuteri, kahvaltilik-yan
  
Bu bir kategorilendirme kararıdır, veri sorunu değildir.
Sahip onaylamalı.
```

---

## BÖLÜM 7 — ÜRÜN İSMİ NORMALİZASYON ÖNERİSİ

### 7.1 Birim Standardizasyonu

| Mevcut (tutarsız) | Standart (kullanılacak) |
|-------------------|------------------------|
| `bag`, `bağ`, `BAĞ` | `bağ` |
| `sise`, `şişe`, `ŞIŞE` | `şişe` |
| `tup`, `tüp` | `tüp` |
| `1kg`, `1 kg` | `1 kg` |
| `500g`, `500gr`, `500 gr` | `500g` |
| `250g`, `250gr`, `250 gr` | `250g` |
| `1.5L`, `1.5 L`, `1500ml` | `1.5 L` |
| `mini`, `20 ml` (birim alanında boyut) | boyutu isme taşı |

### 7.2 İsim Yazım Standartları

```
Kural 1: Baş harf büyük, devamı küçük
  YANLIŞ: "DERBY BANYO SABUNU"
  DOĞRU:  "Derby Banyo Sabunu"

Kural 2: Boyut/miktar isim sonuna parantez veya tire ile eklenir
  YANLIŞ: iki ayrı "Dana Bonfile" farklı fiyatla
  DOĞRU:  "Dana Bonfile - 500g" ve "Dana Bonfile - 1kg"

Kural 3: Marka varsa önce gelir
  YANLIŞ: "Çayı Çaykur Rize Turist"
  DOĞRU:  "Çaykur Rize Turist Çayı"

Kural 4: Türkçe karakter zorunlu
  YANLIŞ: bag, sise, tup, kiyma
  DOĞRU:  bağ, şişe, tüp, kıyma

Kural 5: Badge yazım hataları düzeltilecek
  YANLIŞ: "DOŞAL", "SAŞLIKLI"
  DOĞRU:  "DOĞAL", "SAĞLIKLI"
```

### 7.3 SKU (Stok Kodu) Formatı Önerisi

```
Yeni sistemde her ürünün benzersiz SKU'su olacak:
  Kategori kodu (3 harf) + Sıra numarası (4 rakam)
  Örnekler:
    MNV0001 → Manav ürünleri
    KSP0001 → Kasap ürünleri
    TMG0001 → Temel gıda
    SUT0001 → Süt & şarküteri
    ICK0001 → İçecek
    ATT0001 → Atıştırmalık
    TMZ0001 → Temizlik
    KZM0001 → Kozmetik
    EGR0001 → Ev gereçleri
    KHV0001 → Kahvaltılık
    ABK0001 → Anne bebek
  
  Mevcut ID'ler: legacy_id alanında saklanır (geri dönüş için)
```

---

## BÖLÜM 8 — MASTER ÜRÜN SEÇME KURALI

```
Migration sırasında hangi ID "hayatta kalacak" sorusunun cevabı:
```

### Kural Sırası (önce uygulananlar önceliklidir)

```
1. TAMAM KOPYA (fiyat + birim aynı) → Düşük ID master, yüksek ID silinir
   Gerekçe: Eski kayıt daha çok referans almış olabilir

2. ENCODING HATASI VAR → Doğru Türkçe karakterli olan master
   Gerekçe: Veri bütünlüğü

3. BİRİM FORMAT FARKI ('200g' vs '200 gr') → Boşluklu ve uzun format master
   Standart: "200 g" (rakam + boşluk + birim)

4. FİYAT FARKLI, BİRİM AYNI → En yüksek ID master
   Gerekçe: En son eklenen = en güncel fiyat

5. FİYAT FARKLI, BİRİM FARKLI → Her biri ayrı ürün, isimler normalize edilir
   Gerekçe: Gerçekten farklı ürünler

6. MANUEL KONTROL grubunda → Sahip kararı + en yüksek ID öneri
```

### Otomatik Karar Uygulanamayacak Durumlar

```
Fiyat düşmüş (yüksek ID'de daha düşük fiyat):
  → Sahip hangi fiyatın güncel olduğunu doğrulamalı
  → Sadece ondan sonra migration scripti çalıştırılmalı

Görsel farklı (aynı ürün ama farklı fotoğraf):
  → Daha kaliteli görsel seçilmeli (sahip kararı)
  → Otomatik karar yapılamaz
```

---

## BÖLÜM 9 — FİZİKSEL SAYIM ŞABLONU

```
Tarih: ___/___/______    Şube: _______________
Sayım Yapan: ___________  Kontrol Eden: ________
```

### 9.1 Sayım Formu (Excel/Kağıt)

| Sıra | Ürün Adı | Ürün ID | Birim | Sistem Stoğu | Sayılan Miktar | Fark | Açıklama |
|------|----------|---------|-------|-------------|----------------|------|----------|
| 1 | Salkım Domates | 1 | 1 kg | 0 | ___ | ___ | |
| 2 | Kıvırcık Salatalık | 2 | 1 kg | 0 | ___ | ___ | |
| ... | ... | ... | ... | 0 | ___ | ___ | |

*(Sistem stoğu başlangıçta tümü "0" çünkü stok verisi yok)*

### 9.2 Sayım Grupları (Öncelik Sırasına Göre)

```
GRUP 1 — KASAP & MANAV (günlük değişen, önce sayılmalı):
  Kategoriler: kasap, manav
  Öneri: İlk sayım sabah 07:00-08:00 arası
  Sayım şekli: Kg veya adet

GRUP 2 — TEMEL GIDA (hızlı dönen):
  Kategoriler: temel-gida, icecek
  Öneri: Kapalı gün veya sabah erken
  
GRUP 3 — PAKETLI ÜRÜNLER (stabil):
  Kategoriler: sut-sarkuteri, atistirmalik, temizlik, kozmetik,
               ev-gerecleri, kahvaltilik, anne-bebek
  Öneri: Herhangi bir saatte
```

### 9.3 Sayım Kuralları

```
1. KÖR SAYIM: Sayımcı sistem miktarlarını görmez
   (Sistem başlangıçta zaten sıfır, bu kural ileride önem kazanır)

2. ÇIFT KONTROL: Her raf en az 2 kişi tarafından sayılır

3. KAYIT ANINDA: Sayılan ürün hemen forma girilir, bellekten değil

4. TARTILI ÜRÜNLER: Gram cinsinden sayılır, kg'a çevrilir
   Örnek: 3.500 gram = 3,5 kg

5. YARIM PAKET: 0,5 birim olarak girilir
   Örnek: Yarım açık koli = 0,5

6. HASARLI ÜRÜN: Sayıma dahil edilmez, fire formu doldurulur

7. SAYIM SONU: Form imzalanır, sisteme bu miktar başlangıç stoğu olarak girilir
```

### 9.4 Sayım Sonucu Sisteme Giriş

```
Her ürün için:
  INSERT INTO stock (product_id, branch_id, quantity, last_counted_at)
  VALUES (ürün_id, şube_id, sayılan_miktar, sayım_tarihi)
  
  INSERT INTO stock_movements (product_id, branch_id, type, quantity, notes)
  VALUES (ürün_id, şube_id, 'initial_count', sayılan_miktar, 'İlk fiziksel sayım')

Bu işlem migration scriptine dahil edilecek.
```

---

## BÖLÜM 10 — KUPON VE AYARLARIN SUPABASE'E TAŞINMA LİSTESİ

### 10.1 Kupon Kodları (6 adet)

Aşağıdaki kayıtlar Supabase'e manuel girilecek:

```sql
-- coupons tablosuna eklenecekler:
INSERT INTO coupons (code, type, value, gift_product_name, description, is_active)
VALUES
  ('AYDIN5',  'percentage', 5,    NULL,                        '%5 İndirim',                    true),
  ('AYDIN10', 'percentage', 10,   NULL,                        '%10 İndirim',                   true),
  ('EKMEK',   'gift',       0,    'Sıcak Somun Ekmek',         'Hediye Ekmek',                  true),
  ('HEDIYE',  'gift',       0,    'Ülker Çikolatalı Gofret',   'Hediye Çikolata',               true),
  ('CIKO',    'gift',       0,    'Ülker Çikolatalı Gofret',   'Hediye Çikolata (2. kod)',       true),
  ('BEDAVA',  'free_shipping', 0, NULL,                        'Ücretsiz Teslimat',             true);
```

### 10.2 Genel Ayarlar

```sql
-- settings tablosuna eklenecekler:
INSERT INTO settings (tenant_id, key, value)
VALUES
  (tenant_uuid, 'free_delivery_threshold',  '1000'),
  (tenant_uuid, 'whatsapp_number',           '905444789461'),
  (tenant_uuid, 'announcement_text',         '1000₺ üzeri siparişlerde ÜCRETSİZ TESLİMAT!');
```

### 10.3 Şube Bilgileri

```sql
-- branches tablosuna eklenecekler:
INSERT INTO branches (tenant_id, name, address, is_main, is_active)
VALUES
  (tenant_uuid, 'Geyras (Merkez) Şube', 'Geyras Mah. Aydın Cad. No:1', true,  true),
  (tenant_uuid, 'Efeler Şube',           'Efeler Mah. Gros Cad. No:5',  false, true);
```

### 10.4 İlk Admin Kullanıcısı

```
E-posta:  aydin5860.ab@gmail.com
Şifre:    Güvenli yeni şifre (password manager ile oluştur)
Rol:      tenant_admin
NOT:      'aydin2026' şifresi GEÇERSİZ SAYILDI. Asla kullanılmayacak.
```

### 10.5 erenler-products.json Kararı

```
84 ürün — 43'ü ana listede var (farklı fiyatla), 41'i ana listede YOK.

Seçenekler:
  A) Efeler şubesine özel fiyat listesi olarak ekle (43 ürün fiyat override)
  B) 41 yeni ürünü de ana kataloğa ekle, Efeler şubesi fiyatını override yap
  C) Şimdilik ihmal et, Efeler şubesi sonradan elle günceller

Öneri: C (Faz 0'da ihmal et, Faz 1'de şube fiyatlandırma modülü devreye girince ele al)
Sahip kararı gerekli.
```

---

## BÖLÜM 11 — TEMİZ VERİ KABUL KRİTERLERİ

Migration scripti çalışmadan önce aşağıdaki 12 kriter sağlanmalıdır:

```
ÜRÜN VERİSİ
[ ] KR01: Tüm ürünlerde id, name, unit, cat, price alanları dolu
[ ] KR02: Hiçbir ürünün fiyatı 0 veya negatif değil
[ ] KR03: Hiçbir ürünün kategorisi geçersiz (sadece 11 kategori kabul edilir)
[ ] KR04: Duplicate isimler kararlandırıldı: ya birleştirildi ya isimleri farklılaştırıldı
[ ] KR05: Birim alanları standardize edildi (bag→bağ, sise→şişe, tup→tüp)
[ ] KR06: İsim büyük harf tutarsızlıkları giderildi ("DERBY" → "Derby")
[ ] KR07: Badge yazım hataları düzeltildi (DOŞAL→DOĞAL)

STOK VERİSİ
[ ] KR08: En az Merkez şube için fiziksel sayım yapıldı
[ ] KR09: Her ürün için başlangıç stoğu belirlendi (0 kabul edilir, ama bilinçli 0)

BAĞLANTI & TAŞIMA
[ ] KR10: Supabase bağlantısı test edildi (connection string doğrulandı)
[ ] KR11: Şube bilgileri Supabase'e girildi
[ ] KR12: Admin kullanıcısı oluşturuldu ve giriş test edildi

GÜVENLIK
[ ] KR13: 'aydin2026' şifresi artık hiçbir yerde aktif değil
[ ] KR14: Supabase service role key kod deposunda yok
[ ] KR15: RLS politikaları test tenant'ı ile test edildi
```

**Migration onay koşulu:** KR01-KR07 tam, KR08-KR15 en az 10/8 sağlanmış olmalı.

---

## BÖLÜM 12 — ÇALIŞMA TAKVİMİ ÖNERİSİ

```
Hafta 1:  Manuel kontrol gerektiren 7 grubu (G05, G40-G42, G60-G61) sahiple gözden geçir
Hafta 1:  erenler-products.json kararı
Hafta 2:  Merkez şube fiziksel sayım
Hafta 3:  Efeler şube fiziksel sayım (opsiyonel — Faz 1'e bırakılabilir)
Hafta 4:  Migration scripti yazımı (Faz 1 görevi)
Hafta 4:  Test ortamında migration
Hafta 5:  Production migration
```

---

*Bu belge salt okunur analiz ve karar rehberidir.*  
*Hiçbir ürün verisi değiştirilmedi.*  
*Son güncelleme: 27 Haziran 2026*
