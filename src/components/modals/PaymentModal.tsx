import React, { useState, useEffect, useRef } from 'react';
import { useCache } from '../../hooks/useCache';
import { useLang } from '../../contexts/LangContext';
import { uid, nextOrderCode, parseMoney } from '../../lib/utils';
import { getSupabase } from '../../lib/supabaseClient';
import { toast } from '../ui/Toast';
import { logAudit } from '../../hooks/useAuditLog';

/**
 * Stable IDs across retries.
 *
 * If confirmPayment fails (e.g. network blip) and the cashier taps Confirm
 * again, we MUST reuse the same order/item/payment IDs. Otherwise:
 *   - The first attempt may have actually persisted server-side, and a
 *     fresh-id retry creates a parallel order ⇒ double-charge in the books.
 *   - The server-side idempotency check in create_order_full keys on
 *     order.id, so retries with the same id no-op safely.
 *   - For existing-order payment inserts we additionally use upsert with
 *     ignoreDuplicates so a replayed payment row doesn't dup-key.
 *
 * The ref is cleared on success or when the payment shape changes (split
 * toggled, split rows added/removed) — those are genuinely new transactions.
 */
interface TxnIds {
  orderId: string;
  code: string | null;
  itemIds: string[];
  paymentIds: string[];
  paymentShape: string;
}

interface PaymentModalProps {
  onClose: () => void;
  onSuccess: () => void;
  orderState: any;
}

const PM_ICONS: Record<string, string> = { cash: '💵', bank: '🏦', momo: '📱', zalopay: '🔵', custom: '💳' };

