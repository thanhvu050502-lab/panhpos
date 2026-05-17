import { useState, useEffect } from 'react';
import { uid, todayStr } from '../lib/utils';

const SHIFTS_KEY = 'np_shifts';
const ACTIVE_SHIFT_KEY = 'np_active_shift';
const SHIFT_TEMPLATES_KEY = 'np_shift_templates';

const DEFAULT_TEMPLATES = [
  { id: 'tpl_full',      name: 'Cả ngày',  startTime: '08:00', endTime: '20:00', color: '#8B5CF6', bg: '#F5F3FF' },
  { id: 'tpl_morning',   name: 'Ca sáng',  startTime: '08:00', endTime: '13:00', color: '#D97706', bg: '#FFFBEB' },
  { id: 'tpl_afternoon', name: 'Ca chiều', startTime: '13:00', endTime: '18:00', color: '#2563EB', bg: '#EFF6FF' },
  { id: 'tpl_evening',   name: 'Ca tối',   startTime: '18:00', endTime: '20:00', color: '#16A34A', bg: '#F0FDF4' },
];

export function useShift() {
  const [activeShift, setActiveShiftState] = useState<any>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Seed default templates if empty
    try {
      const stored = localStorage.getItem(SHIFT_TEMPLATES_KEY);
      const parsed = stored ? JSON.parse(stored) : [];
      if (!Array.isArray(parsed) || parsed.length === 0) {
        localStorage.setItem(SHIFT_TEMPLATES_KEY, JSON.stringify(DEFAULT_TEMPLATES));
      }
    } catch { localStorage.setItem(SHIFT_TEMPLATES_KEY, JSON.stringify(DEFAULT_TEMPLATES)); }

    // Load active shift
    try {
      const stored = localStorage.getItem(ACTIVE_SHIFT_KEY);
      if (stored) setActiveShiftState(JSON.parse(stored));
    } catch (e) {
      if (import.meta.env.DEV) console.error('Error parsing active shift:', e);
    }
  }, []);

  const getShifts = (): any[] => {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem(SHIFTS_KEY) || '[]') || []; }
    catch { return []; }
  };

  const saveShifts = (s: any[]) => {
    if (typeof window !== 'undefined') localStorage.setItem(SHIFTS_KEY, JSON.stringify(s));
  };

  const getActiveShift = (): any | null => {
    if (typeof window === 'undefined') return null;
    try { return JSON.parse(localStorage.getItem(ACTIVE_SHIFT_KEY) || 'null'); }
    catch { return null; }
  };

  const setActiveShift = (s: any | null) => {
    if (typeof window === 'undefined') return;
    if (s) {
      localStorage.setItem(ACTIVE_SHIFT_KEY, JSON.stringify(s));
    } else {
      localStorage.removeItem(ACTIVE_SHIFT_KEY);
    }
    setActiveShiftState(s);
  };

  const getShiftTemplates = (): any[] => {
    if (typeof window === 'undefined') return DEFAULT_TEMPLATES;
    try {
      const stored = localStorage.getItem(SHIFT_TEMPLATES_KEY);
      const parsed = stored ? JSON.parse(stored) : [];
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_TEMPLATES;
    } catch { return DEFAULT_TEMPLATES; }
  };

  const saveShiftTemplates = (t: any[]) => {
    if (typeof window !== 'undefined') localStorage.setItem(SHIFT_TEMPLATES_KEY, JSON.stringify(t));
  };

  const openShift = (templateId: string, staffList: string[], startTime: string, endTime: string, note: string, openingFloat: number = 0) => {
    const templates = getShiftTemplates();
    const tpl = templates.find(t => t.id === templateId) || templates[0];
    const shift = {
      id: uid(),
      templateId,
      typeLabel: tpl?.name || 'Ca làm việc',
      color: tpl?.color || '#8B5CF6',
      bg: tpl?.bg || '#F5F3FF',
      date: todayStr(),
      openTime: new Date().toISOString(),
      plannedStart: startTime || tpl?.startTime || '08:00',
      plannedEnd: endTime || tpl?.endTime || '20:00',
      staff: staffList,
      openNote: note,
      openingFloat: Math.max(0, openingFloat | 0),
      status: 'open',
      revenue: 0,
      orderCount: 0,
    };
    const existing = getShifts();
    saveShifts([shift, ...existing]);
    setActiveShift(shift);
    return shift;
  };

  const closeShift = (orders: any[], actualCash: number, closeNote: string, expectedCash: number = 0) => {
    const shift = getActiveShift();
    if (!shift) return null;

    // Filter by ACTUAL timestamps, not date string. A shift opened at 23:50
    // and closed at 00:30 the next day must include both calendar days; an
    // order created at 00:15 next day belongs to this shift, not tomorrow's.
    const closeIso = new Date().toISOString();
    const openMs = new Date(shift.openTime).getTime();
    const closeMs = new Date(closeIso).getTime();
    const shiftOrders = orders.filter((o: any) => {
      const t = new Date(o.created_at || 0).getTime();
      return t >= openMs && t <= closeMs && o.status === 'paid';
    });
    const revenue = shiftOrders.reduce((s: number, o: any) => s + (o.final_amount || 0), 0);
    const orderCount = shiftOrders.length;
    const variance = actualCash - expectedCash;

    const closed = {
      ...shift,
      status: 'closed',
      closeTime: closeIso,
      actualCash,
      closeNote,
      expectedCash,
      variance,
      revenue,
      orderCount,
    };
    const existing = getShifts();
    saveShifts(existing.map((s: any) => s.id === shift.id ? closed : s));
    setActiveShift(null);
    return closed;
  };

  /**
   * Live revenue for the currently-open shift (or any shift, given its
   * openTime/closeTime). Use timestamps so cross-midnight shifts compute
   * correctly. The `shiftDate` parameter is kept for back-compat callers
   * that don't have an active shift handy — it falls back to a calendar-day
   * filter when no openTime is provided.
   */
  const getShiftRevenue = (orders: any[], shiftDate: string, openTime?: string, closeTime?: string) => {
    if (openTime) {
      const openMs = new Date(openTime).getTime();
      const closeMs = closeTime ? new Date(closeTime).getTime() : Date.now();
      return orders
        .filter((o: any) => {
          const t = new Date(o.created_at || 0).getTime();
          return t >= openMs && t <= closeMs && o.status === 'paid';
        })
        .reduce((s: number, o: any) => s + (o.final_amount || 0), 0);
    }
    return orders
      .filter((o: any) => (o.created_at || '').slice(0, 10) === shiftDate && o.status === 'paid')
      .reduce((s: number, o: any) => s + (o.final_amount || 0), 0);
  };

  const checkShiftBeforeOrder = (onWarning?: (msg: string) => void) => {
    const shift = getActiveShift();
    if (!shift) {
      if (onWarning) onWarning('Chưa mở ca hôm nay! Vui lòng mở ca trước khi tạo đơn hàng.');
      return false;
    }
    return true;
  };

  return {
    activeShift,
    getShifts,
    saveShifts,
    getActiveShift,
    setActiveShift,
    getShiftTemplates,
    saveShiftTemplates,
    openShift,
    closeShift,
    getShiftRevenue,
    checkShiftBeforeOrder,
    DEFAULT_TEMPLATES,
  };
}
