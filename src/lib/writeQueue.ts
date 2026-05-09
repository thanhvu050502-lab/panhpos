import { get, set } from 'idb-keyval';
import { getSupabase } from './supabaseClient';

/**
 * Offline write queue.
 *
 * When a Supabase mutation fails because the network is gone, the call is
 * stored in IndexedDB instead of dropping the user's work on the floor. On
 * the next `online` event we replay the queue in FIFO order. Items that
 * fail again stay queued; permanent server errors (4xx) drop them after
 * a few attempts to avoid permanent poison.
 *
 * NOT used for reads (those just retry on next user action). Also supports
 * RPC calls (e.g. create_order_full) — relies on server-side idempotency to
 * make replays safe.
 */

const KEY = 'np_write_queue_v1';
const MAX_ATTEMPTS = 5;

export interface QueueItem {
  id: string;
  /** For insert/update/delete: the table name. For rpc: ignored. */
  table: string;
  op: 'insert' | 'update' | 'delete' | 'rpc';
  /** For rpc: { fn: string, args: any }. For others: row payload. */
  data: any;
  ts: number;
  attempts: number;
}

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const readQueue = async (): Promise<QueueItem[]> => {
  try {
    return ((await get(KEY)) as QueueItem[] | undefined) || [];
  } catch {
    return [];
  }
};

const writeQueue = async (q: QueueItem[]) => {
  try { await set(KEY, q); } catch { /* IndexedDB blocked — silently drop */ }
};

/** Network error sniff: connection-class failures look like fetch TypeError or specific Supabase codes. */
const isTransient = (err: any): boolean => {
  if (!err) return false;
  const msg = String(err.message || err).toLowerCase();
  if (err.name === 'TypeError') return true;        // fetch failure
  if (msg.includes('failed to fetch')) return true; // chrome wording
  if (msg.includes('networkerror')) return true;    // firefox
  if (msg.includes('load failed')) return true;     // safari
  // Supabase realtime/REST error codes that are clearly server/transport
  const code = String(err.code || err.status || '');
  if (code === '503' || code === '504' || code === '408') return true;
  return false;
};

export async function enqueue(item: Omit<QueueItem, 'id' | 'ts' | 'attempts'>) {
  const q = await readQueue();
  q.push({ ...item, id: newId(), ts: Date.now(), attempts: 0 });
  await writeQueue(q);
}

export async function flush(): Promise<{ ok: number; failed: number; left: number }> {
  const sb = getSupabase();
  if (!sb) {
    const q = await readQueue();
    return { ok: 0, failed: 0, left: q.length };
  }
  const q = await readQueue();
  const remaining: QueueItem[] = [];
  let ok = 0;
  let failed = 0;
  for (const it of q) {
    try {
      if (it.op === 'insert') {
        const { error } = await sb.from(it.table).insert(it.data);
        if (error) throw error;
      } else if (it.op === 'update') {
        const { id, ...patch } = it.data;
        const { error } = await sb.from(it.table).update(patch).eq('id', id);
        if (error) throw error;
      } else if (it.op === 'delete') {
        const { error } = await sb.from(it.table).delete().eq('id', it.data.id);
        if (error) throw error;
      } else if (it.op === 'rpc') {
        const fn = it.data?.fn;
        const args = it.data?.args ?? {};
        if (!fn) throw new Error('queued rpc has no fn');
        // Idempotency on the server side (e.g. create_order_full's existing-id
        // short-circuit) makes replaying these safe.
        const { error } = await sb.rpc(fn, args);
        if (error) throw error;
      }
      ok += 1;
    } catch (err) {
      const next = { ...it, attempts: it.attempts + 1 };
      if (isTransient(err) && next.attempts < MAX_ATTEMPTS) {
        remaining.push(next); // retry next flush
      } else {
        failed += 1; // permanent failure — drop and log
        if (import.meta.env.DEV) console.error('writeQueue: dropping item after error', { item: it, err });
      }
    }
  }
  await writeQueue(remaining);
  return { ok, failed, left: remaining.length };
}

export async function queueLength(): Promise<number> {
  const q = await readQueue();
  return q.length;
}

let listenerInstalled = false;

/** Wire up auto-flush on `online` events. Idempotent — safe to call many times. */
export function installAutoFlush(onResult?: (r: { ok: number; failed: number; left: number }) => void) {
  if (listenerInstalled || typeof window === 'undefined') return;
  listenerInstalled = true;
  const handler = async () => {
    try {
      const r = await flush();
      onResult?.(r);
    } catch { /* swallow */ }
  };
  window.addEventListener('online', handler);
  // Also try once on install in case we boot up while online but with queued items.
  if (navigator.onLine) handler();
}
