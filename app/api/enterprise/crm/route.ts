import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { checkAuth } from '@/lib/auth';
import { readCollection, writeCollection } from '@/lib/db';

const TENANT = process.env.DEFAULT_TENANT_ID ?? '11111111-1111-1111-1111-111111111111';

export async function GET(req: NextRequest) {
  const auth = await checkAuth(req);
  if (!auth.isAuthenticated) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 });
  }

  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: 'DB bağlantısı yok' }, { status: 500 });

  const tenantId = auth.tenantId || TENANT;
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');
  const id = searchParams.get('id');
  const phone = searchParams.get('phone');

  // Fetch all customers or profile
  const customers = await readCollection<any>('customers', tenantId, db);

  if (action === 'profile' && id) {
    const customer = customers.find(c => c.id === id);
    if (!customer) {
      return NextResponse.json({ error: 'Müşteri bulunamadı' }, { status: 404 });
    }
    const profile360 = await buildCustomer360(db, customer, tenantId);
    return NextResponse.json(profile360);
  }

  if (phone) {
    // Phone lookup for POS
    const customer = customers.find(c => c.phone === phone || c.phone === phone.replace('+', '').trim());
    if (!customer) {
      return NextResponse.json({ error: 'Müşteri bulunamadı' }, { status: 404 });
    }
    const profile360 = await buildCustomer360(db, customer, tenantId);
    return NextResponse.json(profile360);
  }

  // List all customers with simple profile structures
  const list360 = await Promise.all(customers.map(c => buildCustomer360(db, c, tenantId)));
  return NextResponse.json(list360);
}

export async function POST(req: NextRequest) {
  const auth = await checkAuth(req);
  if (!auth.isAuthenticated) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 });
  }

  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: 'DB bağlantısı yok' }, { status: 500 });

  const tenantId = auth.tenantId || TENANT;
  const body = await req.json();

  const customers = await readCollection<any>('customers', tenantId, db);

  const {
    id,
    full_name,
    phone,
    email,
    notes,
    tags,
    customer_type,
    business_tax_id,
    business_tax_office,
    family_id,
    consent_marketing,
    is_active
  } = body;

  if (!full_name) {
    return NextResponse.json({ error: 'full_name alanı zorunludur' }, { status: 400 });
  }

  let customer: any;

  if (id) {
    // Update existing customer
    const idx = customers.findIndex(c => c.id === id);
    if (idx === -1) {
      return NextResponse.json({ error: 'Güncellenecek müşteri bulunamadı' }, { status: 404 });
    }
    customer = {
      ...customers[idx],
      full_name,
      phone: phone || customers[idx].phone || '',
      email: email || customers[idx].email || '',
      notes: notes !== undefined ? notes : customers[idx].notes,
      tags: tags || customers[idx].tags || [],
      customer_type: customer_type || customers[idx].customer_type || 'individual',
      business_tax_id: business_tax_id !== undefined ? business_tax_id : customers[idx].business_tax_id,
      business_tax_office: business_tax_office !== undefined ? business_tax_office : customers[idx].business_tax_office,
      family_id: family_id !== undefined ? family_id : customers[idx].family_id,
      consent_marketing: consent_marketing !== undefined ? consent_marketing : customers[idx].consent_marketing,
      is_active: is_active !== undefined ? is_active : customers[idx].is_active,
      updated_at: new Date().toISOString()
    };
    customers[idx] = customer;
  } else {
    // Check phone uniqueness
    if (phone && customers.some(c => c.phone === phone)) {
      return NextResponse.json({ error: 'Bu telefon numarası ile kayıtlı başka bir müşteri var' }, { status: 400 });
    }

    // Strictly enforce KVKK / GDPR compliance on registration
    if (body.kvkk_consent !== true) {
      return NextResponse.json({ error: 'Müşteri kaydı için KVKK ve Açık Rıza onayı zorunludur.' }, { status: 400 });
    }

    const forwarded = req.headers.get('x-forwarded-for');
    const clientIp = forwarded ? forwarded.split(',')[0] : '127.0.0.1';

    // Create new customer
    customer = {
      id: body.id || `cust-${Date.now()}`,
      tenant_id: tenantId,
      full_name,
      phone: phone || '',
      email: email || '',
      notes: notes || '',
      tags: tags || [],
      is_active: true,
      customer_type: customer_type || 'individual',
      business_tax_id: business_tax_id || null,
      business_tax_office: business_tax_office || null,
      family_id: family_id || null,
      consent_marketing: consent_marketing !== undefined ? consent_marketing : true,
      kvkk_consent: true,
      kvkk_consent_ip: clientIp,
      kvkk_consent_date: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    customers.push(customer);

    // Save KVKK consent log to corporate audits list
    if (db) {
      await db.from('audit_logs').insert({
        tenant_id: tenantId,
        action: 'KVKK_CONSENT_GRANTED',
        user_email: auth.email || 'cashier@aydingros.com',
        details: `Müşteri [Ad: ${full_name}, Tel: ${phone}] KVKK Açık Rıza Onayı verdi. (IP: ${clientIp})`
      });
    }
  }

  await writeCollection('customers', customers, tenantId, db);
  return NextResponse.json(customer);
}

