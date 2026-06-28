import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  const baseDir = process.cwd();
  const filePath = path.join(baseDir, 'erenler-products.json');

  try {
    const data = fs.existsSync(filePath)
      ? fs.readFileSync(filePath, 'utf8')
      : '[]';
    return NextResponse.json(JSON.parse(data));
  } catch (error: any) {
    return NextResponse.json([], { status: 200 });
  }
}

export const dynamic = 'force-dynamic';
