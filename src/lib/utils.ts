import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { AV_COLORS } from "./constants";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const VND = (n?: number | null) => (n || 0).toLocaleString('vi-VN') + 'đ';
export const formatCurrency = VND;

/**
 * Parse a money string (VND, no decimals). Strips non-digits.
 * Returns null on NaN, negative, or > 100,000,000đ — caller decides whether
 * to show a toast or silently clamp.
 */
export const parseMoney = (s: unknown): number | null => {
  const cleaned = String(s ?? '').replace(/\D/g, '');
  if (!cleaned) return 0;
  const n = parseInt(cleaned, 10);
  if (Number.isNaN(n) || n < 0 || n > 100_000_000) return null;
  return n;
};

export function todayStr() { 
  return new Date().toISOString().split('T')[0]; 
}

/** Salon timezone — keeps date formatting stable regardless of device clock. */
const TZ = 'Asia/Ho_Chi_Minh';

export function fmtDate(s?: string | null) {
  if (!s) return '';
  // For YYYY-MM-DD strings, parse explicitly as midnight in salon TZ to avoid
  // off-by-one when the device is in a different timezone.
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(s);
  const d = isDateOnly ? new Date(s + 'T00:00:00+07:00') : new Date(s);
  return d.toLocaleDateString('vi-VN', {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

export function fmtDT(s?: string | null) {
  if (!s) return '';
  return new Date(s).toLocaleString('vi-VN', {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}
export const formatDateTime = fmtDT;

export function formatTime(s?: string | null) {
  if (!s) return '';
  return new Date(s).toLocaleTimeString('vi-VN', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Returns a RFC 4122 v4 UUID. All entity primary keys in our Supabase schema
// are `uuid` columns, so client-generated IDs must match that format or the
// `create_order_full` RPC (and any direct insert) rejects them with 22P02.
// Falls back to a Math.random-based v4 only if crypto.randomUUID is missing
// (very old browsers / insecure contexts); the format is still valid UUID.
export function uid() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  // RFC 4122 v4 fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function avColor(name?: string | null) { 
  let h = 0; 
  for (const c of (name || '?')) {
    h = (h * 31 + c.charCodeAt(0)) % 5; 
  }
  return AV_COLORS[h]; 
}

export function initials(name?: string | null) { 
  if (!name) return '?'; 
  const p = name.trim().split(' '); 
  return (p.length > 1 ? p[p.length - 1][0] + p[0][0] : name.slice(0, 2)).toUpperCase(); 
}

export function getGreeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Chào buổi sáng! ☀️' : h < 18 ? 'Chào buổi chiều! 👋' : 'Chào buổi tối! 🌙';
}

/** Local fallback. Use `nextOrderCode` instead — it prefers the server sequence. */
export function generateCode(prefix: string, length: number, existingCodes: string[]) {
  const nums = existingCodes
    .map(c => parseInt((c || '').replace(prefix, '')))
    .filter(n => !isNaN(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return prefix + String(max + 1).padStart(length, '0');
}

/**
 * Get the next order code, preferring the server-side sequence (migration
 * 004). Falls back to the local generator if the RPC is missing or the
 * Supabase client isn't ready (e.g. demo mode, offline). The fallback is
 * only safe for single-device use; once two devices are live, run
 * migration 004 to eliminate races.
 */
export async function nextOrderCode(
  prefix: string,
  length: number,
  existingCodes: string[],
  sb: any | null
): Promise<string> {
  if (!sb) return generateCode(prefix, length, existingCodes);
  try {
    const { data, error } = await sb.rpc('next_order_code', { prefix, length });
    if (error) throw error;
    if (typeof data === 'string' && data.length > 0) return data;
    return generateCode(prefix, length, existingCodes);
  } catch (err: any) {
    const code = err?.code || '';
    const msg = err?.message || '';
    const missing = code === '42883' || code === 'PGRST202' || /does not exist/i.test(msg);
    if (!missing) console.warn('next_order_code RPC failed, using local fallback', err);
    return generateCode(prefix, length, existingCodes);
  }
}
