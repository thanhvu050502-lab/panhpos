import React, { useState, useMemo, useRef, useCallback } from 'react';
import { useCache } from '../../hooks/useCache';
import { useShift } from '../../hooks/useShift';
import { useLang } from '../../contexts/LangContext';
import { VND, todayStr, fmtDT } from '../../lib/utils';
import { Avatar } from '../ui/Avatar';
import { Badge } from '../ui/Badge';

interface DashboardScreenProps {
  onViewAppointments?: () => void;
  onViewOrders?: () => void;
  onOpenShiftAction?: () => void;
  onViewReport?: () => void;
}

type Period = 'day' | 'yesterday' | 'week' | 'month' | 'year';

const PERIOD_OPTIONS: Array<{ value: Period; label: string }> = [
  { value: 'day', label: 'Hôm nay' },
  { value: 'yesterday', label: 'Hôm qua' },
  { value: 'week', label: '7 ngày' },
  { value: 'month', label: 'Tháng này' },
  { value: 'year', label: 'Năm nay' },
];

const PERIOD_LABEL: Record<Period, string> = {
  day: 'hôm nay',
  yesterday: 'hôm qua',
  week: '7 ngày qua',
  month: 'tháng này',
  year: 'năm nay',
};

function periodRange(period: Period): { fromDate: string; toDate: string } {
  const now = new Date();
  const ts = (d: Date) => d.toISOString().split('T')[0];
  const today = todayStr();
  if (period === 'day') return { fromDate: today, toDate: today };
  if (period === 'yesterday') {
    const d = new Date(now); d.setDate(d.getDate() - 1); const s = ts(d);
    return { fromDate: s, toDate: s };
  }
  if (period === 'week') {
    const d = new Date(now); d.setDate(d.getDate() - 7); return { fromDate: ts(d), toDate: today };
  }
  if (period === 'month') return { fromDate: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`, toDate: today };
  return { fromDate: `${now.getFullYear()}-01-01`, toDate: today };
}

const PERIOD_KEY = 'np_dashboard_periods';
const CHAIRS_KEY = 'np_total_chairs';

const PeriodSelect: React.FC<{ value: Period; onChange: (p: Period) => void }> = ({ value, onChange }) => (
  <select
    className="fc"
    style={{ height: '24px', padding: '0 18px 0 6px', fontSize: '10.5px', width: 'auto', minWidth: 0, border: '1px solid var(--bdr)', background: 'var(--bg)', color: 'var(--ink3)', fontWeight: 500 }}
    value={value}
    onChange={e => onChange(e.target.value as Period)}
    onClick={e => e.stopPropagation()}
  >
    {PERIOD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
);

export const DashboardScreen: React.FC<DashboardScreenProps> = ({
  onViewAppointments,
  onViewOrders,
  onOpenShiftAction,
  onViewReport,
}) => {
  const { cache, fetchAll } = useCache();
  const { activeShift } = useShift();
  const { t } = useLang();

  // Per-card period state, persisted to localStorage so the owner's view sticks.
  const [cardPeriods, setCardPeriods] = useState<Record<string, Period>>(() => {
    if (typeof window === 'undefined') return {};
    try { return JSON.parse(localStorage.getItem(PERIOD_KEY) || '{}'); }
    catch { return {}; }
  });

  const setPeriod = useCallback((key: string, p: Period) => {
    setCardPeriods(prev => {
      const next = { ...prev, [key]: p };
      try { localStorage.setItem(PERIOD_KEY, JSON.stringify(next)); } catch { /* quota */ }
      return next;
    });
  }, []);

  const getPeriod = (key: string, fallback: Period = 'day'): Period => cardPeriods[key] || fallback;

  const allOrders = useMemo(() => cache.orders || [], [cache.orders]);
  const allCustomers = useMemo(() => cache.customers || [], [cache.customers]);
  const allAppts = useMemo(() => cache.appointments || [], [cache.appointments]);

  // ── Helpers per card ─────────────────────────────────────────────────────
  const revenuePeriod = getPeriod('revenue');
  const revenueRange = useMemo(() => periodRange(revenuePeriod), [revenuePeriod]);
  const revenueOrders = useMemo(() => allOrders.filter(o => {
    const d = (o.created_at || '').slice(0, 10);
    return d >= revenueRange.fromDate && d <= revenueRange.toDate && o.status === 'paid';
  }), [allOrders, revenueRange]);
  const revenue = revenueOrders.reduce((s, o) => s + (o.final_amount || 0), 0);

  const completedPeriod = getPeriod('completed');
  const completedRange = useMemo(() => periodRange(completedPeriod), [completedPeriod]);
  const completedCount = useMemo(() => allOrders.filter(o => {
    const d = (o.created_at || '').slice(0, 10);
    return d >= completedRange.fromDate && d <= completedRange.toDate && o.status === 'paid';
  }).length, [allOrders, completedRange]);

  const customerPeriod = getPeriod('customers');
  const customerRange = useMemo(() => periodRange(customerPeriod), [customerPeriod]);
  const newCustomers = useMemo(() => allCustomers.filter((c: any) => {
    const d = (c.created_at || '').slice(0, 10);
    return d >= customerRange.fromDate && d <= customerRange.toDate;
  }).length, [allCustomers, customerRange]);

  const apptPeriod = getPeriod('appts');
  const apptRange = useMemo(() => periodRange(apptPeriod), [apptPeriod]);
  const periodAppts = useMemo(() => allAppts.filter((a: any) => {
    const d = (a.scheduled_at || a.datetime || '').slice(0, 10);
    return d >= apptRange.fromDate && d <= apptRange.toDate;
  }), [allAppts, apptRange]);

  // Today figures for Live Activity widget (always real-time, not filtered)
  const todayKey = todayStr();
  const pendingCount = allOrders.filter(o => o.status === 'pending').length;
  const pendingAmount = allOrders.filter(o => o.status === 'pending').reduce((s, o) => s + (o.final_amount || 0), 0);
  const todayPaid = allOrders.filter(o => (o.created_at || '').slice(0, 10) === todayKey && o.status === 'paid').length;
  const todayAppts = allAppts.filter((a: any) => (a.scheduled_at || a.datetime || '').startsWith(todayKey));
  const todayApptsUpcoming = todayAppts.filter((a: any) => new Date(a.scheduled_at || a.datetime).getTime() > Date.now() && a.status !== 'cancelled' && a.status !== 'done').length;

  const totalChairs = useMemo(() => {
    if (typeof window === 'undefined') return 0;
    const v = parseInt(localStorage.getItem(CHAIRS_KEY) || '0');
    return Number.isFinite(v) && v > 0 ? v : 0;
  }, []);
  const chairUtilization = totalChairs > 0 ? Math.min(100, Math.round((pendingCount / totalChairs) * 100)) : 0;

  // ── Chart (always 7-day, independent of card filters) ────────────────────
  const chartDays = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const ds = d.toISOString().split('T')[0];
      const rev = allOrders.filter(o => (o.created_at || '').slice(0, 10) === ds && o.status === 'paid').reduce((s, o) => s + (o.final_amount || 0), 0);
      days.push({ lbl: ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][d.getDay()], rev, isToday: i === 0 });
    }
    return days;
  }, [allOrders]);

  const maxRev = Math.max(...chartDays.map(d => d.rev), 1);

  // Top services follows the Doanh thu card's period so they tell a coherent story.
  const topSvcs = useMemo(() => {
    const svcMap: Record<string, { name: string; count: number; rev: number }> = {};
    revenueOrders.forEach(o => (o.order_items || []).forEach((i: any) => {
      const k = i.name;
      if (!svcMap[k]) svcMap[k] = { name: k, count: 0, rev: 0 };
      svcMap[k].count += (i.quantity || 1);
      svcMap[k].rev += i.price * (i.quantity || 1);
    }));
    return Object.values(svcMap).sort((a, b) => b.count - a.count).slice(0, 5);
  }, [revenueOrders]);

  const shiftRev = useMemo(() => {
    if (!activeShift) return 0;
    return allOrders.filter((o: any) => (o.created_at || '').slice(0, 10) >= (activeShift.date || todayStr()) && o.status === 'paid')
      .reduce((s: number, o: any) => s + (o.final_amount || 0), 0);
  }, [activeShift, allOrders]);

  // ── Pull-to-refresh ──────────────────────────────────────────────────────
  const PTR_THRESHOLD = 60;
  const PTR_MAX = 80;
  const touchStartY = useRef(-1);
  const [pullState, setPullState] = useState<'idle' | 'pulling' | 'triggered' | 'refreshing'>('idle');
  const [pullY, setPullY] = useState(0);

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.currentTarget.scrollTop === 0) {
      touchStartY.current = e.touches[0].clientY;
    } else {
      touchStartY.current = -1;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (touchStartY.current < 0) return;
    const dy = e.touches[0].clientY - touchStartY.current;
    if (dy <= 0) { touchStartY.current = -1; return; }
    const capped = Math.min(dy, PTR_MAX);
    setPullY(capped);
    setPullState(dy >= PTR_THRESHOLD ? 'triggered' : 'pulling');
  };

  const handleTouchEnd = async () => {
    const state = pullState;
    if (state === 'triggered') {
      setPullState('refreshing');
      setPullY(48);
      try {
        const isDemo = localStorage.getItem('np_demo') === '1';
        await fetchAll(isDemo);
      } finally {
        setPullState('idle');
        setPullY(0);
      }
    } else if (state === 'pulling') {
      setPullState('idle');
      setPullY(0);
    }
    touchStartY.current = -1;
  };

  // Last close variance (for owner glance)
  const closedShiftWithVariance = (() => {
    try {
      const list = JSON.parse(localStorage.getItem('np_shifts') || '[]');
      const closed = list.find((s: any) => s.status === 'closed' && typeof s.variance === 'number');
      return closed || null;
    } catch { return null; }
  })();

  return (
    <div
      className="screen active"
      id="s-dash"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {pullState !== 'idle' && (
        <div className="ptr-indicator" style={{ transform: `translateY(${pullY - 48}px)` }}>
          {pullState === 'refreshing' ? (
            <><span className="ptr-spinner" /> Đang tải...</>
          ) : pullState === 'triggered' ? (
            '↑ Thả để làm mới'
          ) : (
            '↓ Kéo để làm mới'
          )}
        </div>
      )}

      {/* Shift Banner */}
      {activeShift ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: activeShift.bg || '#F5F3FF', border: `1px solid ${activeShift.color || '#8B5CF6'}44`, borderRadius: '12px', padding: '10px 14px', marginBottom: '12px' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={activeShift.color || '#8B5CF6'} strokeWidth="2" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: activeShift.color || '#8B5CF6' }}>{activeShift.typeLabel || 'Ca làm việc'} đang mở</span>
            <span style={{ fontSize: '12px', color: 'var(--ink3)', marginLeft: '6px' }}>
              · {activeShift.openTime ? new Date(activeShift.openTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : ''}
            </span>
            {shiftRev > 0 && <span style={{ fontSize: '12px', color: activeShift.color || '#8B5CF6', marginLeft: '6px', fontWeight: 600 }}>· {VND(shiftRev)}</span>}
          </div>
          <button style={{ flexShrink: 0, fontSize: '11px', fontWeight: 600, color: activeShift.color || '#8B5CF6', background: 'none', border: 'none', cursor: 'pointer' }} onClick={onOpenShiftAction}>Xem ca →</button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '12px', padding: '10px 14px', marginBottom: '12px' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#D97706' }}>Chưa mở ca hôm nay</span>
          <button style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: 600, color: '#D97706', background: 'none', border: 'none', cursor: 'pointer' }} onClick={onOpenShiftAction}>Mở ca →</button>
        </div>
      )}

      {/* Last shift variance alert */}
      {closedShiftWithVariance && closedShiftWithVariance.variance !== 0 && (
        <div style={{
          fontSize: '12px', padding: '8px 12px', borderRadius: '10px', marginBottom: '10px',
          background: closedShiftWithVariance.variance > 0 ? '#EFF6FF' : 'var(--red-bg)',
          color: closedShiftWithVariance.variance > 0 ? 'var(--blue)' : 'var(--red)',
          border: `1px solid ${closedShiftWithVariance.variance > 0 ? '#BFDBFE' : 'var(--red)'}44`,
        }}>
          <strong>Chênh lệch ca trước:</strong> {closedShiftWithVariance.variance > 0 ? `Thừa ${VND(closedShiftWithVariance.variance)}` : `Thiếu ${VND(Math.abs(closedShiftWithVariance.variance))}`}
          {closedShiftWithVariance.date ? ` · ${closedShiftWithVariance.date}` : ''}
        </div>
      )}

      {/* Live Activity */}
      <div className="card" style={{ marginBottom: '10px', padding: '12px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--green)', animation: 'pulse 2s infinite', display: 'inline-block' }} />
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{t('Đang hoạt động')}</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: totalChairs > 0 ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)', gap: '10px' }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--amber)' }}>{pendingCount}</div>
            <div style={{ fontSize: '10.5px', color: 'var(--ink3)', marginTop: '2px' }}>{t('Đang phục vụ')}</div>
            {pendingAmount > 0 && <div style={{ fontSize: '10px', color: 'var(--ink4)' }}>{VND(pendingAmount)}</div>}
          </div>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--green)' }}>{todayPaid}</div>
            <div style={{ fontSize: '10.5px', color: 'var(--ink3)', marginTop: '2px' }}>{t('Đã xong hôm nay')}</div>
          </div>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--blue)' }}>{todayApptsUpcoming}</div>
            <div style={{ fontSize: '10.5px', color: 'var(--ink3)', marginTop: '2px' }}>{t('Hẹn sắp tới')}</div>
          </div>
          {totalChairs > 0 && (
            <div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: chairUtilization >= 90 ? 'var(--red)' : chairUtilization >= 60 ? 'var(--amber)' : 'var(--green)' }}>
                {pendingCount}/{totalChairs}
              </div>
              <div style={{ fontSize: '10.5px', color: 'var(--ink3)', marginTop: '2px' }}>{t('Công suất')} · {chairUtilization}%</div>
            </div>
          )}
        </div>
      </div>

      {/* Metrics (each with its own period) */}
      <div className="mggrid" id="dMetrics">
        <div className="metric">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <div className="m-lbl">{t('Doanh thu')}</div>
            <PeriodSelect value={revenuePeriod} onChange={p => setPeriod('revenue', p)} />
          </div>
          <div className="m-val" style={{ color: 'var(--brand)' }}>{revenue >= 1e6 ? (revenue / 1e6).toFixed(1) + 'tr' : VND(revenue)}</div>
          <div className="m-sub">{revenueOrders.length} {t('đơn hoàn thành')}</div>
        </div>
        <div className="metric">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <div className="m-lbl">{t('Đơn hoàn thành')}</div>
            <PeriodSelect value={completedPeriod} onChange={p => setPeriod('completed', p)} />
          </div>
          <div className="m-val" style={{ color: 'var(--green)' }}>{completedCount}</div>
          <div className="m-sub">{PERIOD_LABEL[completedPeriod]}</div>
        </div>
        <div className="metric">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <div className="m-lbl">{t('Khách mới')}</div>
            <PeriodSelect value={customerPeriod} onChange={p => setPeriod('customers', p)} />
          </div>
          <div className="m-val" style={{ color: 'var(--blue)' }}>{newCustomers}</div>
          <div className="m-sub">{PERIOD_LABEL[customerPeriod]}</div>
        </div>
        <div className="metric">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <div className="m-lbl">{t('Lịch hẹn')}</div>
            <PeriodSelect value={apptPeriod} onChange={p => setPeriod('appts', p)} />
          </div>
          <div className="m-val" style={{ color: 'var(--amber)' }}>{periodAppts.length}</div>
          <div className="m-sub">{PERIOD_LABEL[apptPeriod]}</div>
        </div>
      </div>

      {/* Chart */}
      <div className="card" style={{ marginBottom: '10px' }}>
        <div style={{ padding: '12px 16px 4px', fontSize: '12px', fontWeight: 600, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>7 ngày gần nhất</div>
        <div style={{ padding: '0 16px 14px' }}>
          <div className="bars" id="dChart">
            {chartDays.map((d, i) => (
              <div key={i} className="barcol">
                <div className={`bar${d.isToday ? ' today' : ''}`} style={{ height: `${Math.max(3, Math.round(d.rev / maxRev * 68))}px` }} title={VND(d.rev)}></div>
                <div className="blbl">{d.lbl}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Appointments */}
      <div className="shd"><h3>{t('Lịch hẹn hôm nay')}</h3><button className="btn ghost sm" onClick={onViewAppointments}>{t('Xem tất cả')}</button></div>
      <div className="card" id="dAppts">
        {!todayAppts.length ? (
          <div className="empty"><div className="empty-ico">📅</div><div className="empty-ttl">{t('Không có lịch hẹn hôm nay')}</div></div>
        ) : (
          todayAppts.slice(0, 4).map((a: any) => (
            <div key={a.id} className="lrow tap">
              <div className="appt-tb">{(a.scheduled_at || a.datetime || '').split('T')[1]?.slice(0, 5) || ''}</div>
              <Avatar name={a.customer_name} size={30} />
              <div className="lrow-info">
                <div className="lrow-ttl">{a.customer_name}</div>
                <div className="lrow-sub">{(a.services || []).join(', ') || '—'}</div>
              </div>
              <Badge status={a.status} />
            </div>
          ))
        )}
      </div>

      {/* Report shortcut */}
      {onViewReport && (
        <button
          className="btn outline"
          style={{ width: '100%', marginBottom: '10px', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
          onClick={onViewReport}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
          {t('Báo cáo chi tiết')}
        </button>
      )}

      {/* Top Services — follows Doanh thu period */}
      <div className="shd"><h3>{t('Dịch vụ bán chạy')}</h3><span id="dTopSvcPeriod" style={{ fontSize: '11px', color: 'var(--ink4)' }}>{PERIOD_LABEL[revenuePeriod]}</span></div>
      <div className="card" id="dTopSvc">
        {!topSvcs.length ? (
          <div className="empty" style={{ padding: '20px' }}><div className="empty-ico">💅</div><div className="empty-ttl" style={{ fontSize: '13px' }}>{t('Chưa có dữ liệu')}</div></div>
        ) : (
          topSvcs.map((s, i) => {
            const maxCount = topSvcs[0].count;
            return (
              <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', borderBottom: i < topSvcs.length - 1 ? '1px solid var(--bdr)' : 'none' }}>
                <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'var(--brand-l)', color: 'var(--brand)', fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>
                  <div style={{ marginTop: '4px', height: '4px', borderRadius: '2px', background: 'var(--bg3)' }}>
                    <div style={{ height: '100%', borderRadius: '2px', background: 'var(--brand)', width: `${Math.round(s.count / maxCount * 100)}%` }}></div>
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--brand)' }}>{s.count} {t('lần')}</div>
                  <div style={{ fontSize: '11px', color: 'var(--ink4)' }}>{VND(s.rev)}</div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Recent Orders */}
      <div className="shd"><h3>{t('Đơn hàng gần đây')}</h3><button className="btn ghost sm" onClick={onViewOrders}>{t('Xem tất cả')}</button></div>
      <div className="card" id="dOrders">
        {!allOrders.length ? (
          <div className="empty"><div className="empty-ico">🧾</div><div className="empty-ttl">{t('Chưa có đơn hàng nào')}</div></div>
        ) : (
          allOrders.slice(0, 4).map(o => {
            const svcs = (o.order_items || []).map((i: any) => i.name).join(', ');
            return (
              <div key={o.id} className="lrow tap">
                <Avatar name={o.customer_name} />
                <div className="lrow-info">
                  <div className="lrow-ttl">{o.customer_name}</div>
                  <div className="lrow-sub">{o.code ? o.code + ' · ' : ''}{svcs || '—'} · {fmtDT(o.created_at)}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--brand)' }}>{VND(o.final_amount)}</div>
                  <div style={{ marginTop: '3px' }}><Badge status={o.status} /></div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
