import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/server';
import { readCollection } from '@/lib/db';
import { IngenicoBekoDriver, compileFiscalReceipt } from '@/lib/compliance/fiscal';

const TENANT = process.env.DEFAULT_TENANT_ID ?? '11111111-1111-1111-1111-111111111111';

export async function POST(req: NextRequest) {
  const auth = await checkAuth(req);
  if (!auth.isAuthenticated) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 });
  }

  const db = createAdminClient();
  const tenantId = auth.tenantId || TENANT;

  try {
    const body = await req.json();
    const { action, register_id, cart_items, payment } = body;

    if (!action) {
      return NextResponse.json({ error: 'action parametresi gereklidir' }, { status: 400 });
    }

    // Resolve device configuration (fallback to localhost mock sockets simulator if config not found)
    let deviceIp = '127.0.0.1';
    let devicePort = 9100;

    if (db) {
      const devices = await readCollection<any>('fiscal_devices', tenantId, db);
      const matchedDevice = devices.find(d => d.register_id === register_id);
      if (matchedDevice) {
        deviceIp = matchedDevice.ip_address || deviceIp;
        devicePort = parseInt(matchedDevice.port || '9100');
      }
    }

    // Instantiate driver
    const driver = new IngenicoBekoDriver({
      ipAddress: deviceIp,
      port: devicePort,
      timeout: 3000
    });

    if (action === 'status') {
      const status = await driver.status();
      return NextResponse.json(status);
    }

    if (action === 'print_z_report') {
      const res = await driver.printZReport();
      return NextResponse.json(res);
    }

    if (action === 'print_x_report') {
      const res = await driver.printXReport();
      return NextResponse.json(res);
    }

    if (action === 'print_receipt') {
      if (!Array.isArray(cart_items) || cart_items.length === 0) {
        return NextResponse.json({ error: 'Sepet boş veya geçersiz' }, { status: 400 });
      }
      if (!payment) {
        return NextResponse.json({ error: 'Ödeme detayları bulunamadı' }, { status: 400 });
      }

      // Compile cart to Turkish fiscal standards
      const compiled = compileFiscalReceipt(cart_items, payment);

      // Execute printing commands
      const result = await driver.printReceipt(compiled);

      // Log printing transaction to db
      if (db) {
        await db.from('efatura_records').insert({
          tenant_id: tenantId,
          order_id: compiled.id,
          fatura_tipi: payment.customerVkn ? 'EFATURA' : 'EARCHIVE',
          status: result.success ? 'sent' : 'draft',
          fatura_no: result.fiscal_id || null,
          ettn: `ettn-${Date.now()}`,
          sent_at: result.success ? new Date().toISOString() : null,
          payload: compiled,
          response_data: result
        });
      }

      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Bilinmeyen action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