export const PaymentModal: React.FC<PaymentModalProps> = ({ onClose, onSuccess, orderState }) => {
  const { cache, dbInsert, dbUpdate, fetchAll, createOrderAtomic } = useCache();
  const { t } = useLang();
  const [selectedMethodId, setSelectedMethodId] = useState('');
  const [isSplit, setIsSplit] = useState(false);
  const [splits, setSplits] = useState<any[]>([]);
  const [payAmt, setPayAmt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const txnRef = useRef<TxnIds | null>(null);

  const methods = cache.payMethods || [];
  const finalAmount = orderState.total || 0;

  // Select first method on load
  useEffect(() => {
    if (methods.length > 0 && !selectedMethodId) {
      setSelectedMethodId(methods[0].id);
    }
  }, [methods, selectedMethodId]);

  const selectedMethod = methods.find((m: any) => m.id === selectedMethodId);
  const isCash = selectedMethod?.type === 'cash';

  // Auto-fill cash amount when switching to a cash method
  useEffect(() => {
    if (isCash) {
      setPayAmt(String(finalAmount));
    } else {
      setPayAmt('');
    }
  }, [selectedMethodId, isCash, finalAmount]);

  const toggleSplit = (checked: boolean) => {
    setIsSplit(checked);
    if (checked && splits.length === 0) {
      setSplits([{ method_id: methods[0]?.id || '', amount: 0 }]);
    }
  };

  const addSplitItem = () => setSplits([...splits, { method_id: methods[0]?.id || '', amount: 0 }]);

  const updateSplit = (index: number, field: string, value: any) => {
    const s = [...splits];
    s[index][field] = value;
    setSplits(s);
  };

  const removeSplit = (index: number) => setSplits(splits.filter((_, i) => i !== index));

  const splitSum = splits.reduce((s, i) => s + (parseMoney(i.amount) ?? 0), 0);
  const splitRem = Math.max(0, finalAmount - splitSum);

  const got = parseMoney(payAmt) ?? 0;
  const change = got - finalAmount;

  const confirmPayment = async () => {
    if (isLoading) return;
    let paymentRows: any[] = [];
    if (isSplit) {
      if (splitSum < finalAmount) { toast('Tổng tiền chưa đủ', 'error'); return; }
      paymentRows = splits.filter(s => (parseMoney(s.amount) ?? 0) > 0).map(s => ({
        payment_method_id: s.method_id,
        payment_method_name: methods.find((m: any) => m.id === s.method_id)?.name || '',
        amount: parseMoney(s.amount) ?? 0,
      }));
    } else {
      if (!selectedMethodId && methods.length > 0) { toast('Vui lòng chọn phương thức thanh toán', 'error'); return; }
      if (isCash && got < finalAmount) { toast('Số tiền khách đưa chưa đủ', 'error'); return; }
      paymentRows = [{ payment_method_id: selectedMethodId, payment_method_name: selectedMethod?.name || '', amount: finalAmount }];
    }

    // Reuse stable IDs across retries; reset only when the payment plan changes.
    const shape = `${isSplit ? 'split' : 'single'}|${paymentRows.length}`;
    if (!txnRef.current || txnRef.current.paymentShape !== shape) {
      txnRef.current = {
        orderId: uid(),
        code: null,
        itemIds: (orderState.cart || []).map(() => uid()),
        paymentIds: paymentRows.map(() => uid()),
        paymentShape: shape,
      };
    }
    const txn = txnRef.current;

    setIsLoading(true);
    try {
      const isDemo = localStorage.getItem('np_demo') === '1';
      const s = cache.settings;

      // If paying a previously-saved pending order, update it instead of inserting
      if (orderState.existingOrderId) {
        const payments = paymentRows.map((p, i) => ({
          id: txn.paymentIds[i],
          order_id: orderState.existingOrderId,
          ...p,
        }));
        if (isDemo) {
          await dbUpdate('orders', orderState.existingOrderId, { status: 'paid', payments }, true);
        } else {
          const sb = getSupabase();
          await dbUpdate('orders', orderState.existingOrderId, { status: 'paid' }, false);
          if (sb) {
            // Upsert with ignoreDuplicates makes a retry after partial success a no-op
            // instead of a primary-key conflict — so cashier double-tap can't double-charge.
            const { error } = await sb
              .from('order_payments')
              .upsert(payments, { onConflict: 'id', ignoreDuplicates: true });
            if (error) throw error;
          } else {
            for (const pay of payments) await dbInsert('order_payments', pay, false);
          }
          await fetchAll(false);
        }
        toast('Đã thanh toán thành công', 'success');
        txnRef.current = null;
        onSuccess();
        return;
      }

      // New order. Allocate code lazily once and cache it: same-id retries
      // are safe (RPC is idempotent on order.id), but allocating a fresh
      // code on each retry would burn through the order_seq.
      if (!txn.code) {
        txn.code = await nextOrderCode(
          s?.order_prefix || 'ORD',
          s?.order_length || 4,
          (cache.orders || []).map((o: any) => o.code || ''),
          isDemo ? null : getSupabase()
        );
      }
      const custId = orderState.customer && !orderState.customer.isWalkin ? orderState.customer.id : null;
      const items = (orderState.cart || []).map((item: any, i: number) => ({
        id: txn.itemIds[i] ?? uid(),
        order_id: txn.orderId, catalog_id: item.catalog_id || null,
        name: item.name, price: item.price, quantity: item.quantity * (orderState.qty || 1),
      }));
      const payments = paymentRows.map((p, i) => ({
        id: txn.paymentIds[i],
        order_id: txn.orderId,
        ...p,
      }));

      const orderData: any = {
        id: txn.orderId, code: txn.code,
        customer_id: custId,
        customer_name: orderState.customer?.name || 'Khách vãng lai',
        appointment_id: orderState.apptId || null,
        total_amount: orderState.subtotal,
        discount: orderState.discount,
        final_amount: finalAmount,
        promotion_id: orderState.promoId || null,
        status: 'paid',
        notes: orderState.notes || '',
        staff_name: orderState.staffName || null,
        created_at: new Date().toISOString(),
      };

      // Atomic create: RPC writes order + items + payments in a single
      // transaction, so a partial failure can never leave an orphan order.
      await createOrderAtomic(orderData, items, payments, isDemo);
      if (orderState.apptId) {
        await dbUpdate('appointments', orderState.apptId, { status: 'completed' }, isDemo);
      }

      logAudit('order_paid', 'order', `Thanh toán đơn ${txn.code} - ${orderState.customer?.name || 'Khách vãng lai'} - ${finalAmount.toLocaleString('vi-VN')}đ`, txn.orderId);
      txnRef.current = null;
      onSuccess();
    } catch (e: any) {
      toast('Lỗi: ' + (e.message || 'Không thể xử lý thanh toán'), 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="moverlay open" onClick={(e) => { if ((e.target as any).classList.contains('moverlay')) onClose(); }}>
      <div className="modal" style={{ maxHeight: '90dvh', display: 'flex', flexDirection: 'column' }}>
        <div className="mhandle"></div>
        <div className="mhdr">
          <div className="mttl">Thanh toán</div>
          <button className="mclose" onClick={onClose}>×</button>
        </div>
        <div className="mbody" style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '16px' }}>
            <div style={{ fontSize: '13px', color: 'var(--ink3)', marginBottom: '4px' }}>{t('Thanh toán')}</div>
            <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--brand)' }}>{finalAmount.toLocaleString('vi-VN')}đ</div>
          </div>

          <label className="flbl">{t('Phương thức thanh toán')}</label>
          {methods.length === 0 ? (
            <div style={{ fontSize: '13px', color: 'var(--ink4)', marginBottom: '12px' }}>{t('Chưa có phương thức. Thêm trong Cài đặt.')}</div>
          ) : (
            <div className="pm-grid">
              {methods.map((m: any) => (
                <div key={m.id} className={`pm-btn${m.id === selectedMethodId ? ' on' : ''}`} onClick={() => setSelectedMethodId(m.id)}>
                  <div className="pm-ico">{PM_ICONS[m.type] || '💳'}</div>
                  <div className="pm-lbl">{m.name}</div>
                </div>
              ))}
            </div>
          )}

          {selectedMethod && (
            <div style={{ marginBottom: '12px' }}>
              {selectedMethod.qr_image ? (
                <div style={{ textAlign: 'center' }}>
                  <img src={selectedMethod.qr_image} style={{ width: '140px', height: '140px', objectFit: 'contain', borderRadius: 'var(--r)', border: '1px solid var(--bdr)' }} alt="QR" />
                  <div style={{ fontSize: '13px', marginTop: '6px', color: 'var(--ink3)' }}>{selectedMethod.account_name || selectedMethod.name}</div>
                </div>
              ) : selectedMethod.type === 'bank' && selectedMethod.account_no ? (
                <div style={{ background: 'var(--bg3)', borderRadius: 'var(--r)', padding: '10px 14px', fontSize: '13px' }}>
                  <strong>{selectedMethod.bank_name}</strong><br />
                  <strong>{selectedMethod.account_no}</strong><br />
                  {selectedMethod.account_name}
                </div>
              ) : null}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
            <label className="tgl">
              <input type="checkbox" checked={isSplit} onChange={(e) => toggleSplit(e.target.checked)} />
              <div className="tgl-sl"></div>
            </label>
            <span style={{ fontSize: '13px', fontWeight: 500 }}>{t('Thanh toán chia nhỏ')}</span>
          </div>

          {!isSplit ? (
            /* Cash method: show received / change fields */
            isCash ? (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--ink3)', marginBottom: '10px' }}>
                  <span>Tổng dịch vụ</span>
                  <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{finalAmount.toLocaleString('vi-VN')}đ</span>
                </div>
                <div className="fg">
                  <label className="flbl">{t('Tiền khách đưa')}</label>
                  <input className="fc" type="number" placeholder="Nhập số tiền..." value={payAmt} onChange={(e) => setPayAmt(e.target.value)} />
                </div>
                {got >= finalAmount && (
                  <div style={{ background: 'var(--green-bg)', borderRadius: 'var(--r)', padding: '10px 14px', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                      <span style={{ color: 'var(--ink3)' }}>Tiền khách đưa</span>
                      <span style={{ fontWeight: 600 }}>{got.toLocaleString('vi-VN')}đ</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginTop: '4px' }}>
                      <span style={{ color: 'var(--green)', fontWeight: 600 }}>{t('Tiền thối')}</span>
                      <span style={{ color: 'var(--green)', fontWeight: 700 }}>{change.toLocaleString('vi-VN')}đ</span>
                    </div>
                  </div>
                )}
              </div>
            ) : null /* Non-cash: no extra field needed */
          ) : (
            <div>
              {splits.map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                  <select className="fc" style={{ flex: 1, padding: '8px' }} value={s.method_id} onChange={(e) => updateSplit(i, 'method_id', e.target.value)}>
                    {methods.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                  <input type="number" className="fc" style={{ width: '110px', padding: '8px' }} placeholder="Số tiền" value={s.amount || ''} onChange={(e) => updateSplit(i, 'amount', e.target.value)} />
                  <button style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'var(--red-bg)', color: 'var(--red)', border: 'none' }} onClick={() => removeSplit(i)}>×</button>
                </div>
              ))}
              <button className="btn ghost sm" style={{ marginTop: '8px' }} onClick={addSplitItem}>+ Thêm phương thức</button>
              <div style={{ marginTop: '10px', background: 'var(--bg3)', borderRadius: 'var(--r)', padding: '10px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: 'var(--ink3)' }}>Đã nhập:</span>
                  <span style={{ fontWeight: 600 }}>{splitSum.toLocaleString('vi-VN')}đ</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginTop: '4px' }}>
                  <span style={{ color: 'var(--ink3)' }}>Còn lại:</span>
                  <span style={{ fontWeight: 600, color: splitRem === 0 ? 'var(--green)' : 'var(--red)' }}>{splitRem.toLocaleString('vi-VN')}đ</span>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="mfoot">
          <button className="btn outline" style={{ flex: 1 }} onClick={onClose} disabled={isLoading}>{t('Quay lại')}</button>
          <button className="btn brand" style={{ flex: 2 }} onClick={confirmPayment} disabled={isLoading}>{isLoading ? '...' : `✓ ${t('Xác nhận')}`}</button>
        </div>
      </div>
    </div>
  );
};
