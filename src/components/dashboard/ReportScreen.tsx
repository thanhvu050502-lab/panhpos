import React, { useState, useMemo } from 'react';
import { useCache } from '../../hooks/useCache';
import { VND, todayStr } from '../../lib/utils';

interface ReportScreenProps {
  onBack?: () => void;
}

export const ReportScreen: React.FC<ReportScreenProps> = ({ onBack }) => {
  const { cache } = useCache();
  const [dateFilter, setDateFilter] = useState<'day' | 'yesterday' | 'week' | 'month' | 'year'>('month');

  const { fromDate, toDate } = useMemo(() => {
    const now = new Date();
    const ts = (d: Date) => d.toISOString().split('T')[0];
    const today = todayStr();
    if (dateFilter === 'day') return { fromDate: today, toDate: today };
    if (dateFilter === 'yesterday') {
      const d = new Date(now); d.setDate(d.getDate() - 1); const s = ts(d);
      return { fromDate: s, toDate: s };
    }
    if (dateFilter === 'week') {
      const d = new Date(now); d.setDate(d.getDate() - 7); return { fromDate: ts(d), toDate: today };
    }
    if (dateFilter === 'month') return { fromDate: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`, toDate: today };
    return { fromDate: `${now.getFullYear()}-01-01`, toDate: today };
  }, [dateFilter]);

  const allOrders = cache.orders || [];
  const paid = allOrders.filter((o: any) => {
    const d = (o.created_at || '').slice(0, 10);
    return d >= fromDate && d <= toDate && o.status === 'paid';
  });

  // Revenue by service type
  const byType = useMemo(() => {
    const map: Record<string, { count: number; rev: number }> = {};
    paid.forEach((o: any) => {
      (o.order_items || []).forEach((i: any) => {
        const cat = cache.catalog?.find((c: any) => c.id === i.catalog_id);
        const type = cat?.type || 'Khác';
        if (!map[type]) map[type] = { count: 0, rev: 0 };
        map[type].count += i.quantity || 1;
        map[type].rev += i.price * (i.quantity || 1);
      });
    });
    return Object.entries(map).sort((a, b) => b[1].rev - a[1].rev);
  }, [paid, cache.catalog]);

  // Revenue by staff
  const byStaff = useMemo(() => {
    const map: Record<string, { count: number; rev: number }> = {};
    paid.forEach((o: any) => {
      const staff = o.staff_name || 'Chưa phân công';
      if (!map[staff]) map[staff] = { count: 0, rev: 0 };
      map[staff].count += 1;
      map[staff].rev += o.final_amount || 0;
    });
    return Object.entries(map).sort((a, b) => b[1].rev - a[1].rev);
  }, [paid]);

  // Peak hours (order count by hour)
  const byHour = useMemo(() => {
    const arr = Array(24).fill(0);
    paid.forEach((o: any) => {
      const h = new Date(o.created_at || '').getHours();
      if (!isNaN(h)) arr[h]++;
    });
    return arr;
  }, [paid]);
  const maxHour = Math.max(...byHour, 1);

  // Monthly trend (last 12 months)
  const monthly = useMemo(() => {
    const now = new Date();
    const months: { label: string; rev: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const prefix = `${y}-${m}`;
      const rev = allOrders.filter((o: any) => (o.created_at || '').startsWith(prefix) && o.status === 'paid')
        .reduce((s: number, o: any) => s + (o.final_amount || 0), 0);
      months.push({ label: `T${d.getMonth() + 1}`, rev });
    }
    return months;
  }, [allOrders]);
  const maxMonth = Math.max(...monthly.map(m => m.rev), 1);

  const totalRev = paid.reduce((s: number, o: any) => s + (o.final_amount || 0), 0);

  const filterLabels: Record<string, string> = {
    day: 'Hôm nay', yesterday: 'Hôm qua', week: '7 ngày', month: 'Tháng này', year: 'Năm nay'
  };

  return (
    <div className="screen active">
      <div className="shd" style={{ marginBottom: '12px' }}>
        <button className="btn ghost sm" onClick={onBack} style={{ fontSize: '13px' }}>‹ Quay lại</button>
        <h3>Báo cáo chi tiết</h3>
      </div>

      <div style={{ marginBottom: '12px' }}>
        <select
          className="fc"
          style={{ height: '36px', padding: '0 12px', fontSize: '13px', width: '160px' }}
          value={dateFilter}
          onChange={e => setDateFilter(e.target.value as any)}
        >
          {Object.entries(filterLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {/* Summary */}
      <div className="mggrid" style={{ marginBottom: '14px' }}>
        <div className="metric"><div className="m-lbl">Doanh thu</div><div className="m-val" style={{ color: 'var(--brand)' }}>{totalRev >= 1e6 ? (totalRev / 1e6).toFixed(1) + 'tr' : VND(totalRev)}</div><div className="m-sub">{paid.length} đơn</div></div>
        <div className="metric"><div className="m-lbl">TB/đơn</div><div className="m-val" style={{ color: 'var(--green)' }}>{paid.length ? VND(Math.round(totalRev / paid.length)) : '—'}</div><div className="m-sub">{filterLabels[dateFilter]}</div></div>
      </div>

      {/* Revenue by service type */}
      <div className="shd" style={{ marginTop: 0 }}><h3>Theo loại dịch vụ</h3></div>
      <div className="card" style={{ marginBottom: '14px' }}>
        {byType.length === 0 ? (
          <div className="empty"><div className="empty-ttl">Chưa có dữ liệu</div></div>
        ) : byType.map(([type, data], i) => {
          const maxRev = byType[0][1].rev;
          return (
            <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', borderBottom: i < byType.length - 1 ? '1px solid var(--bdr)' : 'none' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 600 }}>{type}</div>
                <div style={{ marginTop: '4px', height: '4px', borderRadius: '2px', background: 'var(--bg3)' }}>
                  <div style={{ height: '100%', borderRadius: '2px', background: 'var(--brand)', width: `${Math.round(data.rev / maxRev * 100)}%` }} />
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--brand)' }}>{VND(data.rev)}</div>
                <div style={{ fontSize: '11px', color: 'var(--ink4)' }}>{data.count} lần</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Revenue by staff */}
      <div className="shd" style={{ marginTop: 0 }}><h3>Theo nhân viên</h3></div>
      <div className="card" style={{ marginBottom: '14px' }}>
        {byStaff.length === 0 ? (
          <div className="empty"><div className="empty-ttl">Chưa có dữ liệu</div></div>
        ) : byStaff.map(([staff, data], i) => {
          const maxRev = byStaff[0][1].rev;
          return (
            <div key={staff} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', borderBottom: i < byStaff.length - 1 ? '1px solid var(--bdr)' : 'none' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 600 }}>{staff}</div>
                <div style={{ marginTop: '4px', height: '4px', borderRadius: '2px', background: 'var(--bg3)' }}>
                  <div style={{ height: '100%', borderRadius: '2px', background: 'var(--blue)', width: `${Math.round(data.rev / maxRev * 100)}%` }} />
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--blue)' }}>{VND(data.rev)}</div>
                <div style={{ fontSize: '11px', color: 'var(--ink4)' }}>{data.count} đơn</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Peak hours */}
      <div className="shd" style={{ marginTop: 0 }}><h3>Giờ cao điểm</h3></div>
      <div className="card" style={{ marginBottom: '14px', padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '60px' }}>
          {byHour.map((count, h) => (
            <div key={h} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
              <div
                style={{ width: '100%', background: count > 0 ? 'var(--brand)' : 'var(--bg3)', borderRadius: '2px 2px 0 0', height: `${Math.max(2, Math.round(count / maxHour * 50))}px`, transition: 'height 0.2s' }}
                title={`${h}:00 - ${count} đơn`}
              />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
          <span style={{ fontSize: '10px', color: 'var(--ink4)' }}>0h</span>
          <span style={{ fontSize: '10px', color: 'var(--ink4)' }}>6h</span>
          <span style={{ fontSize: '10px', color: 'var(--ink4)' }}>12h</span>
          <span style={{ fontSize: '10px', color: 'var(--ink4)' }}>18h</span>
          <span style={{ fontSize: '10px', color: 'var(--ink4)' }}>23h</span>
        </div>
      </div>

      {/* Monthly trend */}
      <div className="shd" style={{ marginTop: 0 }}><h3>12 tháng gần nhất</h3></div>
      <div className="card" style={{ marginBottom: '14px', padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '70px' }}>
          {monthly.map((m, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
              <div
                style={{ width: '100%', background: i === monthly.length - 1 ? 'var(--brand)' : 'var(--bg3)', borderRadius: '3px 3px 0 0', height: `${Math.max(2, Math.round(m.rev / maxMonth * 56))}px` }}
                title={`${m.label}: ${VND(m.rev)}`}
              />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
          {monthly.filter((_, i) => i % 3 === 0 || i === monthly.length - 1).map((m, i) => (
            <span key={i} style={{ fontSize: '10px', color: 'var(--ink4)' }}>{m.label}</span>
          ))}
        </div>
      </div>
    </div>
  );
};
