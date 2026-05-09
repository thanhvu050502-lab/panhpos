import { createClient } from '@supabase/supabase-js';
// We'll define Database types in src/integrations/supabase/types.ts later
// import type { Database } from '../integrations/supabase/types';

export let supabase: any = null;

// Build-time credentials. When set (Netlify env vars or local .env.local),
// these are preferred over user-typed values stored in localStorage.
// In production builds these are baked into the bundle.
const ENV_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || '';
const ENV_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || '';

/** True when both Supabase credentials come from build-time env vars. */
export const hasEnvCreds = (): boolean => !!(ENV_URL && ENV_KEY);

/**
 * Resolve current credentials. Env wins over localStorage so that a deployed
 * build with env vars set never falls back to stale browser state.
 */
export function getStoredCreds(): { url: string; key: string; source: 'env' | 'storage' | null } {
  if (ENV_URL && ENV_KEY) return { url: ENV_URL, key: ENV_KEY, source: 'env' };
  if (typeof window === 'undefined') return { url: '', key: '', source: null };
  const url = localStorage.getItem('np_sb_url') || '';
  const key = localStorage.getItem('np_sb_key') || '';
  if (url && key) return { url, key, source: 'storage' };
  return { url: '', key: '', source: null };
}

export function createSupabaseClient(url: string, key: string) {
  return createClient(url, key);
}

export function initSupabase(url: string, key: string) {
  supabase = createSupabaseClient(url, key);

  // Only persist user-typed creds; env-sourced creds don't need (and shouldn't pollute) localStorage.
  if (typeof window !== 'undefined' && !hasEnvCreds()) {
    localStorage.setItem('np_sb_url', url);
    localStorage.setItem('np_sb_key', key);
  }

  return supabase;
}

export function getSupabase() {
  if (!supabase) {
    const { url, key } = getStoredCreds();
    if (url && key) {
      supabase = createSupabaseClient(url, key);
    }
  }
  return supabase;
}

export async function testSupabaseConnection(url: string, key: string) {
  const client = createSupabaseClient(url, key);
  const { error } = await client.from('settings').select('id').limit(1);
  if (error) {
    throw new Error(error.message || 'Không thể kết nối Supabase');
  }
}

export function clearSupabaseConfig() {
  // If env creds are set, we can't (and shouldn't) "clear" them — they come from the build.
  // We only nuke localStorage so that on next reload the env values take over cleanly.
  if (typeof window !== 'undefined') {
    localStorage.removeItem('np_sb_url');
    localStorage.removeItem('np_sb_key');
  }
  if (!hasEnvCreds()) {
    supabase = null;
  } else {
    // Re-initialize from env so the singleton stays valid.
    supabase = createSupabaseClient(ENV_URL, ENV_KEY);
  }
}

/**
 * Read saved credentials (env first, then localStorage), try to create a client
 * and ping the settings table. Returns true if connectivity is confirmed and sets
 * the module-level `supabase` singleton. Returns false on any failure so the
 * caller can fall back to demo mode.
 */
export async function tryInitAndPing(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const { url, key } = getStoredCreds();
  if (!url || !key) return false;
  try {
    const client = createSupabaseClient(url, key);
    const { error } = await client.from('settings').select('id').limit(1);
    if (error) return false;
    supabase = client;          // commit the working client
    return true;
  } catch {
    return false;
  }
}
