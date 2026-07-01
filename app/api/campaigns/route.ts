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
  const active = searchParams.get('active');

  const campaigns = await readCollection<any>('campaigns', tenantId, db);

  if (active === '1') {
    const now = new Date();
    const activeCamps = campaigns.filter(c => {
      if (!c.is_active) return false;
      if (c.starts_at && new Date(c.starts_at) > now) return false;
      if (c.ends_at && new Date(c.ends_at) < now) return false;
      return true;
    });
    return NextResponse.json(activeCamps);
  }

  return NextResponse.json(campaigns);
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

  const campaigns = await readCollection<any>('campaigns', tenantId, db);

  // Calculate discount for a cart
  if (body.action === 'calculate') {
    const calcResult = await calculateDiscount(db, body, tenantId);
    return NextResponse.json(calcResult);
  }

  // Compile campaign rules using NLP natural text
  if (body.action === 'nlp_create') {
    const { prompt } = body;
    if (!prompt) {
      return NextResponse.json({ error: 'Prompt parametresi boş olamaz' }, { status: 400 });
    }
    const compiledRules = parseNLPPrompt(prompt);
    
    const newCamp = {
      id: `camp-${Date.now()}`,
      tenant_id: tenantId,
      name: compiledRules.name,
      description: `NLP Prompt ile oluşturuldu: "${prompt}"`,
      type: compiledRules.type,
      value: compiledRules.value,
      starts_at: new Date().toISOString(),
      ends_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // defaults to 7 days
      is_active: true,
      min_order_amount: compiledRules.min_order_amount,
      applicable_categories: compiledRules.applicable_categories,
      metadata: compiledRules.metadata,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    campaigns.push(newCamp);
    await writeCollection('campaigns', campaigns, tenantId, db);
    return NextResponse.json({ success: true, campaign: newCamp });
  }

  // Standard CRUD
  const { id, ...fields } = body;
  if (id) {
    const idx = campaigns.findIndex(c => c.id === id);
    if (idx === -1) {
      return NextResponse.json({ error: 'Güncellenecek kampanya bulunamadı' }, { status: 404 });
    }
    const updatedCamp = {
      ...campaigns[idx],
      ...fields,
      updated_at: new Date().toISOString()
    };
    campaigns[idx] = updatedCamp;
    await writeCollection('campaigns', campaigns, tenantId, db);
    return NextResponse.json(updatedCamp);
  }

  const newCamp = {
    id: `camp-${Date.now()}`,
    tenant_id: tenantId,
    ...fields,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  campaigns.push(newCamp);
  await writeCollection('campaigns', campaigns, tenantId, db);
  return NextResponse.json(newCamp);
}

export async function DELETE(req: NextRequest) {
  const auth = await checkAuth(req);
  if (!auth.isAuthenticated) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 });
  }

  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: 'DB bağlantısı yok' }, { status: 500 });

  const tenantId = auth.tenantId || TENANT;
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id gerekli' }, { status: 400 });

  const campaigns = await readCollection<any>('campaigns', tenantId, db);
  const idx = campaigns.findIndex(c => c.id === id);
  if (idx !== -1) {
    campaigns[idx].is_active = false;
    campaigns[idx].updated_at = new Date().toISOString();
    await writeCollection('campaigns', campaigns, tenantId, db);
  }

  return NextResponse.json({ ok: true });
}

