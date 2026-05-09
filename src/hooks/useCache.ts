import { useState, useEffect, useCallback } from 'react';
import { getSupabase } from '../lib/supabaseClient';
import { uid } from '../lib/utils';
import { enqueue as queueWrite } from '../lib/writeQueue';

const isTransientWriteError = (err: any): boolean => {
  if (!err) return false;
  if (err.name === 'TypeError') return true;
  const msg = String(err.message || err).toLowerCase();
  return ['failed to fetch', 'networkerror', 'load failed'].some(s => msg.includes(s));
};

export interface CacheState {
  orders: any[];
  customers: any[];
  appointments: any[];
  catalog: any[];
  payMethods: any[];
  promotions: any[];
  groups: any[];
  settings: any | null;
}

const initialCache: CacheState = {
  orders: [],
  customers: [],
  appointments: [],
  catalog: [],
  payMethods: [],
  promotions: [],
  groups: [],
  settings: null
};

let sharedCache: CacheState = initialCache;
let cacheListeners: Array<(next: CacheState) => void> = [];

const emitCache = (next: CacheState) => {
  sharedCache = next;
  cacheListeners.forEach((listener) => listener(sharedCache));
};

const updateSharedCache = (updater: (prev: CacheState) => CacheState) => {
  emitCache(updater(sharedCache));
};

/** Map SQL table names → shared cache keys when they differ */
const TABLE_CACHE_KEY: Record<string, string> = {
  payment_methods: 'payMethods',
  customer_groups: 'groups',
};
const toCacheKey = (table: string) => TABLE_CACHE_KEY[table] ?? table;

/** Tables that map 1:1 to a cache array. Other tables (order_items, order_payments)
 *  are nested inside `orders` rows, so we trigger a full refetch instead. */
const ARRAY_TABLES = new Set([
  'orders', 'customers', 'appointments', 'catalog',
  'payment_methods', 'promotions', 'customer_groups',
]);

const upsertInArray = (arr: any[], row: any) => {
  if (!row || !row.id) return arr;
  const idx = arr.findIndex((r) => r.id === row.id);
  if (idx === -1) return [row, ...arr];
  const next = arr.slice();
  next[idx] = { ...next[idx], ...row };
  return next;
};

const removeFromArray = (arr: any[], id: string) =>
  arr.filter((r) => r.id !== id);

let realtimeBound = false;

