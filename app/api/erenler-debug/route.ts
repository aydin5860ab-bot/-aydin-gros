import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const auth = await checkAuth(req);
  if (!auth.isAuthenticated || auth.role !== 'admin') {
    return NextResponse.json({ error: 'Bu debug işlemine yetkiniz yok' }, { status: 403 });
  }

  const slug = req.nextUrl.searchParams.get('slug') || 'meyve-sebze';
  const url = `https://www.erenlercep.com/${encodeURIComponent(slug)}`;
  
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0',
        'Accept': 'text/html',
      },
      next: { revalidate: 0 }
    });
    const body = await res.text();
    return NextResponse.json({
      status: res.status,
      bodyLen: body.length,
      first300: body.substring(0, 300),
      hasThumb: body.includes('product-thumb')
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
