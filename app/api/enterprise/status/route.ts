import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { checkAuth, isAuthorized } from '@/lib/auth';
import os from 'os';

export async function GET(req: NextRequest) {
  const auth = await checkAuth(req);
  if (!auth.isAuthenticated || !isAuthorized(auth.role, ['admin'])) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 });
  }

  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: 'DB bağlantısı yok' }, { status: 500 });

  try {
    // 1. Gather SaaS Metrics from database
    const { count: tenantsCount } = await db
      .from('tenants')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');

    const { count: sessionsCount } = await db
      .from('register_sessions')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'open');

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { data: salesToday } = await db
      .from('orders')
      .select('total')
      .gte('created_at', todayStart.toISOString())
      .eq('status', 'completed')
      .eq('is_cancelled', false);

    const totalSalesToday = (salesToday || []).reduce((sum, o) => sum + Number(o.total || 0), 0);

    // 2. Gather Host OS Metrics
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const ramPercent = Math.round(((totalMem - freeMem) / totalMem) * 100);
    const cpuLoad = os.loadavg();
    const cpus = os.cpus();
    const cpuModel = cpus.length > 0 ? cpus[0].model : 'N/A';

    return NextResponse.json({
      ok: true,
      metrics: {
        active_tenants: tenantsCount || 0,
        active_sessions: sessionsCount || 0,
        sales_today: parseFloat(totalSalesToday.toFixed(2))
      },
      host: {
        cpu_model: cpuModel,
        cpu_cores: cpus.length,
        cpu_load_1m: parseFloat(cpuLoad[0].toFixed(2)),
        ram_total_gb: parseFloat((totalMem / (1024 ** 3)).toFixed(2)),
        ram_used_gb: parseFloat(((totalMem - freeMem) / (1024 ** 3)).toFixed(2)),
        ram_used_percent: ramPercent,
        uptime_hours: parseFloat((os.uptime() / 3600).toFixed(2))
      }
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
