import { readCollection } from '@/lib/db';

export interface PriceResolution {
  price: number;
  cost_price: number;
  price_book_id: string;
  source_tier: 'customer_group' | 'branch' | 'region' | 'base' | 'msrp';
  explanation: string;
}

/**
 * Resolves the active sale price for a product based on branch, region,
 * customer tier, date validity, and pricing book priorities.
 */
export async function resolveProductPrice(
  db: any,
  tenantId: string,
  params: {
    product_id: string;
    branch_id: string;
    customer_tier?: string;
    timestamp?: string;
  }
): Promise<PriceResolution> {
  const now = params.timestamp ? new Date(params.timestamp) : new Date();

  // Load target catalogs and directories
  const priceBooks = await readCollection<any>('price_books', tenantId, db) || [];
  const entries = await readCollection<any>('price_book_entries', tenantId, db) || [];
  const branches = await readCollection<any>('branches', tenantId, db) || [];
  const products = await readCollection<any>('products', tenantId, db) || [];

  const product = products.find(p => p.id === params.product_id || p.legacy_id == params.product_id);
  if (!product) {
    throw new Error(`Ürün bulunamadı: ${params.product_id}`);
  }

  const branch = branches.find(b => b.id === params.branch_id);
  const branchCity = branch ? (branch.city || branch.region || '') : '';

  // 1. Filter active and approved price books
  const activeBooks = priceBooks.filter(pb => {
    if (pb.status !== 'approved') return false;
    if (pb.starts_at && new Date(pb.starts_at) > now) return false;
    if (pb.ends_at && new Date(pb.ends_at) < now) return false;
    return true;
  });

  // 2. Extract matching entries for this product
  const matchedEntries = entries.filter(e => e.product_id === product.id);

  const candidates: {
    entry: any;
    book: any;
    priority: number;
    tier: 'customer_group' | 'branch' | 'region' | 'base';
  }[] = [];

  matchedEntries.forEach(entry => {
    const book = activeBooks.find(b => b.id === entry.price_book_id);
    if (!book) return; // skip if book is not active/approved

    // Evaluate matching scope and assign priority weighting
    if (book.type === 'customer_group' && params.customer_tier && book.scope_value === params.customer_tier) {
      candidates.push({ entry, book, priority: 100 + (book.priority || 0), tier: 'customer_group' });
    } else if (book.type === 'branch' && book.scope_value === params.branch_id) {
      candidates.push({ entry, book, priority: 80 + (book.priority || 0), tier: 'branch' });
    } else if (book.type === 'region' && branchCity && book.scope_value.toLowerCase() === branchCity.toLowerCase()) {
      candidates.push({ entry, book, priority: 60 + (book.priority || 0), tier: 'region' });
    } else if (book.type === 'base') {
      candidates.push({ entry, book, priority: 40 + (book.priority || 0), tier: 'base' });
    }
  });

  // 3. Sort candidates by priority (descending). If priorities are equal, select the lowest price.
  candidates.sort((a, b) => {
    if (b.priority !== a.priority) {
      return b.priority - a.priority;
    }
    return a.entry.price - b.entry.price; // Lowest price wins conflict
  });

  if (candidates.length > 0) {
    const best = candidates[0];
    return {
      price: best.entry.price,
      cost_price: best.entry.cost_price || (best.entry.price * 0.7),
      price_book_id: best.book.id,
      source_tier: best.tier,
      explanation: `Fiyat '${best.book.name}' (${best.tier}) fiyat kataloğundan çözümlendi.`
    };
  }

  // 4. Default Fallback: Central Product MSRP
  const fallbackPrice = parseFloat(product.price || 0);
  return {
    price: fallbackPrice,
    cost_price: parseFloat(product.costPrice || product.cost_price || (fallbackPrice * 0.7)),
    price_book_id: 'central-msrp',
    source_tier: 'msrp',
    explanation: 'Şubeye veya gruba özel fiyat bulunamadı. Genel Merkez liste fiyatı (MSRP) uygulandı.'
  };
}
