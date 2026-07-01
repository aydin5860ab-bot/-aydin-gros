import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { checkAuth, isAuthorized } from '@/lib/auth';
import { readCollection } from '@/lib/db';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';

export async function GET(req: NextRequest) {
  const auth = await checkAuth(req);
  if (!auth.isAuthenticated || !isAuthorized(auth.role, ['owner', 'general_manager', 'branch_manager', 'admin'])) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 });
  }

  const tenantId = auth.tenantId || TENANT_ID;
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: 'DB bağlantısı yok' }, { status: 500 });

  // Load relevant collections
  const alerts = await readCollection<any>('ai_alerts', tenantId, db);
  const drafts = await readCollection<any>('ai_action_drafts', tenantId, db);
  const risks = await readCollection<any>('ai_risks', tenantId, db).catch(() => []);
  const aiTasks = await readCollection<any>('ai_tasks', tenantId, db).catch(() => []);

  // Filter unread alerts
  const unreadAlerts = alerts.filter(a => a.status === 'unread' || a.status === 'open');

  // Filter pending approvals
  const pendingApprovals = drafts.filter(d => d.status === 'pending');

  // Filter active priorities (tasks not completed, sorted by priority)
  const activePriorities = aiTasks
    .filter(t => t.status === 'pending' || t.status === 'in_progress')
    .sort((a, b) => {
      const weight: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
      return (weight[b.priority] || 0) - (weight[a.priority] || 0);
    });

  // Active risks
  const activeRisks = risks
    .filter(r => r.status === 'open')
    .sort((a, b) => (b.probability || 0) - (a.probability || 0));

  // Dynamic AI Confidence Score calculation
  // Base is 95%, reduce based on alert count, risk count, or missing values
  let confidence = 95;
  if (unreadAlerts.length > 5) confidence -= 5;
  if (activeRisks.length > 3) confidence -= 5;
  if (activePriorities.length > 8) confidence -= 3;
  confidence = Math.max(75, confidence);

  return NextResponse.json({
    confidence_score: confidence,
    alerts: unreadAlerts.slice(0, 10),
    priorities: activePriorities.slice(0, 10),
    approvals: pendingApprovals.slice(0, 10),
    risks: activeRisks.slice(0, 10),
    calculated_at: new Date().toISOString()
  });
}
