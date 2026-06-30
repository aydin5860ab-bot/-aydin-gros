import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Global variables load environment
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { items, tenant_id: tenantId, branch_id: branchId } = body;

    if (!tenantId || !branchId || !Array.isArray(items)) {
      return NextResponse.json({ error: 'Eksik parametreler (tenant_id, branch_id ve items gereklidir)' }, { status: 400 });
    }

    if (items.length === 0) {
      return NextResponse.json({ success: true, inserted: 0, updated: 0, errors: [] });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    // 1. Fetch existing barcodes in this batch
    const barcodesList = items.map(item => String(item.barcode).trim()).filter(Boolean);
    const { data: existingBarcodes, error: barcodeErr } = await supabase
      .from('product_barcodes')
      .select('barcode, product_id, product_legacy_id')
      .eq('tenant_id', tenantId)
      .in('barcode', barcodesList);

    if (barcodeErr) {
      throw new Error('Mevcut barkodlar sorgulanamadı: ' + barcodeErr.message);
    }

    // Build a map of barcode -> { product_id, legacy_id }
    const barcodeMap = new Map<string, { product_id: string; legacy_id: number }>();
    existingBarcodes?.forEach(b => {
      if (b.product_id && b.product_legacy_id !== null) {
        barcodeMap.set(b.barcode, { product_id: b.product_id, legacy_id: b.product_legacy_id });
      }
    });

    // 2. Fetch maximum legacy_id to increment from
    const { data: maxLegacy } = await supabase
      .from('products')
      .select('legacy_id')
      .eq('tenant_id', tenantId)
      .order('legacy_id', { ascending: false })
      .limit(1)
      .maybeSingle();

    let nextLegacyId = (maxLegacy?.legacy_id || 10000) + 1;

    // 3. Fetch categories
    const { data: categories } = await supabase
      .from('categories')
      .select('id, name')
      .eq('tenant_id', tenantId);

    const categoryMap = new Map<string, string>();
    categories?.forEach(c => {
      // Index by normalized name/slug
      const slug = c.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
      categoryMap.set(slug, c.id);
      categoryMap.set(c.name.toLowerCase(), c.id);
    });

    // Resolve or create a default category
    let defaultCatId = categoryMap.get('temel-gida');
    if (!defaultCatId) {
      if (categories && categories.length > 0) {
        defaultCatId = categories[0].id;
      } else {
        const { data: newCat } = await supabase
          .from('categories')
          .insert({
            tenant_id: tenantId,
            name: 'Temel Gıda',
            sort_order: 1
          })
          .select('id')
          .single();
        defaultCatId = newCat?.id;
      }
    }

    const productsToInsert: any[] = [];
    const barcodesToInsert: any[] = [];
    const stocksToInsert: any[] = [];

    const productsToUpdate: any[] = [];
    const stocksToUpdate: any[] = [];

    const errors: any[] = [];

    // Process items in this batch
    for (const item of items) {
      const barcode = String(item.barcode).trim();
      const name = String(item.name || '').trim();
      const price = parseFloat(item.price);

      if (!barcode || !name || isNaN(price)) {
        errors.push({ barcode, error: 'Geçersiz veri formatı (barkod, isim veya fiyat eksik/hatalı)' });
        continue;
      }

      // Resolve category ID
      const catInput = String(item.cat || '').trim().toLowerCase();
      const catSlug = catInput.replace(/[^a-z0-9]/g, '-');
      const categoryId = categoryMap.get(catInput) || categoryMap.get(catSlug) || defaultCatId;

      const existing = barcodeMap.get(barcode);

      if (existing) {
        // Update product & stock
        productsToUpdate.push({
          id: existing.product_id,
          name,
          price,
          category_id: categoryId,
          updated_at: new Date().toISOString()
        });

        if (item.stock !== undefined) {
          stocksToUpdate.push({
            tenant_id: tenantId,
            branch_id: branchId,
            product_legacy_id: existing.legacy_id,
            product_id: existing.product_id,
            qty: parseFloat(item.stock) || 0,
            updated_at: new Date().toISOString()
          });
        }
      } else {
        // Insert product, barcode & stock
        const productId = crypto.randomUUID();
        const legacyId = nextLegacyId++;

        productsToInsert.push({
          id: productId,
          tenant_id: tenantId,
          name,
          price,
          category_id: categoryId,
          unit: String(item.unit || 'adet').trim(),
          legacy_id: legacyId,
          is_active: true,
          created_at: new Date().toISOString()
        });

        barcodesToInsert.push({
          tenant_id: tenantId,
          product_id: productId,
          product_legacy_id: legacyId,
          barcode,
          barcode_type: 'EAN13',
          is_primary: true
        });

        stocksToInsert.push({
          tenant_id: tenantId,
          branch_id: branchId,
          product_legacy_id: legacyId,
          product_id: productId,
          qty: parseFloat(item.stock) || 0,
          min_qty: 5,
          updated_at: new Date().toISOString()
        });
      }
    }

    // Execute inserts
    if (productsToInsert.length > 0) {
      const { error: pInsErr } = await supabase.from('products').insert(productsToInsert);
      if (pInsErr) {
        errors.push({ batch: 'insert-products', error: pInsErr.message });
      } else {
        const { error: bInsErr } = await supabase.from('product_barcodes').insert(barcodesToInsert);
        if (bInsErr) errors.push({ batch: 'insert-barcodes', error: bInsErr.message });

        const { error: sInsErr } = await supabase.from('product_stock').insert(stocksToInsert);
        if (sInsErr) errors.push({ batch: 'insert-stocks', error: sInsErr.message });
      }
    }

    // Execute updates
    if (productsToUpdate.length > 0) {
      const { error: pUpdErr } = await supabase.from('products').upsert(productsToUpdate);
      if (pUpdErr) {
        errors.push({ batch: 'update-products', error: pUpdErr.message });
      } else if (stocksToUpdate.length > 0) {
        const { error: sUpdErr } = await supabase
          .from('product_stock')
          .upsert(stocksToUpdate, { onConflict: 'tenant_id,branch_id,product_legacy_id' });
        if (sUpdErr) errors.push({ batch: 'update-stocks', error: sUpdErr.message });
      }
    }

    return NextResponse.json({
      success: true,
      inserted: productsToInsert.length,
      updated: productsToUpdate.length,
      errors
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