// Calculate discount taking happy hour, weekend, customer tags, categories into consideration
async function calculateDiscount(db: any, body: {
  items: { id: string; category?: string; price: number; qty: number }[];
  order_total: number;
  customer_id?: string;
  branch_id?: string;
}, tenantId: string) {
  const now = new Date();
  const campaigns = await readCollection<any>('campaigns', tenantId, db);
  
  // Active campaigns
  const activeCampaigns = campaigns.filter(c => {
    if (!c.is_active) return false;
    if (c.starts_at && new Date(c.starts_at) > now) return false;
    if (c.ends_at && new Date(c.ends_at) < now) return false;
    return true;
  });

  let totalDiscount = 0;
  const applied: { name: string; discount: number; type: string }[] = [];

  // Load customer profile if provided to check birthday & tier properties
  let customer: any = null;
  let loyaltyAccount: any = null;
  if (body.customer_id) {
    const customers = await readCollection<any>('customers', tenantId, db);
    customer = customers.find(c => c.id === body.customer_id);
    if (customer) {
      const loyaltyAccounts = await readCollection<any>('loyalty_accounts', tenantId, db);
      loyaltyAccount = loyaltyAccounts.find(la => la.customer_id === customer.id);
    }
  }

  for (const camp of activeCampaigns) {
    if (camp.max_uses && (camp.current_uses || 0) >= camp.max_uses) continue;
    
    const minAmount = parseFloat(camp.min_order_amount || camp.min_order_total || 0);
    if (minAmount && body.order_total < minAmount) continue;

    const metadata = camp.metadata || {};

    // 1. Branch scoping check
    if (camp.branch_id && body.branch_id && camp.branch_id !== body.branch_id) continue;

    // 2. Happy Hour check
    if (metadata.start_hour !== undefined && metadata.end_hour !== undefined) {
      const currentHour = now.getHours();
      if (currentHour < metadata.start_hour || currentHour >= metadata.end_hour) {
        continue; // skip if not inside active hours
      }
    }

    // 3. Weekend scoping check
    if (metadata.weekend_only) {
      const currentDay = now.getDay(); // 0 = Sunday, 6 = Saturday
      if (currentDay !== 0 && currentDay !== 6) continue;
    }

    // 4. Customer tier checking
    if (metadata.allowed_tiers && metadata.allowed_tiers.length > 0) {
      const userTier = loyaltyAccount?.tier || 'bronze';
      if (!metadata.allowed_tiers.includes(userTier)) continue;
    }

    // 5. Birthday check
    if (metadata.birthday_discount && customer) {
      if (!customer.notes?.toLowerCase().includes('dogum') && !metadata.force_birthday_valid) {
        // Mock checks if birthday is not validated
        continue;
      }
    }

    // 6. First Purchase check
    if (metadata.first_purchase_only && customer) {
      if ((customer.lifetime_value || 0) > 0) continue;
    }

    let discount = 0;
    const value = parseFloat(camp.value || 0);

    // Apply category specific discounts
    const hasCategoryFilter = Array.isArray(camp.applicable_categories) && camp.applicable_categories.length > 0;
    let applicableTotal = body.order_total;
    if (hasCategoryFilter) {
      applicableTotal = body.items
        .filter(item => item.category && camp.applicable_categories.includes(item.category))
        .reduce((sum, item) => sum + (item.price * item.qty), 0);
    }

    if (applicableTotal <= 0) continue;

    if (camp.type === 'percentage_discount') {
      discount = applicableTotal * (value / 100);
    } else if (camp.type === 'fixed_discount') {
      discount = Math.min(value, applicableTotal);
    } else if (camp.type === 'spend_threshold_discount') {
      discount = metadata.discount_type === 'percent' 
        ? applicableTotal * (value / 100) 
        : Math.min(value, applicableTotal);
    } else if (camp.type === 'volume_tier_pricing') {
      const targetPid = metadata.product_id;
      const minQty = parseInt(metadata.min_quantity || 5);
      const discPrice = parseFloat(metadata.discounted_price || 0);
      const discPercent = parseFloat(metadata.discounted_percent || 0);

      body.items.forEach((item: any) => {
        const pid = item.product_id || item.id;
        if (targetPid && pid !== targetPid) return;
        if (item.qty >= minQty) {
          let itemDiscount = 0;
          if (discPrice > 0 && discPrice < item.price) {
            itemDiscount = item.qty * (item.price - discPrice);
          } else if (discPercent > 0) {
            itemDiscount = (item.price * item.qty) * (discPercent / 100);
          }
          discount += itemDiscount;
        }
      });
    } else if (camp.type === 'buy_x_get_y') {
      // value acts as [X, Y] encoded as X*100+Y
      const x = Math.floor(value / 100) || 2;
      const y = (value % 100) || 1;
      
      const filteredItems = hasCategoryFilter
        ? body.items.filter(item => item.category && camp.applicable_categories.includes(item.category))
        : body.items;

      const totalQty = filteredItems.reduce((s, i) => s + i.qty, 0);
      const freeItems = Math.floor(totalQty / (x + y)) * y;
      
      if (freeItems > 0) {
        const sortedPrices = filteredItems
          .flatMap(item => Array(item.qty).fill(item.price))
          .sort((a, b) => a - b);
        discount = sortedPrices.slice(0, freeItems).reduce((s, p) => s + p, 0);
      }
    }

    if (discount > 0) {
      totalDiscount += discount;
      applied.push({ name: camp.name, discount, type: camp.type });
    }
  }

  return {
    total_discount: totalDiscount,
    final_total: Math.max(0, body.order_total - totalDiscount),
    applied_campaigns: applied
  };
}

