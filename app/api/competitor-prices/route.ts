import { NextRequest, NextResponse } from 'next/server';

const APIFY_BASE = 'https://api.apify.com/v2';

const ERENLER_SLUGS = [
  // MANAV
  'meyve-sebze',
  // GIDA ana + alt
  'gida', 'atistirmalik', 'bakliyat', 'makarna', 'baharat', 'konserve',
  'dondurma', 'kahve', 'hazir-corba', 'unlu-mamuller', 'ekmek', 'tatli',
  'recel', 'sucuk', 'salam', 'bal', 'yogurt',
  // İÇECEKLER
  'icecek',
  // SÜT
  'sut',
  // KASAP
  'kasap',
  // TEMİZLİK ana + alt
  'temizlik', 'islak-havlu', 'kagit-havlu',
  // KİŞİSEL BAKIM
  'parfum', 'kisisel-bakim',
];

const PAGE_FUNCTION = `
async function pageFunction(context) {
  const { $, request, pushData } = context;
  const url = request.url;
  const m = url.match(/erenlercep\\.com\\/([^/?]+)/);
  const cat = m ? m[1] : '';
  const items = [];
  $('.product-thumb').each(function() {
    const name = $(this).find('.name a').text().trim() || $(this).find('.name').first().text().trim();
    if (!name || name.length < 2) return;
    const priceRaw = $(this).find('.price-normal').first().text().trim();
    const price = parseFloat(priceRaw.replace(/\\./g,'').replace(',','.').replace(/[^0-9.]/g,''));
    if (price > 0) items.push({ name, price, cat });
  });
  for (const item of items) await pushData(item);
}
`.trim();

export async function POST(req: NextRequest) {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    return NextResponse.json({ error: 'APIFY_TOKEN ortam değişkeni tanımlı değil' }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const slugs: string[] = body.slugs ?? ERENLER_SLUGS;
  const pages: number = Math.min(body.pages ?? 5, 10);

  const startUrls = slugs.flatMap(slug =>
    Array.from({ length: pages }, (_, i) => ({
      url: `https://www.erenlercep.com/${slug}${i > 0 ? `?page=${i + 1}` : ''}`,
    }))
  );

  const actorInput = {
    startUrls,
    pageFunction: PAGE_FUNCTION,
    maxConcurrency: 8,
    maxRequestRetries: 2,
  };

  const res = await fetch(
    `${APIFY_BASE}/acts/apify~cheerio-scraper/runs?token=${token}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(actorInput),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: `Apify başlatılamadı: ${err}` }, { status: 502 });
  }

  const { data } = await res.json();
  return NextResponse.json({
    runId: data.id,
    datasetId: data.defaultDatasetId,
    status: data.status,
    startedAt: data.startedAt,
    urlCount: startUrls.length,
  });
}

export async function GET(req: NextRequest) {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    return NextResponse.json({ error: 'APIFY_TOKEN ortam değişkeni tanımlı değil' }, { status: 503 });
  }

  const runId = req.nextUrl.searchParams.get('runId');
  if (!runId) {
    return NextResponse.json({ error: 'runId gerekli' }, { status: 400 });
  }

  const runRes = await fetch(`${APIFY_BASE}/actor-runs/${runId}?token=${token}`);
  if (!runRes.ok) {
    return NextResponse.json({ error: 'Run bulunamadı' }, { status: 404 });
  }

  const { data: run } = await runRes.json();
  const status: string = run.status;

  if (status === 'RUNNING' || status === 'READY' || status === 'ABORTING') {
    const stats = run.stats ?? {};
    return NextResponse.json({
      status,
      requestsFinished: stats.requestsFinished ?? 0,
      requestsTotal: stats.requestsTotal ?? 0,
    });
  }

  if (status !== 'SUCCEEDED') {
    return NextResponse.json({ status, error: `Apify run durumu: ${status}` }, { status: 422 });
  }

  const datasetId: string = run.defaultDatasetId;
  const itemsRes = await fetch(
    `${APIFY_BASE}/datasets/${datasetId}/items?token=${token}&format=json&clean=true&limit=20000`
  );

  if (!itemsRes.ok) {
    return NextResponse.json({ error: 'Dataset alınamadı' }, { status: 502 });
  }

  const raw: { name?: string; price?: number; cat?: string }[] = await itemsRes.json();

  // Dedup: aynı isimde birden fazla kayıt varsa en düşük fiyatı tut
  const seen = new Map<string, { name: string; price: number; cat: string }>();
  for (const item of raw) {
    if (!item.name || !item.price || item.price <= 0) continue;
    const key = item.name.toLowerCase().trim();
    const existing = seen.get(key);
    if (!existing || item.price < existing.price) {
      seen.set(key, { name: item.name.trim(), price: item.price, cat: item.cat ?? '' });
    }
  }

  const items = Array.from(seen.values());

  return NextResponse.json({
    status: 'SUCCEEDED',
    items,
    totalItems: items.length,
    finishedAt: run.finishedAt,
    runId,
    datasetId,
  });
}

export const dynamic = 'force-dynamic';
