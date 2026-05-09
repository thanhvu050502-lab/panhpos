import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useCache } from '../../hooks/useCache';

interface GlobalSearchProps {
  onClose: () => void;
}

export const GlobalSearch: React.FC<GlobalSearchProps> = ({ onClose }) => {
  const { cache } = useCache();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 80);
  }, []);

  const results = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return { customers: [], orders: [], appointments: [] };
    const customers = (cache.customers || [])
      .filter((c: any) => c.name?.toLowerCase().includes(q) || (c.phone || '').includes(q))
      .slice(0, 5);
    const orders = (cache.orders || [])
      .filter((o: any) => o.customer_name?.toLowerCase().includes(q) || (o.code || '').toLowerCase().includes(q))
      .slice(0, 5);
    const appointments = (cache.appointments || [])
      .filter((a: any) => a.customer_name?.toLowerCase().includes(q) || (a.services || []).some((s: string) => s.toLowerCase().includes(q)))
      .slice(0, 5);
    return { customers, orders, appointments };
  }, [query, cache.customers, cache.orders, cache.appointments]);

  const hasResults = results.customers.length || results.orders.length || results.appointments.length;

  const go = (modal: string, id: string) => {
    onClose();
    (window as any).openModal?.(modal, id);
  };

  const fmtDate = (s: string) => {
    if (!s) return '';
    const d = new Date(s);
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div
      className="moverlay open"
      onClick={(e) => { if ((e.target as HTMLElement).classList.contains('moverlay')) onClose(); }}
    >
      <div className="modal" style={{ maxHeight: '85dvh', display: 'flex', flexDirection: 'column' }}>
        <div className="mhandle" />
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--bdr)' }}>
          <div style={{ position: 'relative' }}>
            <svg style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--ink4)' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input
              ref={inputRef}
              className="fc"
              type="search"
              placeholder="Tìm khách, đơn hàng, lịch hẹn..."
              style={{ paddingLeft: '38px' }}
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="mbody" style={{ flex: 1, overflowY: 'auto' }}>
          {!query.trim() ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--ink4)', fontSize: '14px' }}>
              Nhập tên khách hàng, mã đơn...
            </div>
          ) : !hasResults ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--ink4)', fontSize: '14px' }}>
              Không tìm thấy kết quả nào
            </div>
          ) : (
            <>
              {results.customers.length > 0 && (
                <>
                  <div style={{ padding: '10px 16px 4px', fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Khách hàng</div>
                  <div className="card" style={{ marginBottom: '8px' }}>
                    {results.customers.map((c: any) => (
                      <div key={c.id} className="lrow tap" onClick={() => go('custProfileModal', c.id)}>
                        <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--brand-l)', color: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '14px', flexShrink: 0 }}>
                          {(c.name || '?')[0].toUpperCase()}
                        </div>
                        <div className="lrow-info">
                          <div className="lrow-ttl">{c.name}</div>
                          <div className="lrow-sub">{c.phone || 'Chưa có SĐT'}</div>
                        </div>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink4)" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {results.orders.length > 0 && (
                <>
                  <div style={{ padding: '10px 16px 4px', fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Đơn hàng</div>
                  <div className="card" style={{ marginBottom: '8px' }}>
                    {results.orders.map((o: any) => (
                      <div key={o.id} className="lrow tap" onClick={() => go('orderDetailModal', o.id)}>
                        <div className="lrow-info">
                          <div className="lrow-ttl">{o.customer_name} {o.code ? `· ${o.code}` : ''}</div>
                          <div className="lrow-sub">{fmtDate(o.created_at)} · {(o.final_amount || 0).toLocaleString('vi-VN')}đ</div>
                        </div>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink4)" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {results.appointments.length > 0 && (
                <>
                  <div style={{ padding: '10px 16px 4px', fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Lịch hẹn</div>
                  <div className="card" style={{ marginBottom: '8px' }}>
                    {results.appointments.map((a: any) => (
                      <div key={a.id} className="lrow tap" onClick={() => go('apptModal', a.id)}>
                        <div className="lrow-info">
                          <div className="lrow-ttl">{a.customer_name}</div>
                          <div className="lrow-sub">{fmtDate(a.scheduled_at || a.datetime)} · {(a.services || []).join(', ') || '—'}</div>
                        </div>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink4)" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <div className="mfoot">
          <button className="btn outline full" onClick={onClose}>Đóng</button>
        </div>
      </div>
    </div>
  );
};
