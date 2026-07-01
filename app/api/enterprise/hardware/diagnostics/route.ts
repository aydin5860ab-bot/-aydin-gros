import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '@/lib/auth';
import { HardwareManager } from '@/lib/hardware/manager';

export async function GET(req: NextRequest) {
  const auth = await checkAuth(req);
  if (!auth.isAuthenticated) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 });
  }

  try {
    const manager = HardwareManager.getInstance();
    
    // Automatically discover and refresh connection pools
    await manager.autoDiscoverStoreDevices();
    
    // Run diagnostics health sweep across drivers
    const healthReport = await manager.runHealthCheckSweep();

    // Determine overall hardware status
    let overallStatus: 'OK' | 'ERROR' = 'OK';
    const values = Object.values(healthReport);
    if (values.some(v => v.status === 'ERROR' || v.status === 'OFFLINE')) {
      overallStatus = 'ERROR';
    }

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      status: overallStatus,
      devices: healthReport
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
