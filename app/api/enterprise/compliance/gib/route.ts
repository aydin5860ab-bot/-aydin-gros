import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '@/lib/auth';

// Static seed list representing GİB Taxpayer registry for validation
const GIB_TAXPAYERS_REGISTRY: Record<string, { title: string; office: string }> = {
  '1234567890': { title: 'Aydın Gros Gıda Ticaret A.Ş.', office: 'Erenler Vergi Dairesi' },
  '9876543210': { title: 'Mavi Kozmetik Perakende Ltd. Şti.', office: 'Karaköy Vergi Dairesi' },
  '1111111111': { title: 'Test Perakende A.Ş.', office: 'Sakarya Vergi Dairesi' },
  '3216549870': { title: 'Erenler Süpermarket Hizmetleri A.Ş.', office: 'Erenler Vergi Dairesi' }
};

export async function GET(req: NextRequest) {
  const auth = await checkAuth(req);
  if (!auth.isAuthenticated) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const vknTckn = searchParams.get('vkn_tckn');

  if (!vknTckn) {
    return NextResponse.json({ error: 'vkn_tckn parametresi gereklidir' }, { status: 400 });
  }

  const cleanVkn = vknTckn.trim();
  if (cleanVkn.length !== 10 && cleanVkn.length !== 11) {
    return NextResponse.json({ error: 'Geçersiz TCKN/VKN uzunluğu. 10 veya 11 hane olmalıdır.' }, { status: 400 });
  }

  // Lookup in GİB taxpayer records
  const taxpayerRecord = GIB_TAXPAYERS_REGISTRY[cleanVkn];

  if (taxpayerRecord) {
    return NextResponse.json({
      is_taxpayer: true,
      taxpayer_title: taxpayerRecord.title,
      tax_office: taxpayerRecord.office,
      invoice_type: 'EFATURA'
    });
  }

  // Default to EARCHIVE if not found on e-Invoice registry
  return NextResponse.json({
    is_taxpayer: false,
    taxpayer_title: 'Bireysel Müşteri',
    tax_office: '',
    invoice_type: 'EARCHIVE'
  });
}
