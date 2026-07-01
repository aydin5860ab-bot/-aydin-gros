import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/auth';

export async function POST(req: NextRequest) {
  // 1. IP-based Rate Limiting (Hardening against PIN brute forcing)
  const forwarded = req.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0] : '127.0.0.1';

  const rateLimit = checkRateLimit(ip, 5, 60000); // 5 attempts per minute max
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Çok fazla giriş denemesi. Lütfen bir dakika bekleyin.' },
      { status: 429 }
    );
  }

  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'E-posta ve şifre gereklidir' }, { status: 400 });
    }

    if (process.env.FORCE_JSON_DB === 'true') {
      const crypto = require('crypto');
      const secret = process.env.JWT_SECRET || 'aydingros-offline-secret-key-12345';
      const headerB64 = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64')
        .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
      const payloadB64 = Buffer.from(JSON.stringify({
        sub: 'dummy-uuid',
        email,
        user_metadata: { role: 'admin', tenant_id: '11111111-1111-1111-1111-111111111111' }
      })).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
      
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(`${headerB64}.${payloadB64}`);
      const sig = hmac.digest('base64url');
      const token = `${headerB64}.${payloadB64}.${sig}`;

      const response = NextResponse.json({
        user: { email, id: 'dummy-uuid' },
        role: 'admin',
        token
      });

      response.cookies.set('sb-access-token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 60 * 60 * 24, // 1 day
        path: '/'
      });

      return response;
    }

    const client = createServerClient();
    if (!client) {
      return NextResponse.json({ error: 'Veritabanı bağlantısı kurulamadı' }, { status: 500 });
    }

    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error || !data.user || !data.session) {
      return NextResponse.json({ error: 'Geçersiz e-posta veya şifre' }, { status: 401 });
    }

    const role = data.user.user_metadata?.role || data.user.app_metadata?.role || 'viewer';
    const tenantId = data.user.user_metadata?.tenant_id || data.user.app_metadata?.tenant_id || null;

    const response = NextResponse.json({
      user: { id: data.user.id, email: data.user.email },
      role,
      tenant_id: tenantId,
      token: data.session.access_token
    });

    // Set secure HttpOnly session cookie
    response.cookies.set('sb-access-token', data.session.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: data.session.expires_in || 3600,
      path: '/'
    });

    return response;
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
