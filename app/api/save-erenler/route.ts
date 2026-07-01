import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '@/lib/auth';
import fs from 'fs';
import path from 'path';

export async function POST(req: NextRequest) {
  const auth = await checkAuth(req);
  if (!auth.isAuthenticated || auth.role !== 'admin') {
    return NextResponse.json({ error: 'Bu debug işlemine yetkiniz yok' }, { status: 403 });
  }
  const baseDir = process.cwd();
  const filePath = path.join(baseDir, 'erenler-products.json');

  try {
    const data = await req.json();
    const existing = fs.existsSync(filePath)
      ? JSON.parse(fs.readFileSync(filePath, 'utf8'))
      : [];
    const merged = existing.concat(data);
    
    // In Vercel, writing files may fail or not persist, but we support it for local dev
    try {
      fs.writeFileSync(filePath, JSON.stringify(merged));
    } catch (e) {
      console.warn('File write not supported on this platform:', e);
    }
    
    return NextResponse.json({ ok: true, total: merged.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
