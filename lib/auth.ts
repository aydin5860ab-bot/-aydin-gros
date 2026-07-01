import { NextRequest } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase/server';
import crypto from 'crypto';

function verifyLocalSignature(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const [headerB64, payloadB64, signatureB64] = parts;
    const secret = process.env.JWT_SECRET || 'aydingros-offline-secret-key-12345';
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(`${headerB64}.${payloadB64}`);
    const expectedSig = hmac.digest('base64url');
    return expectedSig === signatureB64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  } catch {
    return false;
  }
}

// IP-based Rate Limiting Map
interface RateLimitRecord {
  timestamps: number[];
}
const rateLimitMap = new Map<string, RateLimitRecord>();

export function checkRateLimit(ip: string, limit = 5, windowMs = 60000): { allowed: boolean; remaining: number; resetTime: number } {
  const now = Date.now();
  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, { timestamps: [] });
  }

  const record = rateLimitMap.get(ip)!;
  record.timestamps = record.timestamps.filter(t => now - t < windowMs);
  const resetTime = record.timestamps.length > 0 ? record.timestamps[0] + windowMs : now + windowMs;

  if (record.timestamps.length >= limit) {
    return { allowed: false, remaining: 0, resetTime };
  }

  record.timestamps.push(now);
  return { allowed: true, remaining: limit - record.timestamps.length, resetTime };
}

export interface AuthSession {
  isAuthenticated: boolean;
  role: string;
  tenantId: string | null;
  user?: any;
  email?: string;
}

export async function checkAuth(req: NextRequest): Promise<AuthSession> {
  let token = '';
  const authHeader = req.headers.get('authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else {
    const sessionCookie = req.cookies.get('sb-access-token');
    if (sessionCookie) {
      token = sessionCookie.value;
    }
  }

  if (!token) {
    return { isAuthenticated: false, role: 'anon', tenantId: null };
  }

  // Fast path: decode JWT locally when FORCE_JSON_DB is active or in development to bypass remote network checks
  if (process.env.FORCE_JSON_DB === 'true' || process.env.NODE_ENV === 'development') {
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const allowDummy = process.env.ALLOW_DUMMY_SIGNATURE === 'true';
        const isValidSig = (allowDummy && parts[2] === 'dummysignature') || verifyLocalSignature(token);
        if (isValidSig) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
          const meta = payload.user_metadata || {};
          const appMeta = payload.app_metadata || {};
          const role = meta.role || appMeta.role || 'viewer';
          const tenantId = meta.tenant_id || appMeta.tenant_id || null;
          
          return {
            isAuthenticated: true,
            role,
            tenantId,
            email: payload.email || '',
            user: {
              id: payload.sub,
              email: payload.email,
              user_metadata: meta,
              app_metadata: appMeta
            }
          };
        }
      }
    } catch (e) {
      console.error("[checkAuth] Local JWT decode error:", e);
    }
  }

  const anonClient = createServerClient();
  if (!anonClient) {
    return { isAuthenticated: false, role: 'anon', tenantId: null };
  }

  try {
    const { data: { user }, error } = await anonClient.auth.getUser(token);
    if (error || !user) {
      console.warn("[checkAuth] Authentication failed: local signature check failed and token rejected by Supabase API.");
      return { isAuthenticated: false, role: 'anon', tenantId: null };
    }

    const meta = user.user_metadata || {};
    const appMeta = user.app_metadata || {};
    const role = meta.role || appMeta.role || 'viewer';
    const tenantId = meta.tenant_id || appMeta.tenant_id || null;

    return { isAuthenticated: true, role, tenantId, email: user.email || '', user };
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
    admin: ['admin', 'owner', 'general_manager', 'branch_manager', 'manager', 'warehouse_staff', 'purchasing_staff', 'accountant', 'auditor', 'cashier', 'warehouse_person'],
    manager: ['manager', 'branch_manager', 'general_manager', 'warehouse_person'],
    warehouse_person: ['warehouse_person']
  };

  const resolvedRolesForUser = roleAliases[role] || [role];
  return allowedRoles.some(r => resolvedRolesForUser.includes(r));
}

export async function isLicenseActive(tenantId: string | null): Promise<{ active: boolean; reason?: string; plan?: string }> {
  if (!tenantId) return { active: true, plan: 'enterprise' }; // Admin / global backend bypass

  const db = createAdminClient();
  if (!db) return { active: true, plan: 'enterprise' }; // Safe fallback for local/offline dev

  // Select settings and new enterprise license columns
  let tenant: any = null;
  let queryError: any = null;
  try {
    const { data, error } = await db
      .from('tenants')
      .select('status, settings, subscription_plan, subscription_status, license_key, license_ends_at')
      .eq('id', tenantId)
      .maybeSingle();
    tenant = data;
    queryError = error;
  } catch(e: any) {
    queryError = e;
  }

  if (queryError || !tenant) {
    if (process.env.NODE_ENV === 'production' && process.env.FORCE_JSON_DB !== 'true') {
      return { active: false, reason: 'Market lisansı doğrulanamadı (Veritabanı bağlantısı yok)' };
    }
    // Local file fallback using fs
    try {
      const fs = require('fs');
      const dbFile = `c:/AYDIN GROS/db_tenants.json`;
      if (fs.existsSync(dbFile)) {
        const tenants = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
        const found = tenants.find((t: any) => t.id === tenantId);
        if (found) {
          const tenantStatus = found.subscription_status || found.status;
          if (tenantStatus === 'suspended' || tenantStatus === 'inactive') {
            return { active: false, reason: 'Market hesabı pasife alınmış', plan: found.subscription_plan };
          }
          return { active: true, plan: found.subscription_plan || 'enterprise' };
        }
      }
    } catch(e) {}
    // If not found in file or db fails, default to active: true, plan: 'enterprise' for local dev/testing
    return { active: true, plan: 'enterprise' };
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

