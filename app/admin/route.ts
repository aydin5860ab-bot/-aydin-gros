import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const redirectUrl = new URL('/admin.html', request.url);
  return NextResponse.redirect(redirectUrl.toString(), 301);
}

export const dynamic = 'force-dynamic';
