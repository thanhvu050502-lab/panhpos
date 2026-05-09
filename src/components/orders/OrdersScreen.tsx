import React, { useEffect, useMemo, useState } from 'react';
import { useCache } from '../../hooks/useCache';
import { useLang } from '../../contexts/LangContext';
import { Avatar } from '../ui/Avatar';
import { Badge } from '../ui/Badge';
import { formatCurrency } from '../../lib/utils';

type DateMode = 'today' | 'yesterday' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'all' | 'custom';

const FILTER_KEY = 'np_orders_filter';

const pad = (n: number) => String(n).padStart(2, '0');
const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const computeRange = (mode: DateMode): { from: string; to: string } => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = today.getDay() === 0 ? 7 : today.getDay();
  switch (mode) {
    case 'today': return { from: toISO(today), to: toISO(today) };
    case 'yesterday': {
      const y = new Date(today); y.setDate(y.getDate() - 1);
      return { from: toISO(y), to: toISO(y) };
    }
    case 'thisWeek': {
      const monday = new Date(today); monday.setDate(today.getDate() - (dow - 1));
      return { from: toISO(monday), to: toISO(today) };
    }
    case 'lastWeek': {
      const lastMon = new Date(today); lastMon.setDate(today.getDate() - (dow - 1) - 7);
      const lastSun = new Date(lastMon); lastSun.setDate(lastMon.getDate() + 6);
      return { from: toISO(lastMon), to: toISO(lastSun) };
    }
    case 'thisMonth': {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: toISO(first), to: toISO(today) };
    }
    case 'lastMonth': {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const last = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: toISO(first), to: toISO(last) };
    }
    case 'all': return { from: '', to: '' };
    default: return { from: toISO(today), to: toISO(today) };
  }
};

