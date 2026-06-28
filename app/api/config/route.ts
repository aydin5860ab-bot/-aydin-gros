import { NextResponse } from 'next/server';

export async function GET() {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return NextResponse.json({ error: 'Supabase yapılandırılmamış' }, { status: 503 });
  }

  return NextResponse.json(
    { url, anonKey },
    {
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=3600',
      },
    }
  );
}
export const dynamic = 'force-dynamic';