// Build Customer 360 Object dynamically
async function buildCustomer360(db: any, customer: any, tenantId: string): Promise<any> {
  const orders = await readCollection<any>('orders', tenantId, db);
  
  // Filter customer orders
  const custOrders = orders.filter(o => 
    o && (o.customer_id === customer.id || o.customer_phone === customer.phone)
  );

  const totalSpend = custOrders.reduce((sum, o) => {
    const rawTotal = o.total || o.total_amount || 0;
    const val = typeof rawTotal === 'string' ? parseFloat(rawTotal.replace(/[^0-9.-]+/g, "")) || 0 : parseFloat(rawTotal) || 0;
    return sum + val;
  }, 0);

  const avgBasket = custOrders.length > 0 ? totalSpend / custOrders.length : 0;
  
  // Categories & brands affinity
  const categoryCount: Record<string, number> = {};
  const brandCount: Record<string, number> = {};
  
  custOrders.forEach(o => {
    const items = o.items || o.items_data || [];
    if (Array.isArray(items)) {
      items.forEach(item => {
        if (!item) return;
        const cat = item.category || 'genel';
        const brand = item.brand || 'diger';
        categoryCount[cat] = (categoryCount[cat] || 0) + 1;
        brandCount[brand] = (brandCount[brand] || 0) + 1;
      });
    }
  });

  const favoriteCategories = Object.entries(categoryCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(x => x[0]);

  const preferredBrands = Object.entries(brandCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(x => x[0]);

  const lastVisit = custOrders.length > 0 
    ? custOrders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0].created_at 
    : customer.created_at;

  const daysSinceLastVisit = Math.floor((Date.now() - new Date(lastVisit).getTime()) / (1000 * 60 * 60 * 24));
  
  // Risk Score calculation
  let churnRisk = 5;
  if (daysSinceLastVisit > 60) churnRisk = 95;
  else if (daysSinceLastVisit > 30) churnRisk = 75;
  else if (daysSinceLastVisit > 15) churnRisk = 45;
  else if (daysSinceLastVisit > 7) churnRisk = 15;

  // AI Summary card text
  let summary = '';
  if (totalSpend > 5000) {
    summary = `Düzenli alışveriş yapan VIP müşteri. Sepet ortalaması ₺${avgBasket.toFixed(2)} ile yüksek seviyede.`;
  } else if (churnRisk > 70) {
    summary = `Son ${daysSinceLastVisit} gündür mağazaya uğramayan yüksek riskli müşteri. Acil geri kazanım kampanyası tanımlanmalı.`;
  } else {
    summary = `İlişkisi aktif, düşük riskli bireysel müşteri. Tercih ettiği ürün grupları: ${favoriteCategories.join(', ') || 'Manav'}.`;
  }

  // Dynamic Segments
  const segments: string[] = [];
  if (totalSpend > 5000) segments.push('VIP');
  else if (totalSpend > 2000) segments.push('Premium');
  else segments.push('Budget');

  if (customer.customer_type === 'business') segments.push('Business Customers');
  if (customer.family_id) segments.push('Family');
  if (churnRisk > 70) segments.push('At Risk');
  if (churnRisk > 90) segments.push('Lost Customer');
  
  const createdDays = Math.floor((Date.now() - new Date(customer.created_at).getTime()) / (1000 * 60 * 60 * 24));
  if (createdDays <= 15) segments.push('New Customer');

  // Next Best Action Decider
  let nextAction: any = {
    action_type: 'offer_bundle',
    title: 'Haftalık Fırsat Paketi Sun',
    details: 'Müşterinin favori kategorisine özel 3 al 2 öde kampanyası önerin.'
  };

  if (churnRisk > 70) {
    nextAction = {
      action_type: 'win_back',
      title: 'Özel Geri Kazanım Kuponu Tanımla',
      details: 'Müşteriyi geri çekmek için WhatsApp üzerinden %15 indirim kuponu ilet.',
      suggested_coupon_id: 'WINBACK15'
    };
  } else if (totalSpend > 1000 && avgBasket > 150) {
    nextAction = {
      action_type: 'upsell',
      title: 'Sadakat VIP Kulüp Yükseltmesi',
      details: 'Müşteriye Gold veya Platinum seviyesine özel kampanya daveti yollayın.'
    };
  }

  // Predictive calculations
  const nextVisitDays = Math.max(3, Math.min(30, Math.floor(30 / (custOrders.length || 1))));
  const nextVisitDate = new Date();
  nextVisitDate.setDate(nextVisitDate.getDate() + nextVisitDays);

  return {
    ...customer,
    lifetime_value: totalSpend,
    average_basket: avgBasket,
    shopping_frequency: custOrders.length > 0 ? (custOrders.length / 3) || 1 : 1, // visits per month
    last_visit_at: lastVisit,
    favorite_categories: favoriteCategories.length > 0 ? favoriteCategories : ['manav'],
    preferred_brands: preferredBrands.length > 0 ? preferredBrands : ['Aydın Gros'],
    ai_summary: summary,
    
    // Predictive
    predicted_next_visit: nextVisitDate.toISOString(),
    predicted_monthly_spending: avgBasket * (custOrders.length > 0 ? (custOrders.length / 3) || 1 : 1),
    churn_probability: churnRisk,
    probability_campaign_success: Math.max(45, 100 - churnRisk),
    
    segments,
    next_best_action: nextAction
  };
}