// Simple rule-based NLP prompt parsing
function parseNLPPrompt(prompt: string): {
  name: string;
  type: string;
  value: number;
  min_order_amount?: number;
  applicable_categories?: string[];
  metadata: any;
} {
  const normalized = prompt.toLowerCase();
  let name = 'Yapay Zeka Kampanyası';
  let type = 'percentage_discount';
  let value = 10;
  let min_order_amount = 0;
  let categories: string[] = [];
  const metadata: any = {};

  // Extract percentage
  const pctMatch = normalized.match(/%([0-9]+)/) || normalized.match(/([0-9]+)\s*%/);
  if (pctMatch) {
    value = parseInt(pctMatch[1]);
    type = 'percentage_discount';
    name = `NLP %${value} İndirim Kampanyası`;
  } else {
    // Check fixed discount (TL)
    const fixedMatch = normalized.match(/([0-9]+)\s*(tl|lira)/);
    if (fixedMatch) {
      value = parseInt(fixedMatch[1]);
      type = 'fixed_discount';
      name = `NLP ₺${value} İndirim Kampanyası`;
    }
  }

  // Extract categories
  if (normalized.includes('meyve') || normalized.includes('sebze') || normalized.includes('manav')) {
    categories.push('manav');
    name += ' - Manav Özel';
  }
  if (normalized.includes('icecek') || normalized.includes('içecek') || normalized.includes('beverage')) {
    categories.push('icecek');
    name += ' - İçecek Özel';
  }
  if (normalized.includes('temizlik') || normalized.includes('deterjan')) {
    categories.push('temizlik');
    name += ' - Temizlik Özel';
  }
  if (normalized.includes('gida') || normalized.includes('gıda') || normalized.includes('temel')) {
    categories.push('temel-gida');
  }

  // Extract tier scoping
  if (normalized.includes('gold')) {
    metadata.allowed_tiers = ['gold'];
    name += ' (Gold VIP)';
  } else if (normalized.includes('platinum')) {
    metadata.allowed_tiers = ['platinum'];
    name += ' (Platinum VIP)';
  } else if (normalized.includes('silver')) {
    metadata.allowed_tiers = ['silver'];
    name += ' (Silver VIP)';
  } else if (normalized.includes('diamond')) {
    metadata.allowed_tiers = ['diamond'];
    name += ' (Diamond VIP)';
  }

  // Time filters
  if (normalized.includes('hafta sonu') || normalized.includes('weekend')) {
    metadata.weekend_only = true;
  }
  if (normalized.includes('happy hour')) {
    metadata.start_hour = 14;
    metadata.end_hour = 16;
  }
  if (normalized.includes('dogum gunu') || normalized.includes('birthday')) {
    metadata.birthday_discount = true;
  }

  return {
    name,
    type,
    value,
    min_order_amount: min_order_amount || undefined,
    applicable_categories: categories.length > 0 ? categories : undefined,
    metadata
  };
}
