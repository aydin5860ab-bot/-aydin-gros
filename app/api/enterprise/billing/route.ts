import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { checkAuth, isAuthorized } from '@/lib/auth';
import Stripe from 'stripe';

const DEFAULT_SUCCESS_URL = 'http://127.0.0.1:3001/enterprise.html?billing=success';
const DEFAULT_CANCEL_URL = 'http://127.0.0.1:3001/enterprise.html?billing=cancelled';

export async function POST(req: NextRequest) {
  const auth = await checkAuth(req);
  if (!auth.isAuthenticated || !isAuthorized(auth.role, ['owner', 'general_manager', 'admin'])) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 });
  }

  const db = createAdminClient();
  if (!db) {
    return NextResponse.json({ error: 'Veritabanı bağlantısı yok' }, { status: 500 });
  }

  try {
    const body = await req.json();
    const { plan, success_url, cancel_url } = body;
    const tenantId = auth.tenantId || '11111111-1111-1111-1111-111111111111';

    if (!['starter', 'pro', 'enterprise'].includes(plan)) {
      return NextResponse.json({ error: 'Geçersiz plan seçimi' }, { status: 400 });
    }

    const successUrl = success_url || DEFAULT_SUCCESS_URL;
    const cancelUrl = cancel_url || DEFAULT_CANCEL_URL;

    const apiKey = process.env.STRIPE_SECRET_KEY;
    
    if (apiKey) {
      // Live Stripe Checkout Session
      const stripe = new Stripe(apiKey, { apiVersion: '2023-10-16' as any });
      
      let priceId = '';
      if (plan === 'pro') priceId = process.env.STRIPE_PRICE_PRO || 'price_mock_pro';
      else if (plan === 'enterprise') priceId = process.env.STRIPE_PRICE_ENTERPRISE || 'price_mock_enterprise';

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        mode: 'subscription',
        success_url: `${successUrl}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancelUrl,
        metadata: {
          tenant_id: tenantId,
          plan: plan,
        },
      });

      return NextResponse.json({ url: session.url });
    } else {
      // Mock Sandbox Checkout Mode
      console.log(`[Billing API] Mock Stripe session generated for Tenant: ${tenantId}, Plan: ${plan}`);
      const mockSessionId = 'cs_mock_' + crypto.randomUUID();
      const mockRedirectUrl = `${successUrl}&session_id=${mockSessionId}&tenant_id=${tenantId}&plan=${plan}`;
      
      return NextResponse.json({ url: mockRedirectUrl, mock: true });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
