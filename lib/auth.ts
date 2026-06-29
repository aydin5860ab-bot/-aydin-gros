import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

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
  return allowedRoles.includes(role);
}