export const OrdersScreen: React.FC = () => {
  const { cache, fetchAll } = useCache();
  const { t } = useLang();

  const saved = (() => {
    try { return JSON.parse(localStorage.getItem(FILTER_KEY) || '{}'); } catch { return {}; }
  })();

  const [statusFilter, setStatusFilter] = useState<string>(saved.statusFilter || 'all');
  const [dateMode, setDateMode] = useState<DateMode>(saved.dateMode || 'thisWeek');
  const initRange = computeRange(saved.dateMode || 'thisWeek');
  const [dateFrom, setDateFrom] = useState(saved.dateFrom ?? initRange.from);
  const [dateTo, setDateTo] = useState(saved.dateTo ?? initRange.to);
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    localStorage.setItem(FILTER_KEY, JSON.stringify({ statusFilter, dateMode, dateFrom, dateTo }));
  }, [statusFilter, dateMode, dateFrom, dateTo]);

  const dateModes: { k: DateMode; l: string }[] = [
    { k: 'today', l: 'Hôm nay' },
    { k: 'yesterday', l: 'Hôm qua' },
    { k: 'thisWeek', l: 'Tuần này' },
    { k: 'lastWeek', l: 'Tuần trước' },
    { k: 'thisMonth', l: 'Tháng này' },
    { k: 'lastMonth', l: 'Tháng trước' },
    { k: 'all', l: 'Tất cả' },
    { k: 'custom', l: 'Tùy chọn' },
  ];

  const statusOpts = [
    { k: 'all', l: 'Tất cả' },
    { k: 'pending', l: 'Chờ TT' },
    { k: 'paid', l: 'Đã TT' },
    { k: 'cancelled', l: 'Đã huỷ' },
  ];

  const applyDateMode = (mode: DateMode) => {
    setDateMode(mode);
    if (mode !== 'custom') {
      const r = computeRange(mode);
      setDateFrom(r.from);
      setDateTo(r.to);
    }
  };

  const filteredOrders = useMemo(() => {
    let orders = [...(cache.orders || [])];
    if (statusFilter !== 'all') orders = orders.filter((o: any) => o.status === statusFilter);
    if (dateFrom) orders = orders.filter((o: any) => (o.created_at || '').slice(0, 10) >= dateFrom);
    if (dateTo) orders = orders.filter((o: any) => (o.created_at || '').slice(0, 10) <= dateTo);
    if (search) {
      const q = search.toLowerCase();
      orders = orders.filter((o: any) =>
        (o.customer_name || '').toLowerCase().includes(q) ||
        (o.code || '').toLowerCase().includes(q) ||
        (o.customer_phone || '').toLowerCase().includes(q) ||
        (o.order_items || []).some((i: any) => (i.name || '').toLowerCase().includes(q))
      );
    }
    orders.sort((a: any, b: any) => (b.created_at || '').localeCompare(a.created_at || ''));
    return orders;
  }, [cache.orders, statusFilter, dateFrom, dateTo, search]);

  const pendingCount = filteredOrders.filter((o: any) => o.status === 'pending').length;
  const paidCount = filteredOrders.filter((o: any) => o.status === 'paid').length;
  const cancelledCount = filteredOrders.filter((o: any) => o.status === 'cancelled').length;
  const totalRevenue = filteredOrders.filter((o: any) => o.status === 'paid').reduce((s: number, o: any) => s + (o.final_amount || 0), 0);

  const groupedByDate = useMemo(() => {
    const groups: Record<string, any[]> = {};
    filteredOrders.forEach((o: any) => {
      const d = (o.created_at || '').slice(0, 10);
      if (!d) return;
      if (!groups[d]) groups[d] = [];
      groups[d].push(o);
    });
    return Object.keys(groups).sort((a, b) => b.localeCompare(a)).map(d => ({
      date: d,
      orders: groups[d],
      paidTotal: groups[d].filter(o => o.status === 'paid').reduce((s, o) => s + (o.final_amount || 0), 0),
    }));
  }, [filteredOrders]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try { await fetchAll?.(); } finally { setRefreshing(false); }
  };

  const dateModeLabel = dateModes.find(m => m.k === dateMode)?.l || 'Tùy chọn';

  const formatGroupHeader = (d: string) => {
    const todayStr = toISO(new Date());
    const yd = new Date(); yd.setDate(yd.getDate() - 1);
    const yesStr = toISO(yd);
    if (d === todayStr) return t('Hôm nay');
    if (d === yesStr) return t('Hôm qua');
    return new Date(d + 'T00:00:00').toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const renderEmpty = () => {
    if (search) {
      return (
        <div className="card">
          <div className="empty">
            <div className="empty-ico">🔍</div>
            <div className="empty-ttl">{t('Không tìm thấy đơn nào')}</div>
            <div className="empty-sub">{t('Thử từ khoá khác hoặc xoá tìm kiếm')}</div>
            <button className="btn ghost sm" style={{ marginTop: 10 }} onClick={() => { setSearch(''); setShowSearch(false); }}>{t('Xoá tìm kiếm')}</button>
          </div>
        </div>
      );
    }
    if (dateFrom || dateTo) {
      return (
        <div className="card">
          <div className="empty">
            <div className="empty-ico">📭</div>
            <div className="empty-ttl">{t('Khoảng này chưa có đơn')}</div>
            <div className="empty-sub">{t('Thử mở rộng khoảng thời gian')}</div>
            <button className="btn ghost sm" style={{ marginTop: 10 }} onClick={() => applyDateMode('all')}>{t('Xem tất cả')}</button>
          </div>
        </div>
      );
    }
    return (
      <div className="card">
        <div className="empty">
          <div className="empty-ico">📄</div>
          <div className="empty-ttl">{t('Chưa có đơn nào')}</div>
          <div className="empty-sub">{t('Nhấn + để tạo đơn mới')}</div>
        </div>
      </div>
    );
  };

  return (
    <div className="screen active">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ width: 36, flexShrink: 0 }} />
        <h3 style={{ flex: 1, textAlign: 'center', margin: 0, fontSize: 16 }}>{t('Đơn hàng')}</h3>
        <button
          className="btn ghost sm"
          style={{ width: 36, height: 36, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          onClick={() => setShowSearch(s => !s)}
          aria-label={t('Tìm kiếm')}
          title={t('Tìm kiếm')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        </button>
      </div>

      {showSearch && (
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <svg style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink4)' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input
            className="fc"
            style={{ paddingLeft: 38 }}
            type="search"
            autoFocus
            placeholder={t('Mã bill, tên KH, dịch vụ...')}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <select
          className="fc"
          style={{ flex: 1, height: 38, padding: '0 10px', fontSize: 13, fontWeight: 600 }}
          value={dateMode}
          onChange={e => applyDateMode(e.target.value as DateMode)}
        >
          {dateModes.map(m => <option key={m.k} value={m.k}>{t(m.l)}</option>)}
        </select>
        <select
          className="fc"
          style={{ flex: 1, height: 38, padding: '0 10px', fontSize: 13, fontWeight: 600 }}
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          {statusOpts.map(s => <option key={s.k} value={s.k}>{t(s.l)}</option>)}
        </select>
      </div>

      {dateMode === 'custom' && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center' }}>
          <input className="fc" type="date" value={dateFrom} style={{ fontSize: 13, height: 36, flex: 1 }} onChange={e => setDateFrom(e.target.value)} />
          <span style={{ color: 'var(--ink4)', fontSize: 13 }}>—</span>
          <input className="fc" type="date" value={dateTo} style={{ fontSize: 13, height: 36, flex: 1 }} onChange={e => setDateTo(e.target.value)} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button
          className="card tap"
          onClick={() => setStatusFilter('pending')}
          style={{ flex: 1, padding: 12, textAlign: 'left', border: 'none', background: 'var(--blue-l, #EFF6FF)', cursor: 'pointer' }}
        >
          <div style={{ fontSize: 12, color: 'var(--blue, #2563EB)', fontWeight: 600 }}>{t('Chờ thanh toán')}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--blue, #2563EB)' }}>{pendingCount}</span>
            <span style={{ fontSize: 12, color: 'var(--blue, #2563EB)' }}>{t('Chi tiết')} ›</span>
          </div>
        </button>
        <div className="card" style={{ flex: 1, padding: 12, background: '#FFF7ED' }}>
          <div style={{ fontSize: 12, color: '#C2410C', fontWeight: 600 }}>{t('Doanh thu')}</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#C2410C', marginTop: 4 }}>{formatCurrency(totalRevenue)}</div>
        </div>
      </div>

      {dateMode === 'today' && filteredOrders.length > 0 && (
        <div className="card" style={{ padding: '10px 12px', marginBottom: 10, background: '#F0FDF4', border: '1px solid #BBF7D0' }}>
          <div style={{ fontSize: 11, color: '#15803D', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>{t('Tổng kết hôm nay')}</div>
          <div style={{ fontSize: 13, color: 'var(--ink1, #111)' }}>
            <strong>{filteredOrders.length}</strong> {t('đơn')} · <strong style={{ color: '#16A34A' }}>{paidCount}</strong> {t('đã thu')} · <strong style={{ color: '#2563EB' }}>{pendingCount}</strong> {t('chờ thu')}{cancelledCount > 0 ? <> · <strong style={{ color: 'var(--red, #DC2626)' }}>{cancelledCount}</strong> {t('huỷ')}</> : null}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, padding: '0 4px' }}>
        <span style={{ fontSize: 12, color: 'var(--ink4)' }}>
          {t(dateModeLabel)}{statusFilter !== 'all' ? ` • ${t(statusOpts.find(s => s.k === statusFilter)?.l || '')}` : ''}
        </span>
        <button
          className="btn ghost sm"
          style={{ fontSize: 12, padding: '4px 8px', height: 'auto' }}
          onClick={handleRefresh}
          disabled={refreshing}
        >
          {refreshing ? '⟳' : '↻'} {t('Làm mới')}
        </button>
      </div>

      {!filteredOrders.length ? renderEmpty() : groupedByDate.map(g => (
        <div key={g.date}>
          <div className="shd" style={{ marginTop: 12 }}>
            <h3 style={{ fontSize: 13, color: '#D97706' }}>{formatGroupHeader(g.date)}</h3>
            <span style={{ fontSize: 13, color: 'var(--ink1, #111)', fontWeight: 700 }}>{formatCurrency(g.paidTotal)}</span>
          </div>
          <div className="card">
            {g.orders.map(o => <OrderRow key={o.id} order={o} />)}
          </div>
        </div>
      ))}

    </div>
  );
};

const OrderRow = ({ order }: { order: any }) => {
  const isCancelled = order.status === 'cancelled';
  const time = (order.created_at || '').slice(11, 16);
  const svcs = (order.order_items || []).map((i: any) => i.name).join(', ');
  return (
    <div className="lrow tap" onClick={() => (window as any).openModal?.('orderDetailModal', order.id)} style={isCancelled ? { opacity: 0.7 } : undefined}>
      <Avatar name={order.customer_name} size={38} />
      <div className="lrow-info" style={{ minWidth: 0 }}>
        <div className="lrow-ttl" style={{ display: 'flex', alignItems: 'center', gap: 6, textDecoration: isCancelled ? 'line-through' : undefined }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{order.code || order.customer_name}</span>
        </div>
        <div className="lrow-sub" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {time}{order.table_no ? ` • Bàn: ${order.table_no}` : ''} • {order.customer_name || svcs || '—'}
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: isCancelled ? 'var(--ink4)' : 'var(--brand)' }}>{formatCurrency(order.final_amount || 0)}</div>
        <div style={{ marginTop: 3 }}><Badge status={order.status} /></div>
      </div>
    </div>
  );
};
