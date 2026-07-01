import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import Stripe from 'stripe';
import fs from 'fs';
import path from 'path';

export async function POST(req: NextRequest) {
  const db = createAdminClient();
  if (!db) {
    return NextResponse.json({ error: 'DB bağlantısı yok' }, { status: 500 });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  try {
    let event: any;
    const bodyText = await req.text();

    if (stripeKey && endpointSecret) {
      // Signature verified Stripe event
      const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' as any });
      const sig = req.headers.get('stripe-signature');
      if (!sig) {
        return NextResponse.json({ error: 'Signature missing' }, { status: 400 });
      }
      event = stripe.webhooks.constructEvent(bodyText, sig, endpointSecret);
    } else {
      // Mock Sandbox Event Parsing
      console.log('[Billing Webhook] Sandbox Mode — processing payload without signature verification');
      try {
        event = JSON.parse(bodyText);
      } catch (e) {
        return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
      }
    }

    console.log(`[Billing Webhook] Received event type: ${event.type}`);

    // Handle checkout session completion
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const tenantId = session.metadata?.tenant_id;
      const plan = session.metadata?.plan || 'pro';

      if (!tenantId) {
        return NextResponse.json({ error: 'tenant_id missing in metadata' }, { status: 400 });
      }

      // Calculate expiration date (e.g. 1 month from now)
      const licenseEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      // Fetch tenant from db
      const { data: tenant } = await db
        .from('tenants')
        .select('*')
        .eq('id', tenantId)
        .maybeSingle();

      const existingSettings = tenant?.settings || {};
      const updatedSettings = {
        ...existingSettings,
        package: plan,
        license_ends_at: licenseEndsAt,
      };

      // Update Database
      const { error: dbErr } = await db
        .from('tenants')
        .update({
          status: 'active',
          subscription_plan: plan,
          subscription_status: 'active',
          settings: updatedSettings
        })
        .eq('id', tenantId);

      if (dbErr) {
        console.error('[Billing Webhook] Database update error:', dbErr.message);
      }

      // Update Local JSON file fallback for offline/development test compatibility
      try {
        const dbFile = 'C:/AYDIN GROS/db_tenants.json';
        if (fs.existsSync(dbFile)) {
          const tenantsList = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
          const idx = tenantsList.findIndex((t: any) => t.id === tenantId);
          if (idx > -1) {
            tenantsList[idx].status = 'active';
            tenantsList[idx].subscription_plan = plan;
            tenantsList[idx].subscription_status = 'active';
            tenantsList[idx].settings = {
              ...(tenantsList[idx].settings || {}),
              package: plan,
              license_ends_at: licenseEndsAt
            };
            fs.writeFileSync(dbFile, JSON.stringify(tenantsList, null, 2), 'utf8');
            console.log('[Billing Webhook] Local JSON database updated for tenant:', tenantId);
          }
        }
      } catch (fsErr: any) {
        console.warn('[Billing Webhook] Fallback file update warning:', fsErr.message);
      }

      console.log(`[Billing Webhook] License successfully activated for Tenant: ${tenantId}, Plan: ${plan}`);
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error('[Billing Webhook] Internal handler error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
