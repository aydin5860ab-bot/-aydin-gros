import { NextRequest, NextResponse } from 'next/server';

async function fetchErenler(slug: string, page: number): Promise<string> {
  const url = `https://www.erenlercep.com/${encodeURIComponent(slug)}?page=${page}`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache'
      },
      next: { revalidate: 0 } // Disable fetch cache
    });
    if (!res.ok) return '';
    return await res.text();
  } catch (e) {
    console.error("fetchErenler error:", e);
    return '';
  }
}

function parseErenlerHTML(html: string) {
  const products: any[] = [];
  const productBlocks = html.split('class="product-thumb"');
  for (let i = 1; i < productBlocks.length; i++) {
    const block = productBlocks[i].substring(0, 2000);
    const nameMatch = block.match(/class="name"[^>]*>(?:<[^>]+>)*([^<]{2,80})(?:<\/|<[^>]+>)/);
    const nameMatch2 = block.match(/class="name"><a[^>]*>([^<]{2,80})<\/a>/);
    const priceMatch = block.match(/class="price-normal"[^>]*>([\d.,]+\s*₺)/);
    const name = (nameMatch2 && nameMatch2[1]) || (nameMatch && nameMatch[1]);
    if (name && priceMatch) {
      const price = parseFloat(priceMatch[1].replace(',','.').replace(/[^0-9.]/g,''));
      if (price > 0) products.push({name: name.trim(), price});
    }
  }
  return products;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const slug = searchParams.get('slug') || 'gida';
  const page = parseInt(searchParams.get('page') || '1', 10);

  try {
    const html = await fetchErenler(slug, page);
    const products = parseErenlerHTML(html);
    return NextResponse.json({ products, count: products.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message, products: [] }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
