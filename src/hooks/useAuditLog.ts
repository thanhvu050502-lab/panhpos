import { getSupabase } from '../lib/supabaseClient';

const STORAGE_KEY = 'np_audit_log';
const MAX_ENTRIES = 500;

export interface AuditEntry {
  id: string;
  ts: string;
  action: string;
  entity: string;
  entityId?: string;
  label: string;
  user?: string;
}

function loadLog(): AuditEntry[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveLog(entries: AuditEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
}

/**
 * Persist an audit entry to Supabase (fire-and-forget) AND keep a local
 * copy as offline-survivable cache. If Supabase write fails (offline,
 * table missing, RLS denies), the local copy is still preserved.
 *
 * The Supabase write requires migration 003 (audit_log table + RLS).
 * Until that migration runs, the .insert call will simply fail silently.
 */
export function logAudit(action: string, entity: string, label: string, entityId?: string, user?: string) {
  const entry: AuditEntry = {
    id: Math.random().toString(36).slice(2),
    ts: new Date().toISOString(),
    action,
    entity,
    entityId,
    label,
    user,
  };
  const existing = loadLog();
  saveLog([entry, ...existing]);

  // Mirror to server. Don't block UI on this — failures are non-fatal because
  // the local copy already succeeded.
  const sb = getSupabase();
  if (sb) {
    sb.from('audit_log').insert({
      action,
      entity,
      entity_id: entityId,
      label,
      user_name: user,
    }).then(
      () => {},
      () => {} // swallow — table may not exist yet (pre-migration)
    );
  }
}

export function getAuditLog(): AuditEntry[] {
  return loadLog();
}

export function clearAuditLog() {
  localStorage.removeItem(STORAGE_KEY);
}
