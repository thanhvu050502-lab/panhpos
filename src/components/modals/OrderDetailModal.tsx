import React, { useState } from 'react';
import { useCache } from '../../hooks/useCache';
import { formatCurrency, formatDateTime } from '../../lib/utils';
import { Badge } from '../ui/Badge';
import { toast } from '../ui/Toast';
import { logAudit } from '../../hooks/useAuditLog';
import { useAuth } from '../../hooks/useAuth';

interface OrderDetailModalProps {
  onClose: () => void;
  orderId?: string;
}

export const OrderDetailModal: React.FC<OrderDetailModalProps> = ({ onClose, orderId }) => {
  const { cache, dbUpdate } = useCache();
  const { session } = useAuth();
  const [cancelReason, setCancelReason] = useState('');
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const order = cache.orders?.find((o: any) => o.id === orderId);
  const canManage = ['owner', 'manager'].includes(session?.role || '');

  if (!order) {
    return (
      <div className="moverlay open" onClick={(e) => { if ((e.target as any).classList.contains('moverlay')) onClose(); }}>
        <div className="modal">
          <div className="mhandle"></div>
          <div className="mhdr">
            <div className="mttl">Chi tiết đơn hàng</div>
            <button className="mclose" onClick={onClose}>×</button>
          </div>
          <div className="mbody" style={{ padding: '20px', textAlign: 'center' }}>
            Không tìm thấy đơn hàng.
          </div>
        </div>
      </div>
    );
  }

  const items = order.order_items || [];
  const payments = order.payments || [];

  const handleMarkPaid = () => {
    // Reconstruct orderState from the saved order and open PaymentModal
    const orderItems = order.order_items || [];
    ;(window as any)._orderState = {
      customer: { name: order.customer_name, id: order.customer_id },
      cart: orderItems.map((i: any) => ({
        catalog_id: i.catalog_id || null,
        name: i.name,
        price: i.price,
        quantity: i.quantity,
      })),
      promoId: order.promotion_id || '',
      discount: order.discount || 0,
      apptId: order.appointment_id || null,
      qty: 1,
      notes: order.notes || '',
      total: order.final_amount || 0,
      subtotal: order.total_amount || 0,
      // Pass existing orderId so PaymentModal can update instead of insert
      existingOrderId: order.id,
    };
    onClose();
    ;(window as any).openModal?.('payModal');
  };

  const handleCancelOrder = async () => {
    if (!canManage) {
      toast('Chỉ chủ tiệm hoặc quản lý mới được huỷ đơn', 'error');
      return;
    }
    if (!cancelReason.trim()) {
      toast('Vui lòng nhập lý do huỷ', 'error');
      return;
    }
    try {
      await dbUpdate('orders', order.id, { status: 'cancelled', notes: (order.notes ? order.notes + '\n' : '') + 'Huỷ: ' + cancelReason }, cache.settings?.app_name === 'Demo');
      logAudit('order_cancelled', 'order', `Huỷ đơn ${order.code || order.id.slice(0,8).toUpperCase()} - ${order.customer_name} - Lý do: ${cancelReason}`, order.id, session?.displayName || session?.username);
      toast('Đã huỷ đơn hàng', 'success');
      onClose();
    } catch (e: any) {
      toast('Lỗi: ' + e.message, 'error');
    }
  };

  if (showCancelConfirm) {
    return (
      <div className="moverlay open" onClick={(e) => { if ((e.target as any).classList.contains('moverlay')) setShowCancelConfirm(false); }}>
        <div className="modal" style={{ maxHeight: '50dvh' }}>
          <div className="mhandle"></div>
          <div className="mhdr">
            <div className="mttl">Huỷ đơn hàng</div>
            <button className="mclose" onClick={() => setShowCancelConfirm(false)}>×</button>
          </div>
          <div className="mbody">
            <div style={{ background: 'var(--red-bg)', borderRadius: '10px', padding: '10px 14px', marginBottom: '14px', fontSize: '13px', color: 'var(--red)' }}>
              ⚠️ Đơn hàng sẽ chuyển sang trạng thái <strong>Đã huỷ</strong>. Không thể hoàn tác.
            </div>
            <div className="fg">
              <label className="flbl">Lý do huỷ <span className="req">*</span></label>
              <textarea className="fc" placeholder="VD: Khách đổi ý, khách không đến..." rows={3} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}></textarea>
            </div>
          </div>
          <div className="mfoot">
            <button className="btn outline" style={{ flex: 1 }} onClick={() => setShowCancelConfirm(false)}>Quay lại</button>
            <button className="btn danger" style={{ flex: 1 }} onClick={handleCancelOrder}>Xác nhận huỷ</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="moverlay open" onClick={(e) => { if ((e.target as any).classList.contains('moverlay')) onClose(); }}>
      <div className="modal" style={{ maxHeight: '90dvh', display: 'flex', flexDirection: 'column' }}>
        <div className="mhandle"></div>
        <div className="mhdr">
          <div className="mttl">Chi tiết đơn hàng</div>
          <button className="mclose" onClick={onClose}>×</button>
        </div>
        <div className="mbody" style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 700 }}>{order.customer_name}</div>
              <div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '4px' }}>Mã: <span style={{ fontWeight: 600 }}>{order.code || order.id.slice(0, 8).toUpperCase()}</span></div>
              <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>{formatDateTime(order.created_at)}</div>
              {order.staff_name && <div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '2px' }}>NV: <span style={{ fontWeight: 600 }}>{order.staff_name}</span></div>}
            </div>
            <Badge status={order.status} />
          </div>

          <div style={{ background: 'var(--bg3)', borderRadius: '10px', padding: '12px', marginBottom: '16px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.03em', marginBottom: '8px' }}>Dịch vụ & Sản phẩm</div>
            {items.length === 0 ? <div style={{ fontSize: '13px', color: 'var(--ink4)' }}>Không có dịch vụ</div> : null}
            {items.map((item: any) => (
              <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
                <div>{item.name} {item.quantity > 1 ? `× ${item.quantity}` : ''}</div>
                <div style={{ fontWeight: 600 }}>{formatCurrency(item.price * item.quantity)}</div>
              </div>
            ))}
            
            <div style={{ borderTop: '1px dashed var(--bdr2)', margin: '12px 0' }}></div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px', color: 'var(--ink3)' }}>
              <span>Tạm tính</span>
              <span>{formatCurrency(order.total_amount)}</span>
            </div>
            {order.discount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px', color: 'var(--green)' }}>
                <span>Giảm giá</span>
                <span>-{formatCurrency(order.discount)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '16px', fontWeight: 700, color: 'var(--brand)' }}>
              <span>Tổng cộng</span>
              <span>{formatCurrency(order.final_amount)}</span>
            </div>
          </div>

          {payments.length > 0 && (
            <div style={{ background: 'var(--bg3)', borderRadius: '10px', padding: '12px', marginBottom: '16px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.03em', marginBottom: '8px' }}>Thanh toán</div>
              {payments.map((p: any) => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px' }}>
                  <span>{p.payment_method_name || 'Khác'}</span>
                  <span style={{ fontWeight: 600 }}>{formatCurrency(p.amount)}</span>
                </div>
              ))}
            </div>
          )}

          {order.notes && (
            <div style={{ fontSize: '13px', color: 'var(--ink3)', background: 'var(--bg)', border: '1px solid var(--bdr2)', borderRadius: '8px', padding: '8px 12px' }}>
              <strong>Ghi chú:</strong> {order.notes}
            </div>
          )}
        </div>
        
        <div className="mfoot">
          {order.status === 'pending' ? (
            <>
              {canManage && <button className="btn danger" style={{ flex: 1 }} onClick={() => setShowCancelConfirm(true)}>Huỷ đơn</button>}
              <button className="btn brand" style={{ flex: 2 }} onClick={handleMarkPaid}>Thanh toán ✓</button>
            </>
          ) : order.status === 'paid' ? (
            <>
              <button className="btn outline" style={{ flex: 1 }} onClick={onClose}>Đóng</button>
              <button
                className="btn brand"
                style={{ flex: 1 }}
                onClick={() => {
                  (window as any)._reorderFromOrderId = order.id;
                  onClose();
                  (window as any).openModal?.('orderModal');
                }}
              >
                Tạo lại
              </button>
              {canManage && <button className="btn danger" style={{ flex: 1 }} onClick={() => setShowCancelConfirm(true)}>Huỷ đơn</button>}
            </>
          ) : (
            <>
              <button className="btn outline" style={{ flex: 1 }} onClick={onClose}>Đóng</button>
              <button
                className="btn brand"
                style={{ flex: 1 }}
                onClick={() => {
                  (window as any)._reorderFromOrderId = order.id;
                  onClose();
                  (window as any).openModal?.('orderModal');
                }}
              >
                Tạo lại
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
