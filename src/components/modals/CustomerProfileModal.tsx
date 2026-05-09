import React, { useMemo } from 'react';
import { useCache } from '../../hooks/useCache';
import { formatCurrency, formatDateTime, fmtDate } from '../../lib/utils';

interface CustomerProfileModalProps {
  onClose: () => void;
  customerId?: string;
}

export const CustomerProfileModal: React.FC<CustomerProfileModalProps> = ({ onClose, customerId }) => {
  const { cache } = useCache();
  const customer = (cache.customers || []).find((c: any) => c.id === customerId);

  const customerOrders = useMemo(() => {
    if (!customer) return [];
    return (cache.orders || [])
      .filter((o: any) => o.customer_id === customer.id || o.customer_name === customer.name)
      .sort((a: any, b: any) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
      .slice(0, 12);
  }, [cache.orders, customer]);

  const stats = useMemo(() => {
    if (!customer) return { visits: 0, totalSpent: 0, lastVisit: null as string | null, topSvc: '—' };
    const paid = (cache.orders || [])
      .filter((o: any) => (o.customer_id === customer.id || o.customer_name === customer.name) && o.status === 'paid')
      .sort((a: any, b: any) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    const totalSpent = paid.reduce((s: number, o: any) => s + (o.final_amount || 0), 0);
    const lastVisit = paid[0]?.created_at || null;
    const svcMap: Record<string, number> = {};
    paid.forEach((o: any) => (o.order_items || []).forEach((i: any) => {
      svcMap[i.name] = (svcMap[i.name] || 0) + (i.quantity || 1);
    }));
    const topSvc = Object.entries(svcMap).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
    return { visits: paid.length, totalSpent, lastVisit, topSvc };
  }, [cache.orders, customer]);

  const customerAppointments = useMemo(() => {
    if (!customer) return [];
    return (cache.appointments || [])
      .filter((a: any) => a.customer_id === customer.id || a.customer_name === customer.name)
      .sort((a: any, b: any) => String(b.scheduled_at || b.datetime || '').localeCompare(String(a.scheduled_at || a.datetime || '')))
      .slice(0, 12);
  }, [cache.appointments, customer]);

  if (!customer) {
    return (
      <div className="moverlay open" onClick={(e) => { if ((e.target as HTMLElement).classList.contains('moverlay')) onClose(); }}>
        <div className="modal">
          <div className="mhandle"></div>
          <div className="mhdr">
            <div className="mttl">Hồ sơ khách hàng</div>
            <button className="mclose" onClick={onClose}>×</button>
          </div>
          <div className="mbody" style={{ padding: '20px', textAlign: 'center' }}>
            Không tìm thấy khách hàng.
          </div>
        </div>
      </div>
    );
  }

  const groupName = cache.groups?.find((g: any) => g.id === customer.group_id)?.name || 'Khách vãng lai';

  return (
    <div className="moverlay open" onClick={(e) => { if ((e.target as HTMLElement).classList.contains('moverlay')) onClose(); }}>
      <div className="modal" style={{ maxHeight: '90dvh', display: 'flex', flexDirection: 'column' }}>
        <div className="mhandle"></div>
        <div className="mhdr">
          <div className="mttl">Hồ sơ khách hàng</div>
          <button className="mclose" onClick={onClose}>×</button>
        </div>
        <div className="mbody" style={{ flex: 1, overflowY: 'auto' }}>
          <div className="card" style={{ marginBottom: '12px' }}>
            <div style={{ padding: '12px 14px' }}>
              <div style={{ fontSize: '16px', fontWeight: 700 }}>{customer.name}</div>
              <div style={{ fontSize: '13px', color: 'var(--ink3)', marginTop: '6px' }}>
                SĐT: {customer.phone || 'Chưa có'}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--ink3)', marginTop: '4px' }}>
                Nhóm: {groupName}
              </div>
              {customer.notes ? (
                <div style={{ fontSize: '13px', color: 'var(--ink3)', marginTop: '8px' }}>
                  Ghi chú: {customer.notes}
                </div>
              ) : null}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
            <div className="card" style={{ padding: '10px 12px' }}>
              <div style={{ fontSize: '11px', color: 'var(--ink4)', marginBottom: '2px' }}>Lượt ghé</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--brand)' }}>{stats.visits}</div>
            </div>
            <div className="card" style={{ padding: '10px 12px' }}>
              <div style={{ fontSize: '11px', color: 'var(--ink4)', marginBottom: '2px' }}>Tổng chi</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--brand)' }}>{stats.totalSpent >= 1e6 ? (stats.totalSpent / 1e6).toFixed(1) + 'tr' : formatCurrency(stats.totalSpent)}</div>
            </div>
            <div className="card" style={{ padding: '10px 12px' }}>
              <div style={{ fontSize: '11px', color: 'var(--ink4)', marginBottom: '2px' }}>Ghé gần nhất</div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink2)' }}>{stats.lastVisit ? fmtDate(stats.lastVisit) : '—'}</div>
            </div>
            <div className="card" style={{ padding: '10px 12px' }}>
              <div style={{ fontSize: '11px', color: 'var(--ink4)', marginBottom: '2px' }}>Hay dùng</div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{stats.topSvc}</div>
            </div>
          </div>

          <div className="shd" style={{ marginTop: 0 }}>
            <h3>Lịch sử đơn hàng</h3>
          </div>
          <div className="card" style={{ marginBottom: '12px' }}>
            {customerOrders.length === 0 ? (
              <div className="empty">
                <div className="empty-ttl">Chưa có đơn hàng</div>
              </div>
            ) : (
              customerOrders.map((o: any) => (
                <div
                  key={o.id}
                  className="lrow tap"
                  onClick={() => {
                    onClose();
                    window.openModal?.('orderDetailModal', o.id);
                  }}
                >
                  <div className="lrow-info">
                    <div className="lrow-ttl">{o.code || o.id}</div>
                    <div className="lrow-sub">{formatDateTime(o.created_at)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--brand)' }}>{formatCurrency(o.final_amount || 0)}</div>
                    <div style={{ fontSize: '11px', color: 'var(--ink4)' }}>{o.status || ''}</div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="shd" style={{ marginTop: 0 }}>
            <h3>Lịch sử lịch hẹn</h3>
          </div>
          <div className="card">
            {customerAppointments.length === 0 ? (
              <div className="empty">
                <div className="empty-ttl">Chưa có lịch hẹn</div>
              </div>
            ) : (
              customerAppointments.map((a: any) => (
                <div key={a.id} className="lrow tap" onClick={() => { onClose(); window.openModal?.('apptModal', a.id); }}>
                  <div className="lrow-info">
                    <div className="lrow-ttl">{(a.services || []).join(', ') || 'Dịch vụ'}</div>
                    <div className="lrow-sub">{formatDateTime(a.scheduled_at || a.datetime)}</div>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--ink4)' }}>{a.status || ''}</div>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="mfoot">
          <button className="btn outline" style={{ flex: 1 }} onClick={onClose}>Đóng</button>
          <button
            className="btn brand"
            style={{ flex: 1 }}
            onClick={() => {
              onClose();
              window.openModal?.('custModal', customer.id);
            }}
          >
            Sửa khách hàng
          </button>
        </div>
      </div>
    </div>
  );
};
