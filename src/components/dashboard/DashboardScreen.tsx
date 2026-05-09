import React, { useState, useMemo, useRef } from 'react';
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

export const DashboardScreen: React.FC<DashboardScreenProps> = ({
  onViewAppointments,
  onViewOrders,
  onOpenShiftAction,
  onViewReport,
}) => {
  const { cache, fetchAll } = useCache();
  const { activeShift } = useShift();
  const { t } = useLang();
  const [dashFilter, setDashFilter] = useState<'day' | 'yesterday' | 'week' | 'month' | 'year'>('day');

  const { fromDate, toDate } = useMemo(() => {
    const now = new Date();
    const ts = (d: Date) => d.toISOString().split('T')[0];
    const today = todayStr();
    if (dashFilter === 'day') return { fromDate: today, toDate: today };
    if (dashFilter === 'yesterday') {
      const d = new Date(now); d.setDate(d.getDate() - 1); const s = ts(d);
      return { fromDate: s, toDate: s };
    }
    if (dashFilter === 'week') {
      const d = new Date(now); d.setDate(d.getDate() - 7); return { fromDate: ts(d), toDate: today };
    }
    if (dashFilter === 'month') return { fromDate: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`, toDate: today };
    return { fromDate: `${now.getFullYear()}-01-01`, toDate: today };
  }, [dashFilter]);

  const allOrders = cache.orders || [];
  const filtered = allOrders.filter(o => {
    const d = (o.created_at || '').slice(0, 10);
    return d >= fromDate && d <= toDate && o.status !== 'cancelled';
  });
  const paid = filtered.filter(o => o.status === 'paid');
  const revenue = paid.reduce((s, o) => s + (o.final_amount || 0), 0);
  const pending = allOrders.filter(o => o.status === 'pending').length;
  
  const todayAppts = (cache.appointments || []).filter(a => (a.scheduled_at || a.datetime || '').startsWith(todayStr()));

  const chartDays = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const ds = d.toISOString().split('T')[0];
      const rev = allOrders.filter(o => o.created_at === ds && o.status === 'paid').reduce((s, o) => s + (o.final_amount || 0), 0);
      days.push({ lbl: ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][d.getDay()], rev, isToday: i === 0 });
    }
    return days;
  }, [allOrders]);

  const maxRev = Math.max(...chartDays.map(d => d.rev), 1);

  const topSvcs = useMemo(() => {
    const svcMap: Record<string, { name: string; count: number; rev: number }> = {};
    paid.forEach(o => (o.order_items || []).forEach((i: any) => {
      const k = i.name;
      if (!svcMap[k]) svcMap[k] = { name: k, count: 0, rev: 0 };
      svcMap[k].count += (i.quantity || 1);
      svcMap[k].rev += i.price * (i.quantity || 1);
    }));
    return Object.values(svcMap).sort((a, b) => b.count - a.count).slice(0, 5);
  }, [paid]);

  const shiftRev = useMemo(() => {
    if (!activeShift) return 0;
    return allOrders.filter((o: any) => (o.created_at || '').slice(0, 10) >= (activeShift.date || todayStr()) && o.status === 'paid')
      .reduce((s: number, o: any) => s + (o.final_amount || 0), 0);
  }, [activeShift, allOrders]);

  const dashFilterLabels: Record<string, string> = {
    day: 'hôm nay',
    yesterday: 'hôm qua',
    week: '7 ngày qua',
    month: 'tháng này',
    year: 'năm nay'
  };

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

      {/* Filters */}
      <div id="dFilters" style={{ marginBottom: '10px' }}>
        <select
          className="fc"
          style={{ height: '36px', padding: '0 12px', fontSize: '13px', width: '160px' }}
          value={dashFilter}
          onChange={e => setDashFilter(e.target.value as any)}
        >
          <option value="day">{t('Hôm nay')}</option>
          <option value="yesterday">{t('Hôm qua')}</option>
          <option value="week">{t('7 ngày')}</option>
          <option value="month">{t('Tháng này')}</option>
          <option value="year">{t('Năm nay')}</option>
        </select>
      </div>

      {/* Metrics */}
      <div className="mggrid" id="dMetrics">
        <div className="metric"><div className="m-lbl">{t('Doanh thu')}</div><div className="m-val" style={{ color: 'var(--brand)' }}>{revenue >= 1e6 ? (revenue / 1e6).toFixed(1) + 'tr' : VND(revenue)}</div><div className="m-sub">{paid.length} {t('đơn hoàn thành')}</div></div>
        <div className="metric"><div className="m-lbl">{t('Chờ thanh toán')}</div><div className="m-val" style={{ color: 'var(--amber)' }}>{pending}</div><div className="m-sub">{t('đơn hàng')}</div></div>
        <div className="metric"><div className="m-lbl">{t('Khách hàng')}</div><div className="m-val" style={{ color: 'var(--blue)' }}>{(cache.customers || []).length}</div><div className="m-sub">{t('đã lưu hồ sơ')}</div></div>
        <div className="metric"><div className="m-lbl">{t('Lịch hẹn hôm nay')}</div><div className="m-val" style={{ color: 'var(--green)' }}>{todayAppts.length}</div><div className="m-sub">{t('lịch')}</div></div>
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
          todayAppts.slice(0, 4).map(a => (
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

      {/* Top Services */}
      <div className="shd"><h3>{t('Dịch vụ bán chạy')}</h3><span id="dTopSvcPeriod" style={{ fontSize: '11px', color: 'var(--ink4)' }}>{dashFilterLabels[dashFilter]}</span></div>
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