export function useCache() {
  const [cache, setCacheState] = useState<CacheState>(sharedCache);

  useEffect(() => {
    const listener = (next: CacheState) => setCacheState(next);
    cacheListeners.push(listener);
    return () => {
      cacheListeners = cacheListeners.filter((l) => l !== listener);
    };
  }, []);

  const setCache = useCallback((updater: any) => {
    if (typeof updater === 'function') {
      updateSharedCache(updater);
      return;
    }
    emitCache(updater);
  }, []);

  const fetchAll = useCallback(async (isDemo: boolean = false) => {
    if (isDemo) return;
    const sb = getSupabase();
    if (!sb) return;

    try {
      const [s, c, g, cat, pm, pr, a, o] = await Promise.all([
        sb.from('settings').select('*').single(),
        sb.from('customers').select('*,group:customer_groups(*)').order('created_at', { ascending: false }),
        sb.from('customer_groups').select('*').order('name'),
        sb.from('catalog').select('*').eq('is_active', true).order('type').order('name'),
        sb.from('payment_methods').select('*').eq('is_active', true).order('sort_order'),
        sb.from('promotions').select('*').eq('is_active', true).order('name'),
        sb.from('appointments').select('*,customer:customers(id,name,phone)').order('scheduled_at'),
        sb.from('orders').select('*,order_items(*),payments:order_payments(*)').order('created_at', { ascending: false }).limit(200),
      ]);

      updateSharedCache(prev => ({
        ...prev,
        settings: s.data || prev.settings,
        customers: c.data || prev.customers,
        groups: g.data || prev.groups,
        catalog: cat.data || prev.catalog,
        payMethods: pm.data || prev.payMethods,
        promotions: pr.data || prev.promotions,
        appointments: a.data || prev.appointments,
        orders: o.data || prev.orders,
      }));
    } catch (err) {
      if (import.meta.env.DEV) console.error('Error fetching cache:', err);
      throw err;
    }
  }, []);

  // Subscribe to Supabase Realtime once across the whole app.
  // Any INSERT/UPDATE/DELETE on watched tables is reflected in sharedCache,
  // which propagates to every hook subscriber on every device.
  useEffect(() => {
    if (realtimeBound) return;
    const sb = getSupabase();
    if (!sb) return;
    realtimeBound = true;

    // Debounce refetches: a single new order fires INSERT on orders +
    // INSERT on every order_item + INSERT on every payment, which would
    // otherwise trigger N+M+1 full refetches in quick succession.
    let refetchTimer: ReturnType<typeof setTimeout> | null = null;
    const refetchOrders = () => {
      if (refetchTimer) clearTimeout(refetchTimer);
      refetchTimer = setTimeout(async () => {
        refetchTimer = null;
        try {
          const { data } = await sb.from('orders')
            .select('*,order_items(*),payments:order_payments(*)')
            .order('created_at', { ascending: false })
            .limit(200);
          if (data) updateSharedCache(prev => ({ ...prev, orders: data }));
        } catch (e) {
          if (import.meta.env.DEV) console.error('Realtime orders refetch failed:', e);
        }
      }, 250);
    };

    const channel = sb.channel('nailpos-sync')
      .on('postgres_changes', { event: '*', schema: 'public' }, (payload: any) => {
        const table: string = payload.table;
        // order_items and order_payments are nested into `orders` — refetch the order list
        if (table === 'order_items' || table === 'order_payments') {
          refetchOrders();
          return;
        }
        if (table === 'settings') {
          if (payload.eventType === 'DELETE') {
            updateSharedCache(prev => ({ ...prev, settings: null }));
          } else if (payload.new) {
            // Merge instead of replace: another device editing a different
            // field shouldn't blow away our local edits in flight.
            updateSharedCache(prev => ({
              ...prev,
              settings: { ...(prev.settings || {}), ...payload.new },
            }));
          }
          return;
        }
        if (!ARRAY_TABLES.has(table)) return;
        const key = toCacheKey(table);
        updateSharedCache(prev => {
          const arr = (prev as any)[key] || [];
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            return { ...prev, [key]: upsertInArray(arr, payload.new) };
          }
          if (payload.eventType === 'DELETE') {
            return { ...prev, [key]: removeFromArray(arr, payload.old?.id) };
          }
          return prev;
        });
      })
      .subscribe();

    return () => {
      if (refetchTimer) { clearTimeout(refetchTimer); refetchTimer = null; }
      try { sb.removeChannel(channel); } catch { /* noop */ }
      realtimeBound = false;
    };
  }, []);

  const dbInsert = async (table: string, data: any, isDemo: boolean = false) => {
    const sb = getSupabase();
    if (isDemo || !sb) {
      const row = { id: uid(), ...data };
      const key = toCacheKey(table);
      updateSharedCache((prev: any) => ({ ...prev, [key]: [row, ...(prev[key] || [])] }));
      return row;
    }
    try {
      const { data: row, error } = await (sb as any).from(table).insert(data).select().single();
      if (error) throw error;
      if (ARRAY_TABLES.has(table) && row) {
        const key = toCacheKey(table);
        updateSharedCache((prev: any) => ({ ...prev, [key]: upsertInArray(prev[key] || [], row) }));
      }
      return row;
    } catch (err) {
      if (isTransientWriteError(err)) {
        // Network died mid-write — queue for replay on reconnect, return an
        // optimistic local row so the UI doesn't lie about success.
        const row = { id: data.id || uid(), ...data, _queued: true };
        await queueWrite({ table, op: 'insert', data: row });
        if (ARRAY_TABLES.has(table)) {
          const key = toCacheKey(table);
          updateSharedCache((prev: any) => ({ ...prev, [key]: upsertInArray(prev[key] || [], row) }));
        }
        return row;
      }
      throw err;
    }
  };

  const dbUpdate = async (table: string, id: string, patch: any, isDemo: boolean = false) => {
    const sb = getSupabase();
    if (isDemo || !sb) {
      const key = toCacheKey(table);
      updateSharedCache((prev: any) => ({
        ...prev,
        [key]: (prev[key] || []).map((r: any) => r.id === id ? { ...r, ...patch } : r)
      }));
      return;
    }
    try {
      const { error } = await (sb as any).from(table).update(patch).eq('id', id);
      if (error) throw error;
      if (ARRAY_TABLES.has(table)) {
        const key = toCacheKey(table);
        updateSharedCache((prev: any) => ({
          ...prev,
          [key]: (prev[key] || []).map((r: any) => r.id === id ? { ...r, ...patch } : r)
        }));
      }
    } catch (err) {
      if (isTransientWriteError(err)) {
        await queueWrite({ table, op: 'update', data: { id, ...patch } });
        if (ARRAY_TABLES.has(table)) {
          const key = toCacheKey(table);
          updateSharedCache((prev: any) => ({
            ...prev,
            [key]: (prev[key] || []).map((r: any) => r.id === id ? { ...r, ...patch, _queued: true } : r)
          }));
        }
        return;
      }
      throw err;
    }
  };

  /**
   * Atomically create an order with items + payments via the create_order_full
   * Postgres RPC. The RPC is idempotent on `order.id`, so retrying after a
   * network blip is safe. On transient (network) failure the call is queued
   * for replay on `online`; permanent server errors throw to the caller so
   * the UI can surface them.
   *
   * Requires migrations 002 + 003 to be applied. The legacy 3-step fallback
   * was removed — running pre-002 will surface a real error rather than
   * silently bypassing validation.
   */
  const createOrderAtomic = async (
    order: any,
    items: any[],
    payments: any[],
    isDemo: boolean = false
  ): Promise<string> => {
    if (isDemo) {
      // Demo path stays in localStorage — no DB transaction concerns.
      await dbInsert('orders', { ...order, order_items: items, payments }, true);
      return order.id;
    }
    const sb = getSupabase();
    if (!sb) throw new Error('Supabase chưa sẵn sàng');

    const args = { p_order: order, p_items: items, p_payments: payments };

    try {
      const { error } = await sb.rpc('create_order_full', args);
      if (error) throw error;
    } catch (err) {
      if (isTransientWriteError(err)) {
        // Network died mid-write. Queue the RPC for replay on reconnect.
        // The server-side idempotency check on order.id makes this safe.
        await queueWrite({ table: 'orders', op: 'rpc', data: { fn: 'create_order_full', args } });
        // Optimistically reflect the order in the cache so the UI updates.
        updateSharedCache(prev => ({
          ...prev,
          orders: upsertInArray(prev.orders, {
            ...order,
            order_items: items,
            payments,
            _queued: true,
          }),
        }));
        return order.id;
      }
      throw err;
    }

    // Realtime will echo, but refresh once for immediate consistency.
    await fetchAll(false);
    return order.id;
  };

  const dbDelete = async (table: string, id: string, isDemo: boolean = false) => {
    const sb = getSupabase();
    if (isDemo || !sb) {
      const key = toCacheKey(table);
      updateSharedCache((prev: any) => ({
        ...prev,
        [key]: (prev[key] || []).filter((r: any) => r.id !== id)
      }));
      return;
    }
    try {
      const { error } = await (sb as any).from(table).delete().eq('id', id);
      if (error) throw error;
      if (ARRAY_TABLES.has(table)) {
        const key = toCacheKey(table);
        updateSharedCache((prev: any) => ({ ...prev, [key]: removeFromArray(prev[key] || [], id) }));
      }
    } catch (err) {
      if (isTransientWriteError(err)) {
        await queueWrite({ table, op: 'delete', data: { id } });
        if (ARRAY_TABLES.has(table)) {
          const key = toCacheKey(table);
          updateSharedCache((prev: any) => ({ ...prev, [key]: removeFromArray(prev[key] || [], id) }));
        }
        return;
      }
      throw err;
    }
  };

  return {
    cache,
    setCache,
    fetchAll,
    dbInsert,
    dbUpdate,
    dbDelete,
    createOrderAtomic,
  };
}
