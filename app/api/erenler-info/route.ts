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
      next: { revalidate: 0 }
    });
    if (!res.ok) return '';
    return await res.text();
  } catch (e) {
    return '';
  }
}

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug') || 'gida';
  try {
    const html = await fetchErenler(slug, 1);
    const m = html.match(/toplam:\s*(\d+)\s*\((\d+)\s*Sayfa\)/);
    return NextResponse.json({
      total: m ? parseInt(m[1], 10) : 0,
      pages: m ? parseInt(m[2], 10) : 1
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
