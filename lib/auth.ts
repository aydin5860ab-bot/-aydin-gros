import { NextRequest } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase/server';

export interface AuthSession {
  isAuthenticated: boolean;
  role: string;
  tenantId: string | null;
  user?: any;
}

export async function checkAuth(req: NextRequest): Promise<AuthSession> {
  const authHeader = req.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return { isAuthenticated: false, role: 'anon', tenantId: null };
  }
  const token = authHeader.substring(7).trim();
  if (!token) {
    return { isAuthenticated: false, role: 'anon', tenantId: null };
  }

  const anonClient = createServerClient();
  if (!anonClient) {
    return { isAuthenticated: false, role: 'anon', tenantId: null };
  }

  try {
    const { data: { user }, error } = await anonClient.auth.getUser(token);
    if (error || !user) {
      return { isAuthenticated: false, role: 'anon', tenantId: null };
    }

    const meta = user.user_metadata || {};
    const appMeta = user.app_metadata || {};
    const role = meta.role || appMeta.role || 'viewer';
    const tenantId = meta.tenant_id || appMeta.tenant_id || null;

    return { isAuthenticated: true, role, tenantId, user };
  } catch (e) {
    return { isAuthenticated: false, role: 'anon', tenantId: null };
  }
}

export function isAuthorized(role: string, allowedRoles: string[]): boolean {
  // Normalize roles to be backward-compatible and support new enterprise roles
  const roleAliases: Record<string, string[]> = {
    owner: ['admin', 'owner'],
    general_manager: ['admin', 'manager', 'general_manager'],
    branch_manager: ['manager', 'branch_manager'],
    warehouse_staff: ['warehouse_person', 'warehouse_staff'],
    purchasing_staff: ['purchasing_staff'],
    accountant: ['accountant'],
    auditor: ['auditor'],
    cashier: ['cashier'],
    admin: ['admin'],
    manager: ['manager'],
    warehouse_person: ['warehouse_person']
  };

  const resolvedRolesForUser = roleAliases[role] || [role];
  return allowedRoles.some(r => resolvedRolesForUser.includes(r));
}

export async function isLicenseActive(tenantId: string | null): Promise<{ active: boolean; reason?: string; plan?: string }> {
  if (!tenantId) return { active: true, plan: 'enterprise' }; // Admin / global backend bypass

  const db = createAdminClient();
  if (!db) return { active: false, reason: 'Veritabanı bağlantı hatası' };

  // Select settings and new enterprise license columns
  const { data: tenant, error } = await db
    .from('tenants')
    .select('status, settings, subscription_plan, subscription_status, license_key, license_ends_at')
    .eq('id', tenantId)
    .maybeSingle();

  if (error || !tenant) {
    return { active: false, reason: 'Market bulunamadı veya veritabanı hatası' };
  }

  const tenantStatus = tenant.subscription_status || tenant.status;
  if (tenantStatus === 'suspended' || tenantStatus === 'inactive') {
    return { active: false, reason: 'Market hesabı pasife alınmış' };
  }

  const settings = tenant.settings || {};
  const plan = tenant.subscription_plan || settings.package || 'starter';

  // Determine trial dates and license expiration
  const trialEndsAt = settings.trial_ends_at ? new Date(settings.trial_ends_at) : null;
  
  let licenseEndsAt = null;
  if (tenant.license_ends_at) {
    licenseEndsAt = new Date(tenant.license_ends_at);
  } else if (settings.license_ends_at) {
    licenseEndsAt = new Date(settings.license_ends_at);
  }

  const now = new Date();

  // If trial has ended and there is no active license, block
  if (trialEndsAt && now > trialEndsAt) {
    if (!licenseEndsAt || now > licenseEndsAt) {
      return { active: false, reason: 'Market deneme süresi sona ermiş. Lütfen lisans tanımlayın.', plan };
    }
  }

  // If license ends
  if (licenseEndsAt && now > licenseEndsAt) {
    return { active: false, reason: 'Lisans süresi dolmuş. Lütfen lisansınızı yenileyin.', plan };
  }

  return { active: true, plan };
}

