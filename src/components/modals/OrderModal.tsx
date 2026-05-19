import React, { useState, useEffect, useMemo } from 'react';
import { useCache } from '../../hooks/useCache';
import { useLang } from '../../contexts/LangContext';
import { useAuth } from '../../hooks/useAuth';
import { toast } from '../ui/Toast';
import { uid, nextOrderCode, parseMoney } from '../../lib/utils';
import { getSupabase } from '../../lib/supabaseClient';
import { logAudit } from '../../hooks/useAuditLog';
import type { OrderState } from '../../types/order';

interface OrderModalProps {
  onClose: () => void;
  apptId?: string;
  open?: boolean;
}

export const OrderModal: React.FC<OrderModalProps> = ({ onClose, apptId, open = true }) => {
  const { cache, createOrderAtomic } = useCache();
  const { t } = useLang();
  const { getMembers, session } = useAuth();
  const members = getMembers();
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustDrop, setShowCustDrop] = useState(false);
  const [selectedCust, setSelectedCust] = useState<any>(null);
  const [staffName, setStaffName] = useState('');

  const [groupQty, setGroupQty] = useState(1);
  const [cart, setCart] = useState<any[]>([]);
  const [promoId, setPromoId] = useState('');
  const [notes, setNotes] = useState('');
  
  const [customSvcName, setCustomSvcName] = useState('');
  const [customSvcPrice, setCustomSvcPrice] = useState('');

  const [catFilter, setCatFilter] = useState('');
  const [savingPending, setSavingPending] = useState(false);
  const [removing, setRemoving] = useState<Set<any>>(new Set());
  const removeTimers = React.useRef<Map<any, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => () => {
    removeTimers.current.forEach(clearTimeout);
    removeTimers.current.clear();
  }, []);

  // Extracted computed variables
  const groupOrderEnabled = cache.settings?.group_order_enabled || false;
  const qty = (groupOrderEnabled && groupQty > 1) ? groupQty : 1;
  const subtotal = cart.reduce((s, i) => s + i.price * i.quantity * qty, 0);
  
  const discount = useMemo(() => {
    if (!promoId) return 0;
    const p = cache.promotions?.find((x: any) => x.id === promoId);
    if (!p) return 0;
    const baseSubtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
    if (p.type === 'percent') return Math.round(baseSubtotal * p.value / 100);
    if (p.type === 'amount') return p.value;
    return 0;
  }, [promoId, cart, cache.promotions]);
  
  const total = Math.max(0, subtotal - discount);

  // Initialize from appt
  useEffect(() => {
    if (apptId) {
      const appt = cache.appointments?.find((a: any) => a.id === apptId);
      if (appt) {
        if (appt.customer_id) {
          const cust = cache.customers?.find((c: any) => c.id === appt.customer_id);
          setSelectedCust(cust || { name: appt.customer_name, isWalkin: true });
        } else {
          setSelectedCust({ name: appt.customer_name, isWalkin: true });
        }

        const newCart: any[] = [];
        (appt.services || []).forEach((sname: string) => {
          const c = cache.catalog?.find((x: any) => x.name === sname);
          if (c) newCart.push({ catalog_id: c.id, name: c.name, price: c.price, quantity: 1 });
          else newCart.push({ catalog_id: null, name: sname, price: 0, quantity: 1 });
        });
        setCart(newCart);
      }
    }
  }, [apptId, cache.appointments, cache.customers, cache.catalog]);

  // Initialize from re-order (copy from old order)
  useEffect(() => {
    const reorderId = (window as any)._reorderFromOrderId;
    if (!reorderId || apptId) return;
    const old = cache.orders?.find((o: any) => o.id === reorderId);
    if (old) {
      if (old.customer_id) {
        const cust = cache.customers?.find((c: any) => c.id === old.customer_id);
        setSelectedCust(cust || { name: old.customer_name, isWalkin: true });
      } else {
        setSelectedCust({ name: old.customer_name, isWalkin: true });
      }
      const newCart = (old.order_items || []).map((i: any) => ({
        catalog_id: i.catalog_id || null,
        name: i.name,
        price: i.price,
        quantity: i.quantity || 1,
      }));
      setCart(newCart);
      toast('Đã sao chép đơn cũ — kiểm tra lại trước khi lưu', 'success');
    }
    (window as any)._reorderFromOrderId = undefined;
  }, [apptId, cache.orders, cache.customers]);

  const handleSearchCust = (q: string) => {
    setCustomerSearch(q);
    setShowCustDrop(q.length > 0);
  };

  const filteredCusts = useMemo(() => {
    if (!customerSearch) return [];
    const q = customerSearch.toLowerCase();
    return (cache.customers || []).filter((c: any) => 
      c.name.toLowerCase().includes(q) || (c.phone || '').includes(q)
    ).slice(0, 8);
  }, [customerSearch, cache.customers]);

  const hasExactMatch = filteredCusts.some(c => c.name.toLowerCase() === customerSearch.toLowerCase());

  const addCustomItem = () => {
    if (!customSvcName) {
      toast('Nhập tên dịch vụ', 'error');
      return;
    }
    const price = parseMoney(customSvcPrice);
    if (price === null) {
      toast('Giá không hợp lệ (0 – 100.000.000đ)', 'error');
      return;
    }
    const newCart = cart.filter(i => i.catalog_id !== '__khac__');
    newCart.push({ catalog_id: '__custom__', name: customSvcName, price, quantity: 1 });
    setCart(newCart);
    setCustomSvcName('');
    setCustomSvcPrice('');
  };

  const proceedToPay = () => {
    if (!selectedCust) {
      toast('Vui lòng chọn khách hàng', 'error');
      return;
    }
    if (!cart.length) {
      toast('Vui lòng chọn ít nhất 1 dịch vụ', 'error');
      return;
    }
    
    // Save state to window and open Payment Modal
    const next: OrderState = {
      customer: selectedCust,
      cart,
      promoId,
      discount,
      apptId: apptId ?? null,
      qty: groupQty,
      notes,
      total,
      subtotal,
      staffName,
    };
    window._orderState = next;
    onClose();
    (window as any).openModal('payModal');
  };

  const saveOrderPending = async () => {
    if (savingPending) return;
    if (!selectedCust) { toast('Vui lòng chọn khách hàng', 'error'); return; }
    if (!cart.length) { toast('Vui lòng chọn ít nhất 1 dịch vụ', 'error'); return; }
    setSavingPending(true);

    const isDemo = localStorage.getItem('np_demo') === '1';
    const s = cache.settings;
    const orderId = uid();
    const code = await nextOrderCode(
      s?.order_prefix || 'ORD',
      s?.order_length || 4,
      (cache.orders || []).map((o: any) => o.code || ''),
      isDemo ? null : getSupabase()
    );
    const custId = selectedCust && !selectedCust.isWalkin ? selectedCust.id : null;
    const now = new Date().toISOString();
    // created_at must be set explicitly — see PaymentModal for the full
    // explanation. RPC bypasses column defaults via jsonb_populate_recordset.
    const items = cart.map(item => ({ id: uid(), order_id: orderId, catalog_id: item.catalog_id || null, name: item.name, price: item.price, quantity: item.quantity * qty, created_at: now }));

    const orderData: any = {
      id: orderId, code,
      customer_id: custId,
      customer_name: selectedCust?.name || 'Khách vãng lai',
      appointment_id: apptId || null,
      total_amount: subtotal,
      discount,
      final_amount: total,
      promotion_id: promoId || null,
      status: 'pending',
      notes,
      staff_name: staffName || null,
      created_at: new Date().toISOString(),
    };

    try {
      // Atomic: order + items in one transaction (no payments yet — pending order).
      await createOrderAtomic(orderData, items, [], isDemo);
      logAudit('order_created', 'order', `Tạo đơn ${code} - ${selectedCust?.name || 'Khách vãng lai'} - ${total.toLocaleString('vi-VN')}đ`, orderId, session?.displayName || session?.username);
      toast('Đã lưu đơn chờ', 'success');
      onClose();
    } catch (e: any) {
      toast('Lỗi: ' + (e.message || 'Không thể lưu đơn'), 'error');
    } finally {
      setSavingPending(false);
    }
  };

  // Catalog filtering
  const catTypes = ['', ...new Set((cache.catalog || []).map((c: any) => c.type || ''))];
  const displayCatalog = (cache.catalog || []).filter((c: any) => !catFilter || c.type === catFilter);
  const hasKhac = displayCatalog.some((c: any) => c.name === 'Khác');
  const items = hasKhac ? displayCatalog : [...displayCatalog, { id: '__khac__', name: 'Khác', price: 0, type: '', unit: '' }];

  const toggleCatItem = (catId: string) => {
    const isKhac = catId === '__khac__';
    const c = isKhac ? { id: '__khac__', name: 'Khác', price: 0, quantity: 1 } : cache.catalog?.find((x: any) => x.id === catId);
    if (!c) return;

    const idx = cart.findIndex(i => i.catalog_id === catId);
    if (idx >= 0) {
      setCart(cart.filter((_, i) => i !== idx));
    } else {
      setCart([...cart, { catalog_id: c.id, name: c.name, price: c.variable_price ? 0 : (c.price || 0), quantity: 1, variable_price: !!c.variable_price, is_combo: c.type === 'combo', combo_items: c.combo_items || [] }]);
    }
  };

  const khacInCart = cart.some(i => i.catalog_id === '__khac__');

  return (
    <div className={`moverlay${open ? ' open' : ''}`} onClick={(e) => { if ((e.target as any).classList.contains('moverlay')) onClose(); }}>
      <div className="modal" style={{ maxHeight: '90dvh', display: 'flex', flexDirection: 'column' }}>
        <div className="mhandle"></div>
        <div className="mhdr">
          <div className="mttl">{apptId ? t('Đặt lịch hẹn') : t('Đơn hàng mới')}</div>
          <button className="mclose" onClick={onClose}>×</button>
        </div>
        
        <div className="mbody" style={{ flex: 1, overflowY: 'auto' }}>
          <div className="fg">
            <label className="flbl">Khách hàng <span className="req">*</span></label>
            {!selectedCust ? (
              <div className="ac-wrap">
                <input 
                  className="fc" 
                  type="text" 
                  placeholder="Tên, SĐT, hoặc walk-in..." 
                  value={customerSearch}
                  onChange={(e) => handleSearchCust(e.target.value)}
                  onFocus={() => setShowCustDrop(customerSearch.length > 0)}
                />
                {showCustDrop && (
                  <div className="ac-drop open">
                    <div className="ac-item ac-walkin" onClick={() => { setSelectedCust({ name: customerSearch, isWalkin: true }); setShowCustDrop(false); }}>
                      🚶 Walk-in: "{customerSearch}"
                    </div>
                    {filteredCusts.map((c: any) => (
                      <div key={c.id} className="ac-item" onClick={() => { setSelectedCust(c); setShowCustDrop(false); }}>
                        <div style={{ fontSize: '14px', fontWeight: 600 }}>{c.name}</div>
                        <div style={{ fontSize: '12px', color: 'var(--ink4)' }}>{c.phone || ''}</div>
                      </div>
                    ))}
                    {!hasExactMatch && (
                      <div className="ac-item ac-add" onClick={() => { /* open quick add cust */ }}>
                        ➕ Thêm: "{customerSearch}"
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="ac-sel" style={{ display: 'flex' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '14px', fontWeight: 600 }}>{selectedCust.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--brand)' }}>{selectedCust.isWalkin ? 'Walk-in' : selectedCust.phone || ''}</div>
                </div>
                <button style={{ fontSize: '18px', color: 'var(--ink4)', background: 'none', border: 'none' }} onClick={() => setSelectedCust(null)}>×</button>
              </div>
            )}
          </div>

          {members.length > 0 && (
            <div className="fg">
              <label className="flbl">Nhân viên phụ trách</label>
              <select className="fc" value={staffName} onChange={e => setStaffName(e.target.value)}>
                <option value="">— Chọn nhân viên —</option>
                {members.map((m: any) => (
                  <option key={m.id} value={m.displayName || m.name}>{m.displayName || m.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="fg" style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--bg3)', borderRadius: '10px', padding: '10px 14px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink2)' }}>{t('Số lượng khách')}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginLeft: 'auto' }}>
              <button onClick={() => setGroupQty(Math.max(1, groupQty - 1))} style={{ width: '30px', height: '30px', borderRadius: '8px', background: 'var(--bg)', border: '1.5px solid var(--bdr2)', fontSize: '18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
              <span style={{ fontSize: '18px', fontWeight: 700, minWidth: '20px', textAlign: 'center' }}>{groupQty}</span>
              <button onClick={() => setGroupQty(groupQty + 1)} style={{ width: '30px', height: '30px', borderRadius: '8px', background: 'var(--bg)', border: '1.5px solid var(--bdr2)', fontSize: '18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
            </div>
          </div>
          
          {groupOrderEnabled && (
            <div style={{ fontSize: '12px', color: 'var(--brand)', background: 'var(--brand-l)', borderRadius: '8px', padding: '7px 12px', marginBottom: '10px', marginTop: '6px' }}>
              🔥 Group Order đang bật: mỗi dịch vụ × {groupQty} khách
            </div>
          )}

          <div className="fg" style={{ marginTop: '10px' }}>
            <label className="flbl">Dịch vụ / Sản phẩm</label>
            <div className="chips" style={{ marginBottom: '10px' }}>
              {catTypes.map((t: string, i: number) => (
                <div key={i} className={`chip${t === catFilter ? ' on' : ''}`} onClick={() => setCatFilter(t)}>
                  {t === '' ? 'Tất cả' : t}
                </div>
              ))}
            </div>
            
            <div className="cat-grid">
              {items.map((c: any) => {
                const inCart = cart.some(i => i.catalog_id === c.id);
                const isKhac = c.id === '__khac__';
                return (
                  <button key={c.id} className={`cat-card${inCart ? ' on' : ''}`} onClick={() => toggleCatItem(c.id)}>
                    <div className="cat-check">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '3px' }}>{c.name}</div>
                    {isKhac ? (
                      <div style={{ fontSize: '11px', color: 'var(--ink4)' }}>Tự điền tên + giá</div>
                    ) : c.type === 'combo' ? (
                      <>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--green)' }}>📦 {(c.price || 0).toLocaleString('vi-VN')}đ</div>
                        <div style={{ fontSize: '10px', color: 'var(--ink4)', marginTop: '2px' }}>{(c.combo_items || []).slice(0, 2).join(', ')}{(c.combo_items || []).length > 2 ? '...' : ''}</div>
                      </>
                    ) : c.variable_price ? (
                      <>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--amber, #F59E0B)' }}>Thời giá</div>
                        <div style={{ fontSize: '10px', color: 'var(--ink4)', marginTop: '2px' }}>{c.type || ''}</div>
                      </>
                    ) : (
                      <>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--brand)' }}>{(c.price || 0).toLocaleString('vi-VN')}đ</div>
                        <div style={{ fontSize: '10px', color: 'var(--ink4)', marginTop: '2px' }}>{c.type || ''} {c.unit ? '· ' + c.unit : ''}</div>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {cart.length > 0 && (
            <div style={{ marginBottom: '12px' }}>
              <label className="flbl" style={{ marginBottom: '6px' }}>Giỏ hàng</label>
              <div className="card">
                {cart.map((item, i) => (
                  <div key={i} className={`cart-item${removing.has(item) ? ' removing' : ''}`} style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid var(--bdr2)' }}>
                    <div style={{ flex: 1, fontSize: '14px', fontWeight: 500 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {item.is_combo && <span style={{ fontSize: '11px' }}>📦</span>}
                        {item.name}
                        {groupOrderEnabled && qty > 1 && <span style={{ fontSize: '11px', color: 'var(--brand)', marginLeft: '4px' }}>×{qty}</span>}
                      </div>
                      {item.is_combo && item.combo_items?.length > 0 && (
                        <div style={{ fontSize: '11px', color: 'var(--ink4)', marginTop: '1px' }}>{item.combo_items.join(', ')}</div>
                      )}
                    </div>
                    <input
                      type="number"
                      style={{ width: '90px', padding: '6px', border: `1.5px solid ${item.variable_price && item.price === 0 ? 'var(--amber, #F59E0B)' : 'var(--bdr)'}`, borderRadius: '6px', textAlign: 'right' }}
                      placeholder={item.variable_price ? 'Nhập giá' : '0'}
                      value={item.price || ''}
                      onChange={(e) => {
                        const p = parseMoney(e.target.value);
                        if (p === null) return; // ignore invalid (over cap or negative)
                        const newCart = [...cart];
                        newCart[i].price = p;
                        setCart(newCart);
                      }}
                    />
                    <button style={{ marginLeft: '10px', width: '28px', height: '28px', borderRadius: '50%', background: 'var(--red-bg)', color: 'var(--red)', border: 'none' }} onClick={() => {
                      if (removing.has(item)) return;
                      setRemoving(prev => { const next = new Set(prev); next.add(item); return next; });
                      const tid = setTimeout(() => {
                        setCart(prev => prev.filter(x => x !== item));
                        setRemoving(prev => { const next = new Set(prev); next.delete(item); return next; });
                        removeTimers.current.delete(item);
                      }, 220);
                      removeTimers.current.set(item, tid);
                    }}>×</button>
                  </div>
                ))}
              </div>
              
              {khacInCart && (
                <div style={{ marginTop: '8px' }}>
                  <div className="card">
                    <div style={{ padding: '10px 14px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink3)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '.03em' }}>Dịch vụ Khác — tự điền</div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input type="text" placeholder="Tên dịch vụ..." style={{ flex: 2, padding: '8px 10px', border: '1.5px solid var(--bdr)', borderRadius: '8px', fontSize: '13px', outline: 'none' }} value={customSvcName} onChange={(e) => setCustomSvcName(e.target.value)} />
                        <input type="number" placeholder="Giá (đ)" style={{ width: '90px', padding: '8px 10px', border: '1.5px solid var(--bdr)', borderRadius: '8px', fontSize: '13px', outline: 'none' }} value={customSvcPrice} onChange={(e) => setCustomSvcPrice(e.target.value)} />
                        <button style={{ background: 'var(--brand)', color: 'white', border: 'none', borderRadius: '8px', width: '36px', height: '36px', fontSize: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={addCustomItem}>+</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="fg">
            <label className="flbl">Khuyến mãi</label>
            {promoId && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', background: 'var(--green-bg)', borderRadius: 'var(--r-sm)', fontSize: '13px', color: 'var(--green)', marginBottom: '8px' }}>
                🏷️ {cache.promotions?.find((p: any) => p.id === promoId)?.name} — giảm {discount.toLocaleString('vi-VN')}đ
                <button style={{ marginLeft: 'auto', color: 'var(--red)', fontSize: '16px', fontWeight: 700, background: 'none', border: 'none' }} onClick={() => setPromoId('')}>×</button>
              </div>
            )}
            <select className="fc" value={promoId} onChange={(e) => setPromoId(e.target.value)}>
              <option value="">Không áp dụng</option>
              {(cache.promotions || []).map((p: any) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="fg">
            <label className="flbl">Ghi chú</label>
            <textarea className="fc" placeholder="Ghi chú thêm..." rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}></textarea>
          </div>

          {cart.length > 0 && (
            <div className="osumm" style={{ display: 'block' }}>
              <div className="orow"><span style={{ fontSize: '13px', color: 'var(--ink3)' }}>Tạm tính</span><span style={{ fontSize: '13px', fontWeight: 600 }}>{subtotal.toLocaleString('vi-VN')}đ</span></div>
              {discount > 0 && (
                <div className="orow"><span style={{ fontSize: '13px', color: 'var(--ink3)' }}>Giảm giá</span><span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--green)' }}>-{discount.toLocaleString('vi-VN')}đ</span></div>
              )}
              <div className="orow grand-row"><span className="grand-lbl">Tổng cộng</span><span className="grand-val">{total.toLocaleString('vi-VN')}đ</span></div>
            </div>
          )}
        </div>

        <div className="mfoot" style={{ flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
            <button className="btn outline" style={{ flex: 1 }} onClick={onClose}>{t('Đóng')}</button>
            <button className="btn success" style={{ flex: 1 }} onClick={saveOrderPending} disabled={savingPending} aria-busy={savingPending}>{savingPending ? '...' : `💾 ${t('Lưu đơn chờ')}`}</button>
            <button className="btn brand" style={{ flex: 2 }} onClick={proceedToPay}>{t('Thanh toán →')}</button>
          </div>
        </div>
      </div>
    </div>
  );
};
