import { createClient } from '@supabase/supabase-js';

/**
 * Supabase client factory for server-side operations (Next.js route handlers).
 * Standard client utilizing the public anon key (respects RLS).
 * Optionally acts under user's authentication context if a JWT token is supplied.
 */
export function createServerClient(token: string | null = null) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  if (!url || !key) return null;

  const globalHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: globalHeaders,
    },
  });
}

/**
 * Administrative client utilizing the service_role key.
 * Bypasses RLS entirely. Must only be used in authorized backend/server-side logic.
 */
export function createAdminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return null;

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
