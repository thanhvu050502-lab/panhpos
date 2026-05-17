import React, { useState, useEffect, useRef } from 'react';
import { useCache } from '../../hooks/useCache';
import { useShift } from '../../hooks/useShift';
import { useAuth } from '../../hooks/useAuth';
import { useLang } from '../../contexts/LangContext';
import { useConfirmAlert } from '../../hooks/useConfirmAlert';
import { formatCurrency, uid, VND, todayStr } from '../../lib/utils';
import { toast } from '../ui/Toast';
import { getAuditLog, clearAuditLog, type AuditEntry } from '../../hooks/useAuditLog';

const isDemoMode = () => localStorage.getItem('np_demo') === '1';

// ─── Shared bottom-sheet wrapper ──────────────────────────────────────────────
const Sheet: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }> = ({ title, onClose, children, footer }) => (
  <div className="moverlay open" onClick={e => { if ((e.target as any).classList.contains('moverlay')) onClose(); }}>
    <div className="modal" style={{ maxHeight: '88dvh', display: 'flex', flexDirection: 'column' }}>
      <div className="mhandle" />
      <div className="mhdr">
        <button className="mclose" onClick={onClose} style={{ marginRight: 'auto', marginLeft: 0 }}>‹</button>
        <div className="mttl" style={{ flex: 1, textAlign: 'center' }}>{title}</div>
        <div style={{ width: 28 }} />
      </div>
      <div className="mbody" style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>{children}</div>
      {footer && <div className="mfoot">{footer}</div>}
    </div>
  </div>
);

// ─── Catalog Panel ────────────────────────────────────────────────────────────
export const CatalogPanel: React.FC = () => {
  const { cache, dbInsert, dbDelete, fetchAll } = useCache();
  const { confirm } = useConfirmAlert();
  const cat = cache.catalog || [];

  const blank = { name: '', price: '', type: 'nail', variable_price: false, combo_items: [] as string[] };
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<typeof blank>(blank);

  const resetForm = () => { setForm(blank); setShowForm(false); };

  const handleAdd = async () => {
    if (!form.name.trim()) { toast('Vui lòng nhập tên dịch vụ', 'error'); return; }
    const isCombo = form.type === 'combo';
    const price = (form.variable_price && !isCombo) ? 0 : Number(form.price);
    if (!form.variable_price && !isCombo && (Number.isNaN(price) || price < 0)) { toast('Giá không hợp lệ', 'error'); return; }
    if (isCombo && Number.isNaN(Number(form.price))) { toast('Giá không hợp lệ', 'error'); return; }
    try {
      await dbInsert('catalog', { id: uid(), name: form.name.trim(), price: isCombo ? Number(form.price) || 0 : price, type: form.type, variable_price: !isCombo && form.variable_price, combo_items: isCombo ? form.combo_items : [], is_active: true }, isDemoMode());
      if (!isDemoMode()) await fetchAll(false);
      toast('Đã thêm dịch vụ', 'success');
      resetForm();
    } catch (e: any) {
      toast(`Lỗi: ${e.message || 'Không thể thêm dịch vụ'}`, 'error');
    }
  };

  const handleRemove = async (id: string, name: string) => {
    const ok = await confirm({ title: 'Xóa dịch vụ', message: `Xóa dịch vụ "${name}"?`, confirmLabel: 'Xóa', confirmVariant: 'danger' });
    if (!ok) return;
    try {
      await dbDelete('catalog', id, isDemoMode());
      if (!isDemoMode()) await fetchAll(false);
      toast('Đã xóa dịch vụ', 'success');
    } catch (e: any) {
      toast(`Lỗi: ${e.message || 'Không thể xóa'}`, 'error');
    }
  };

  return (
    <div style={{ padding: '16px', overflowY: 'auto', flex: 1 }}>
      <div className="card" style={{ marginBottom: '12px' }}>
        {cat.length ? cat.map((c: any) => (
          <div className="srow" key={c.id}>
            <div>
              <div className="slbl">
                {c.name}
                {c.variable_price && <span style={{ fontSize: '10px', background: 'var(--amber, #F59E0B)', color: '#fff', borderRadius: 4, padding: '1px 5px', marginLeft: 4, fontWeight: 600 }}>TG</span>}
                {c.type === 'combo' && <span style={{ fontSize: '10px', background: 'var(--green)', color: '#fff', borderRadius: 4, padding: '1px 5px', marginLeft: 4, fontWeight: 600 }}>📦</span>}
              </div>
              <div className="ssub">{c.type === 'combo' ? `Combo · ${formatCurrency(c.price)}${c.combo_items?.length ? ' · ' + (c.combo_items as string[]).join(', ') : ''}` : `${c.type} · ${c.variable_price ? 'Thời giá' : formatCurrency(c.price)}`}</div>
            </div>
            <button className="btn danger sm" onClick={() => handleRemove(c.id, c.name)}>🗑</button>
          </div>
        )) : (
          <div className="empty"><div className="empty-ico">💅</div><div className="empty-ttl">Chưa có dịch vụ</div></div>
        )}
      </div>
      <button className="btn outline full" onClick={() => setShowForm(true)}>+ Thêm dịch vụ</button>

      {showForm && (
        <Sheet
          title="Thêm dịch vụ"
          onClose={resetForm}
          footer={
            <>
              <button className="btn outline" style={{ flex: 1 }} onClick={resetForm}>Huỷ</button>
              <button className="btn brand" style={{ flex: 2 }} onClick={handleAdd}>Lưu</button>
            </>
          }
        >
          <div className="fg">
            <label className="flbl">Tên dịch vụ <span className="req">*</span></label>
            <input className="fc" placeholder="VD: Sơn gel, Nail art..." value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="fg">
            <label className="flbl">Loại dịch vụ</label>
            <select className="fc" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value, variable_price: false, combo_items: [] }))}>
              <option value="nail">Nail</option>
              <option value="wash">Wash</option>
              <option value="other">Khác</option>
              <option value="combo">📦 Combo</option>
            </select>
          </div>
          {form.type === 'combo' ? (
            <>
              <div className="fg">
                <label className="flbl">Giá combo (VNĐ)</label>
                <input className="fc" type="number" placeholder="0" min="0" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
              </div>
              <div className="fg">
                <label className="flbl">Dịch vụ bao gồm</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                  {form.combo_items.map((item, i) => (
                    <div key={i} className="chip on" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {item}
                      <button style={{ background: 'none', border: 'none', color: 'inherit', padding: '2px', cursor: 'pointer' }} onClick={() => setForm(f => ({ ...f, combo_items: f.combo_items.filter((_, idx) => idx !== i) }))}>×</button>
                    </div>
                  ))}
                </div>
                <select className="fc" onChange={e => { const v = e.target.value; if (v && !form.combo_items.includes(v)) setForm(f => ({ ...f, combo_items: [...f.combo_items, v] })); e.target.value = ''; }}>
                  <option value="">+ Thêm dịch vụ vào combo...</option>
                  {cat.filter((c: any) => c.type !== 'combo').map((c: any) => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                <label className="tgl">
                  <input type="checkbox" checked={!!form.variable_price}
                    onChange={e => setForm(f => ({ ...f, variable_price: e.target.checked, price: e.target.checked ? '' : f.price }))} />
                  <div className="tgl-sl"></div>
                </label>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>Thay đổi theo thời giá</div>
                  <div style={{ fontSize: '11px', color: 'var(--ink4)' }}>Không có giá cố định, nhập giá khi tạo đơn</div>
                </div>
              </div>
              {!form.variable_price && (
                <div className="fg">
                  <label className="flbl">Giá (VNĐ)</label>
                  <input className="fc" type="number" placeholder="0" min="0" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
                </div>
              )}
            </>
          )}
        </Sheet>
      )}
    </div>
  );
};

// ─── Payment Methods Panel ─────────────────────────────────────────────────────
const PM_TYPES = [
  { value: 'cash', label: 'Tiền mặt' },
  { value: 'bank', label: 'Ngân hàng' },
  { value: 'momo', label: 'MoMo' },
  { value: 'zalopay', label: 'ZaloPay' },
  { value: 'custom', label: 'Khác' },
];

export const PMPanel: React.FC = () => {
  const { cache, dbInsert, dbDelete, fetchAll } = useCache();
  const { confirm } = useConfirmAlert();
  const pm = cache.payMethods || [];

  const blank = { name: '', type: 'cash', accountNo: '', accountName: '', bankName: '', qrImage: '' };
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blank);
  const [qrPreview, setQrPreview] = useState('');
  const qrInputRef = useRef<HTMLInputElement>(null);

  const typeLabel = (t: string) => PM_TYPES.find(p => p.value === t)?.label || t;
  const resetForm = () => { setForm(blank); setQrPreview(''); setShowForm(false); };

  const handleQr = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const b64 = ev.target?.result as string;
      setQrPreview(b64);
      setForm(f => ({ ...f, qrImage: b64 }));
    };
    reader.readAsDataURL(file);
  };

  const handleAdd = async () => {
    if (!form.name.trim()) { toast('Vui lòng nhập tên phương thức', 'error'); return; }
    try {
      const record: any = { id: uid(), name: form.name.trim(), type: form.type, is_active: true };
      if (form.type === 'bank') {
        record.account_no = form.accountNo;
        record.account_name = form.accountName;
        record.bank_name = form.bankName;
      }
      if (form.type !== 'cash' && form.qrImage) record.qr_image = form.qrImage;
      await dbInsert('payment_methods', record, isDemoMode());
      if (!isDemoMode()) await fetchAll(false);
      toast('Đã thêm phương thức', 'success');
      resetForm();
    } catch (e: any) {
      toast(`Lỗi: ${e.message || 'Không thể thêm'}`, 'error');
    }
  };

  const handleRemove = async (id: string, name: string) => {
    const ok = await confirm({ title: 'Xóa phương thức', message: `Xóa "${name}"?`, confirmLabel: 'Xóa', confirmVariant: 'danger' });
    if (!ok) return;
    try {
      await dbDelete('payment_methods', id, isDemoMode());
      if (!isDemoMode()) await fetchAll(false);
      toast('Đã xóa phương thức', 'success');
    } catch (e: any) {
      toast(`Lỗi: ${e.message || 'Không thể xóa'}`, 'error');
    }
  };

  return (
    <div style={{ padding: '16px', overflowY: 'auto', flex: 1 }}>
      <div className="card" style={{ marginBottom: '12px' }}>
        {pm.length ? pm.map((m: any) => (
          <div className="srow" key={m.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
              {m.qr_image && <img src={m.qr_image} alt="QR" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />}
              <div>
                <div className="slbl">{m.name}</div>
                <div className="ssub">
                  {typeLabel(m.type)}
                  {m.bank_name ? ` · ${m.bank_name}` : ''}
                  {m.account_no ? ` · ${m.account_no}` : ''}
                </div>
              </div>
            </div>
            <button className="btn danger sm" onClick={() => handleRemove(m.id, m.name)}>Xóa</button>
          </div>
        )) : (
          <div className="empty"><div className="empty-ico">💳</div><div className="empty-ttl">Chưa có phương thức</div></div>
        )}
      </div>
      <button className="btn outline full" onClick={() => setShowForm(true)}>+ Thêm phương thức</button>

      {showForm && (
        <Sheet
          title="Thêm phương thức thanh toán"
          onClose={resetForm}
          footer={
            <>
              <button className="btn outline" style={{ flex: 1 }} onClick={resetForm}>Huỷ</button>
              <button className="btn brand" style={{ flex: 2 }} onClick={handleAdd}>Lưu</button>
            </>
          }
        >
          <div className="fg">
            <label className="flbl">Tên phương thức <span className="req">*</span></label>
            <input className="fc" placeholder="VD: Vietcombank, MoMo, Tiền mặt..." value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="fg">
            <label className="flbl">Loại</label>
            <select className="fc" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
              {PM_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>

          {form.type === 'bank' && (
            <>
              <div className="fg">
                <label className="flbl">Số tài khoản</label>
                <input className="fc" placeholder="VD: 0123456789" value={form.accountNo} onChange={e => setForm(f => ({ ...f, accountNo: e.target.value }))} />
              </div>
              <div className="fg">
                <label className="flbl">Chủ tài khoản</label>
                <input className="fc" placeholder="VD: NGUYEN VAN A" value={form.accountName} onChange={e => setForm(f => ({ ...f, accountName: e.target.value }))} />
              </div>
              <div className="fg">
                <label className="flbl">Tên ngân hàng</label>
                <input className="fc" placeholder="VD: Vietcombank" value={form.bankName} onChange={e => setForm(f => ({ ...f, bankName: e.target.value }))} />
              </div>
            </>
          )}

          {form.type !== 'cash' && (
            <div className="fg">
              <label className="flbl">Ảnh QR thanh toán</label>
              <input ref={qrInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleQr} />
              {qrPreview ? (
                <div style={{ position: 'relative', display: 'inline-block', marginTop: '6px' }}>
                  <img src={qrPreview} alt="QR Preview" style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 10, display: 'block' }} />
                  <button
                    style={{ position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: '50%', background: 'var(--red)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, lineHeight: '22px', textAlign: 'center' }}
                    onClick={() => { setQrPreview(''); setForm(f => ({ ...f, qrImage: '' })); if (qrInputRef.current) qrInputRef.current.value = ''; }}
                  >×</button>
                </div>
              ) : (
                <button className="btn outline" style={{ marginTop: '6px' }} onClick={() => qrInputRef.current?.click()}>
                  📷 Chọn ảnh QR
                </button>
              )}
            </div>
          )}
        </Sheet>
      )}
    </div>
  );
};

// ─── Promo Panel ──────────────────────────────────────────────────────────────
export const PromoPanel: React.FC = () => {
  const { cache, dbInsert, dbDelete, fetchAll } = useCache();
  const { confirm } = useConfirmAlert();
  const pr = cache.promotions || [];

  const blank = { name: '', type: 'percent', value: '' };
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blank);

  const resetForm = () => { setForm(blank); setShowForm(false); };

  const promoLabel = (p: any) =>
    p.type === 'percent' ? `Giảm ${p.value}%` : p.type === 'fixed' ? `Giảm ${formatCurrency(p.value)}` : 'Tặng dịch vụ';

  const handleAdd = async () => {
    if (!form.name.trim()) { toast('Vui lòng nhập tên khuyến mãi', 'error'); return; }
    const value = Number(form.value);
    if (Number.isNaN(value) || value < 0) { toast('Giá trị không hợp lệ', 'error'); return; }
    try {
      await dbInsert('promotions', { id: uid(), name: form.name.trim(), type: form.type, value, is_active: true }, isDemoMode());
      if (!isDemoMode()) await fetchAll(false);
      toast('Đã thêm khuyến mãi', 'success');
      resetForm();
    } catch (e: any) {
      toast(`Lỗi: ${e.message || 'Không thể thêm'}`, 'error');
    }
  };

  const handleRemove = async (id: string, name: string) => {
    const ok = await confirm({ title: 'Xóa khuyến mãi', message: `Xóa khuyến mãi "${name}"?`, confirmLabel: 'Xóa', confirmVariant: 'danger' });
    if (!ok) return;
    try {
      await dbDelete('promotions', id, isDemoMode());
      if (!isDemoMode()) await fetchAll(false);
      toast('Đã xóa khuyến mãi', 'success');
    } catch (e: any) {
      toast(`Lỗi: ${e.message || 'Không thể xóa'}`, 'error');
    }
  };

  return (
    <div style={{ padding: '16px', overflowY: 'auto', flex: 1 }}>
      <div className="card" style={{ marginBottom: '12px' }}>
        {pr.length ? pr.map((p: any) => (
          <div className="srow" key={p.id}>
            <div>
              <div className="slbl">{p.name}</div>
              <div className="ssub">{promoLabel(p)}</div>
            </div>
            <button className="btn danger sm" onClick={() => handleRemove(p.id, p.name)}>Xóa</button>
          </div>
        )) : (
          <div className="empty"><div className="empty-ico">🏷️</div><div className="empty-ttl">Chưa có khuyến mãi</div></div>
        )}
      </div>
      <button className="btn outline full" onClick={() => setShowForm(true)}>+ Thêm khuyến mãi</button>

      {showForm && (
        <Sheet
          title="Thêm khuyến mãi"
          onClose={resetForm}
          footer={
            <>
              <button className="btn outline" style={{ flex: 1 }} onClick={resetForm}>Huỷ</button>
              <button className="btn brand" style={{ flex: 2 }} onClick={handleAdd}>Lưu</button>
            </>
          }
        >
          <div className="fg">
            <label className="flbl">Tên khuyến mãi <span className="req">*</span></label>
            <input className="fc" placeholder="VD: Giảm 10% cuối tuần..." value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="fg">
            <label className="flbl">Loại</label>
            <select className="fc" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
              <option value="percent">Giảm theo %</option>
              <option value="fixed">Giảm số tiền cố định</option>
              <option value="gift">Tặng dịch vụ</option>
            </select>
          </div>
          {form.type !== 'gift' && (
            <div className="fg">
              <label className="flbl">{form.type === 'percent' ? 'Phần trăm giảm (%)' : 'Số tiền giảm (VNĐ)'}</label>
              <input className="fc" type="number" placeholder="0" min="0" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} />
            </div>
          )}
        </Sheet>
      )}
    </div>
  );
};

// ─── Groups Panel ─────────────────────────────────────────────────────────────
export const GroupsPanel: React.FC = () => {
  const { cache, dbInsert, fetchAll } = useCache();
  const gr = cache.groups || [];

  const blank = { name: '', code: '', discountType: 'percent', discountValue: '' };
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blank);

  const resetForm = () => { setForm(blank); setShowForm(false); };

  const handleAdd = async () => {
    if (!form.name.trim()) { toast('Vui lòng nhập tên nhóm', 'error'); return; }
    const discountValue = Number(form.discountValue) || 0;
    const code = form.code.trim() || form.name.trim().toUpperCase().slice(0, 4);
    try {
      await dbInsert('customer_groups', { id: uid(), name: form.name.trim(), code, discount_type: form.discountType, discount_value: discountValue }, isDemoMode());
      if (!isDemoMode()) await fetchAll(false);
      toast('Đã thêm nhóm khách hàng', 'success');
      resetForm();
    } catch (e: any) {
      toast(`Lỗi: ${e.message || 'Không thể thêm nhóm'}`, 'error');
    }
  };

  return (
    <div style={{ padding: '16px', overflowY: 'auto', flex: 1 }}>
      <div className="card" style={{ marginBottom: '12px' }}>
        {gr.length ? gr.map((g: any) => (
          <div className="srow" key={g.id}>
            <div>
              <div className="slbl">{g.name}</div>
              <div className="ssub">{g.discount_value > 0 ? 'Giảm ' + (g.discount_type === 'percent' ? g.discount_value + '%' : formatCurrency(g.discount_value)) : 'Không giảm giá'}</div>
            </div>
            <span style={{ fontSize: '12px', color: 'var(--ink4)', background: 'var(--bg3)', padding: '2px 8px', borderRadius: 6 }}>{g.code || ''}</span>
          </div>
        )) : (
          <div className="empty"><div className="empty-ico">👥</div><div className="empty-ttl">Chưa có nhóm</div></div>
        )}
      </div>
      <button className="btn outline full" onClick={() => setShowForm(true)}>+ Thêm nhóm</button>

      {showForm && (
        <Sheet
          title="Thêm nhóm khách hàng"
          onClose={resetForm}
          footer={
            <>
              <button className="btn outline" style={{ flex: 1 }} onClick={resetForm}>Huỷ</button>
              <button className="btn brand" style={{ flex: 2 }} onClick={handleAdd}>Lưu</button>
            </>
          }
        >
          <div className="fg">
            <label className="flbl">Tên nhóm <span className="req">*</span></label>
            <input className="fc" placeholder="VD: Khách VIP, Thành viên..." value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="fg">
            <label className="flbl">Mã nhóm (tự động nếu để trống)</label>
            <input className="fc" placeholder="VD: VIP, MEM..." value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} maxLength={6} />
          </div>
          <div className="fg">
            <label className="flbl">Loại chiết khấu</label>
            <select className="fc" value={form.discountType} onChange={e => setForm(f => ({ ...f, discountType: e.target.value }))}>
              <option value="percent">Giảm theo %</option>
              <option value="fixed">Giảm số tiền cố định</option>
            </select>
          </div>
          <div className="fg">
            <label className="flbl">{form.discountType === 'percent' ? 'Phần trăm giảm (%)' : 'Số tiền giảm (VNĐ)'}</label>
            <input className="fc" type="number" placeholder="0" min="0" value={form.discountValue} onChange={e => setForm(f => ({ ...f, discountValue: e.target.value }))} />
          </div>
        </Sheet>
      )}
    </div>
  );
};

// ─── Ca Panel ─────────────────────────────────────────────────────────────────
export const CaPanel: React.FC = () => {
  const { cache } = useCache();
  const { getMembers } = useAuth();
  const { activeShift, getShiftTemplates, openShift, closeShift, getShifts } = useShift();

  const [selectedTplId, setSelectedTplId] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [selectedStaff, setSelectedStaff] = useState<string[]>([]);
  const [openNote, setOpenNote] = useState('');
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [actualCash, setActualCash] = useState('');
  const [closeNote, setCloseNote] = useState('');
  const [elapsed, setElapsed] = useState('');

  const templates = getShiftTemplates();
  const members = getMembers();
  const orders = cache.orders || [];

  const nowH = new Date().getHours();
  const filteredTpls = templates.filter(t => {
    const [sh] = (t.startTime || '00:00').split(':').map(Number);
    const [eh] = (t.endTime || '24:00').split(':').map(Number);
    return nowH >= sh - 2 && nowH <= eh + 2;
  });
  const displayTpls = filteredTpls.length > 0 ? filteredTpls : templates;

  useEffect(() => {
    if (!activeShift?.openTime) { setElapsed(''); return; }
    const update = () => {
      const diff = Math.floor((Date.now() - new Date(activeShift.openTime).getTime()) / 60000);
      const h = Math.floor(diff / 60); const m = diff % 60;
      setElapsed(h > 0 ? `${h}g ${m}p` : `${m} phút`);
    };
    update();
    const id = setInterval(update, 60000);
    return () => clearInterval(id);
  }, [activeShift]);

  const handleSelectTemplate = (tpl: any) => {
    setSelectedTplId(tpl.id);
    setStartTime(tpl.startTime || '');
    setEndTime(tpl.endTime || '');
  };

  const handleOpenShift = () => {
    if (!selectedTplId) { toast('Vui lòng chọn loại ca', 'error'); return; }
    openShift(selectedTplId, selectedStaff, startTime, endTime, openNote);
    setSelectedTplId(''); setOpenNote(''); setSelectedStaff([]);
    toast('Đã mở ca thành công', 'success');
  };

  const shiftDate = activeShift?.date || todayStr();
  const shiftOrders = orders.filter((o: any) => (o.created_at || '').slice(0, 10) >= shiftDate && o.status !== 'cancelled');
  const shiftRevenue = shiftOrders.filter((o: any) => o.status === 'paid').reduce((s: number, o: any) => s + (o.final_amount || 0), 0);
  const shiftPending = shiftOrders.filter((o: any) => o.status === 'pending').length;

  const shiftPaidOrders = shiftOrders.filter((o: any) => o.status === 'paid');
  const expectedCash = shiftPaidOrders.reduce((s: number, o: any) => {
    return s + (o.payments || []).filter((p: any) => {
      const mn = (p.payment_method_name || '').toLowerCase();
      return mn.includes('tiền mặt') || mn.includes('cash');
    }).reduce((ps: number, p: any) => ps + (p.amount || 0), 0);
  }, 0);

  const actualCashNum = parseInt(actualCash) || 0;
  const cashDiff = actualCashNum - expectedCash;

  const payBreakdown: Record<string, number> = {};
  shiftPaidOrders.forEach((o: any) => {
    (o.payments || []).forEach((p: any) => {
      const nm = p.payment_method_name || 'Khác';
      payBreakdown[nm] = (payBreakdown[nm] || 0) + (p.amount || 0);
    });
  });

  const handleCloseShift = () => {
    closeShift(orders, actualCashNum, closeNote);
    setShowCloseModal(false);
    setActualCash(''); setCloseNote('');
    toast('Đã đóng ca', 'success');
  };

  const copyReport = () => {
    const lines = [
      `=== BÁO CÁO CA ===`,
      `Ca: ${activeShift?.typeLabel || ''}`,
      `Ngày: ${shiftDate}`,
      `Giờ mở: ${activeShift?.openTime ? new Date(activeShift.openTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : ''}`,
      `Nhân viên: ${(activeShift?.staff || []).join(', ') || '—'}`,
      `Doanh thu: ${VND(shiftRevenue)}`,
      `Số đơn: ${shiftPaidOrders.length}`,
      ``,
      ...Object.entries(payBreakdown).map(([k, v]) => `${k}: ${VND(v)}`),
      ``,
      `Tiền mặt dự kiến: ${VND(expectedCash)}`,
      `Tiền mặt thực tế: ${VND(actualCashNum)}`,
      cashDiff === 0 ? '✓ Khớp' : cashDiff > 0 ? `Thừa ${VND(cashDiff)}` : `Thiếu ${VND(Math.abs(cashDiff))}`,
    ];
    navigator.clipboard.writeText(lines.join('\n')).then(() => toast('Đã sao chép báo cáo', 'success'));
  };

  const history = getShifts().filter((s: any) => s.status === 'closed').slice(0, 10);

  return (
    <div style={{ padding: '16px', overflowY: 'auto', flex: 1 }}>
      {!activeShift ? (
        <>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink3)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '.04em' }}>Chọn loại ca</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
            {displayTpls.map((tpl: any) => (
              <div key={tpl.id} onClick={() => handleSelectTemplate(tpl)}
                style={{ padding: '12px', borderRadius: '12px', border: `2px solid ${selectedTplId === tpl.id ? tpl.color : 'var(--bdr)'}`, background: selectedTplId === tpl.id ? tpl.bg : 'var(--bg)', cursor: 'pointer', transition: 'all .15s' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: tpl.color }}>{tpl.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--ink3)', marginTop: '2px' }}>{tpl.startTime} – {tpl.endTime}</div>
              </div>
            ))}
          </div>
          {selectedTplId && (
            <div className="card" style={{ marginBottom: '12px', padding: '12px' }}>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '11px', color: 'var(--ink3)', fontWeight: 600 }}>Giờ bắt đầu</label>
                  <input type="time" className="fc" value={startTime} onChange={e => setStartTime(e.target.value)} style={{ marginTop: '4px' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '11px', color: 'var(--ink3)', fontWeight: 600 }}>Giờ kết thúc</label>
                  <input type="time" className="fc" value={endTime} onChange={e => setEndTime(e.target.value)} style={{ marginTop: '4px' }} />
                </div>
              </div>
              <div style={{ marginBottom: '10px' }}>
                <label style={{ fontSize: '11px', color: 'var(--ink3)', fontWeight: 600 }}>Nhân viên</label>
                <div className="chips" style={{ marginTop: '6px', flexWrap: 'wrap' }}>
                  {members.filter((m: any) => !m.is_hidden).map((m: any) => (
                    <div key={m.id} className={`chip${selectedStaff.includes(m.displayName || m.name) ? ' on' : ''}`}
                      onClick={() => setSelectedStaff(prev => prev.includes(m.displayName || m.name) ? prev.filter(s => s !== (m.displayName || m.name)) : [...prev, m.displayName || m.name])}>
                      {m.displayName || m.name}
                    </div>
                  ))}
                </div>
              </div>
              <textarea className="fc" placeholder="Ghi chú đầu ca..." rows={2} value={openNote} onChange={e => setOpenNote(e.target.value)} style={{ marginBottom: '10px' }} />
            </div>
          )}
          <button className="btn brand full" disabled={!selectedTplId} onClick={handleOpenShift}>⏰ Mở ca</button>

          {history.length > 0 && (
            <>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink3)', margin: '16px 0 8px', textTransform: 'uppercase', letterSpacing: '.04em' }}>Lịch sử ca</div>
              <div className="card">
                {history.map((s: any) => (
                  <div key={s.id} className="lrow" style={{ padding: '10px 14px', borderBottom: '1px solid var(--bdr)' }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: s.color || '#8B5CF6', flexShrink: 0, marginTop: '3px' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600 }}>{s.typeLabel} · {s.date}</div>
                      <div style={{ fontSize: '11px', color: 'var(--ink3)', marginTop: '2px' }}>
                        {s.openTime ? new Date(s.openTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '?'} →{' '}
                        {s.closeTime ? new Date(s.closeTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '?'}
                        {s.staff?.length ? ' · ' + s.staff.join(', ') : ''}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--brand)' }}>{VND(s.revenue || 0)}</div>
                      <div style={{ fontSize: '11px', color: 'var(--ink4)' }}>{s.orderCount || 0} đơn</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        <>
          <div style={{ background: activeShift.bg || '#F5F3FF', border: `1.5px solid ${activeShift.color || '#8B5CF6'}44`, borderRadius: '14px', padding: '14px', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: activeShift.color || '#8B5CF6', animation: 'pulse 2s infinite' }} />
              <span style={{ fontSize: '15px', fontWeight: 700, color: activeShift.color || '#8B5CF6' }}>{activeShift.typeLabel || 'Ca làm việc'}</span>
              <span style={{ fontSize: '12px', color: 'var(--ink3)', marginLeft: 'auto' }}>{elapsed}</span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>
              Mở lúc: {activeShift.openTime ? new Date(activeShift.openTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : ''}
              {activeShift.staff?.length ? ' · ' + activeShift.staff.join(', ') : ''}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
            <div style={{ background: 'var(--bg3)', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
              <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--brand)' }}>{shiftRevenue >= 1e6 ? (shiftRevenue / 1e6).toFixed(1) + 'tr' : VND(shiftRevenue)}</div>
              <div style={{ fontSize: '11px', color: 'var(--ink3)', marginTop: '2px' }}>Doanh thu ca</div>
            </div>
            <div style={{ background: 'var(--bg3)', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
              <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--green)' }}>{shiftPaidOrders.length}</div>
              <div style={{ fontSize: '11px', color: 'var(--ink3)', marginTop: '2px' }}>Đơn hoàn thành{shiftPending > 0 ? ` · ${shiftPending} chờ` : ''}</div>
            </div>
          </div>

          {shiftOrders.length > 0 && (
            <div className="card" style={{ marginBottom: '12px' }}>
              <div style={{ padding: '10px 14px 4px', fontSize: '11px', fontWeight: 600, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Đơn gần nhất</div>
              {shiftOrders.slice(0, 5).map((o: any) => (
                <div key={o.id} className="lrow tap" style={{ padding: '8px 14px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>{o.code} · {o.customer_name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--ink3)' }}>{new Date(o.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--brand)' }}>{VND(o.final_amount)}</div>
                    <div style={{ fontSize: '11px', color: o.status === 'paid' ? 'var(--green)' : 'var(--amber)' }}>{o.status === 'paid' ? 'Đã TT' : 'Chờ TT'}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <button className="btn danger full" onClick={() => setShowCloseModal(true)}>Đóng ca</button>
        </>
      )}

      {showCloseModal && (
        <div className="moverlay open" onClick={e => { if ((e.target as any).classList.contains('moverlay')) setShowCloseModal(false); }}>
          <div className="modal" style={{ maxHeight: '85dvh', display: 'flex', flexDirection: 'column' }}>
            <div className="mhandle" />
            <div className="mhdr"><div className="mttl">Đóng ca</div><button className="mclose" onClick={() => setShowCloseModal(false)}>×</button></div>
            <div className="mbody" style={{ flex: 1, overflowY: 'auto' }}>
              <div style={{ background: 'var(--bg3)', borderRadius: '12px', padding: '12px', marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>Doanh thu</span>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--brand)' }}>{VND(shiftRevenue)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>Số đơn</span>
                  <span style={{ fontSize: '13px', fontWeight: 600 }}>{shiftPaidOrders.length}</span>
                </div>
                {shiftPaidOrders.length > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--ink4)' }}>↳ Trung bình/đơn</span>
                    <span style={{ fontSize: '12px', color: 'var(--ink3)' }}>{VND(Math.round(shiftRevenue / shiftPaidOrders.length))}</span>
                  </div>
                )}
                {Object.entries(payBreakdown).map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--ink4)' }}>↳ {k}</span>
                    <span style={{ fontSize: '12px', color: 'var(--ink3)' }}>{VND(v)}</span>
                  </div>
                ))}
              </div>
              <div className="fg" style={{ marginBottom: '10px' }}>
                <label className="flbl">Tiền mặt thực tế (đ)</label>
                <input className="fc" type="number" placeholder="Nhập số tiền đếm được..." value={actualCash} onChange={e => setActualCash(e.target.value)} />
                {actualCash && (
                  <div style={{ marginTop: '6px', fontSize: '13px', fontWeight: 600, color: cashDiff === 0 ? 'var(--green)' : cashDiff > 0 ? 'var(--blue)' : 'var(--red)' }}>
                    {cashDiff === 0 ? '✓ Khớp' : cashDiff > 0 ? `Thừa ${VND(cashDiff)}` : `Thiếu ${VND(Math.abs(cashDiff))}`}
                    <span style={{ fontWeight: 400, color: 'var(--ink3)', marginLeft: '6px' }}>· Dự kiến: {VND(expectedCash)}</span>
                  </div>
                )}
              </div>
              <div className="fg">
                <label className="flbl">Ghi chú cuối ca</label>
                <textarea className="fc" rows={2} placeholder="Ghi chú..." value={closeNote} onChange={e => setCloseNote(e.target.value)} />
              </div>
            </div>
            <div className="mfoot" style={{ flexWrap: 'wrap', gap: '8px' }}>
              <button className="btn outline" style={{ flex: 1 }} onClick={copyReport}>Sao chép BC</button>
              <button className="btn danger" style={{ flex: 2 }} onClick={handleCloseShift}>Xác nhận đóng ca</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Appearance Panel ──────────────────────────────────────────────────────────
export const AppearancePanel: React.FC = () => {
  const { lang, setLang } = useLang();
  const [isDark, setIsDark] = useState(() => document.body.classList.contains('dark-mode'));

  const toggleDark = () => {
    const on = document.body.classList.toggle('dark-mode');
    localStorage.setItem('np_dark_mode', on ? '1' : '');
    setIsDark(on);
  };

  return (
    <div style={{ padding: '16px', overflowY: 'auto', flex: 1 }}>
      <div className="card" style={{ marginBottom: '12px' }}>
        <div className="srow" style={{ padding: '14px' }}>
          <div>
            <div className="slbl">Chế độ tối</div>
            <div className="ssub">Dark mode</div>
          </div>
          <label className="tgl">
            <input type="checkbox" checked={isDark} onChange={toggleDark} />
            <div className="tgl-sl" />
          </label>
        </div>
      </div>

      <div className="card">
        <div style={{ padding: '14px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '10px' }}>Ngôn ngữ</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className={`btn${lang === 'vi' ? ' brand' : ' outline'}`} style={{ flex: 1 }} onClick={() => setLang('vi')}>🇻🇳 Tiếng Việt</button>
            <button className={`btn${lang === 'en' ? ' brand' : ' outline'}`} style={{ flex: 1 }} onClick={() => setLang('en')}>🇬🇧 English</button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Reminder Panel ────────────────────────────────────────────────────────────
export const ReminderPanel: React.FC = () => {
  const { cache } = useCache();
  const [enabled, setEnabled] = useState(() => localStorage.getItem('np_rem_enabled') === '1');
  const [mins, setMins] = useState<number>(() => parseInt(localStorage.getItem('np_reminder_mins') || '30'));
  const firedRef = useRef<Set<string>>(new Set());

  const checkReminders = () => {
    if (!enabled) return;
    const now = Date.now();
    const appts: any[] = cache.appointments || [];
    appts.forEach(a => {
      const dt = new Date(a.scheduled_at || a.datetime);
      const diff = (dt.getTime() - now) / 60000;
      if (diff > 0 && diff <= mins && !firedRef.current.has(a.id)) {
        firedRef.current.add(a.id);
        try {
          new Notification(`Lịch hẹn sắp tới: ${a.customer_name}`, {
            body: `${dt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} – ${(a.services || []).join(', ') || ''}`,
          });
        } catch { /* notification permission revoked */ }
      }
    });
  };

  useEffect(() => {
    if (!enabled) return;
    checkReminders();
    const id = setInterval(checkReminders, 60000);
    return () => clearInterval(id);
  }, [enabled, mins, cache.appointments]);

  const handleToggle = async () => {
    if (!enabled) {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { toast('Trình duyệt từ chối quyền thông báo', 'error'); return; }
    }
    const next = !enabled;
    setEnabled(next);
    localStorage.setItem('np_rem_enabled', next ? '1' : '');
  };

  const handleMins = (m: number) => {
    setMins(m);
    localStorage.setItem('np_reminder_mins', String(m));
  };

  const nextAppt = [...(cache.appointments || [])].filter((a: any) => new Date(a.scheduled_at || a.datetime) > new Date()).sort((a, b) => (a.scheduled_at || a.datetime || '').localeCompare(b.scheduled_at || b.datetime || ''))[0];

  return (
    <div style={{ padding: '16px', overflowY: 'auto', flex: 1 }}>
      <div className="card" style={{ marginBottom: '12px' }}>
        <div className="srow" style={{ padding: '14px' }}>
          <div>
            <div className="slbl">Bật nhắc nhở</div>
            <div className="ssub">Thông báo trước lịch hẹn</div>
          </div>
          <label className="tgl">
            <input type="checkbox" checked={enabled} onChange={handleToggle} />
            <div className="tgl-sl" />
          </label>
        </div>
      </div>

      {enabled && (
        <>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink3)', marginBottom: '8px' }}>Nhắc trước bao lâu?</div>
          <div className="chips" style={{ marginBottom: '14px' }}>
            {[15, 30, 60, 120].map(m => (
              <div key={m} className={`chip${mins === m ? ' on' : ''}`} onClick={() => handleMins(m)}>
                {m < 60 ? `${m} phút` : `${m / 60} giờ`}
              </div>
            ))}
          </div>
          {nextAppt && (
            <div style={{ background: 'var(--brand-l)', borderRadius: '12px', padding: '12px', fontSize: '13px' }}>
              <div style={{ fontWeight: 600, color: 'var(--brand)', marginBottom: '4px' }}>Lịch hẹn sắp tới:</div>
              <div style={{ color: 'var(--ink2)' }}>{nextAppt.customer_name} · {new Date(nextAppt.scheduled_at || nextAppt.datetime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ─── Data Panel ────────────────────────────────────────────────────────────────
export const DataPanel: React.FC = () => {
  const { cache } = useCache();
  const { confirm } = useConfirmAlert();
  const fileRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    const data = {
      orders: cache.orders,
      customers: cache.customers,
      appointments: cache.appointments,
      catalog: cache.catalog,
      exported_at: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nailpos_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Đã xuất dữ liệu', 'success');
  };

  const handleExportCSV = () => {
    const rows = [
      ['Mã đơn', 'Khách hàng', 'Ngày', 'Dịch vụ', 'Tạm tính', 'Giảm giá', 'Tổng', 'Trạng thái', 'Phương thức TT'],
      ...(cache.orders || []).map((o: any) => [
        o.code || o.id,
        o.customer_name || '',
        (o.created_at || '').slice(0, 10),
        (o.order_items || []).map((i: any) => i.name).join(' | '),
        o.total_amount || 0,
        o.discount || 0,
        o.final_amount || 0,
        o.status || '',
        (o.payments || []).map((p: any) => p.payment_method_name).join(' + '),
      ])
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `donhang_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Đã xuất CSV', 'success');
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async ev => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        const ok = await confirm({
          title: 'Nhập dữ liệu',
          message: 'Ghi đè toàn bộ dữ liệu hiện tại bằng file này?',
          confirmLabel: 'Ghi đè',
          confirmVariant: 'danger',
        });
        if (!ok) return;
        if (parsed.orders) localStorage.setItem('np_orders_demo', JSON.stringify(parsed.orders));
        toast('Đã nhập dữ liệu (khởi động lại để áp dụng)', 'success');
      } catch { toast('File không hợp lệ', 'error'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div style={{ padding: '16px', overflowY: 'auto', flex: 1 }}>
      <div className="card">
        <div className="srow" style={{ padding: '14px' }}>
          <div>
            <div className="slbl">Xuất dữ liệu</div>
            <div className="ssub">Tải về file JSON backup</div>
          </div>
          <button className="btn outline sm" onClick={handleExport}>Xuất JSON</button>
        </div>
        <div className="srow" style={{ padding: '14px', borderTop: '1px solid var(--bdr)' }}>
          <div>
            <div className="slbl">Xuất đơn hàng CSV</div>
            <div className="ssub">Mở bằng Excel (có tiếng Việt)</div>
          </div>
          <button className="btn outline sm" onClick={handleExportCSV}>Xuất CSV</button>
        </div>
        <div className="srow" style={{ padding: '14px', borderTop: '1px solid var(--bdr)' }}>
          <div>
            <div className="slbl">Nhập dữ liệu</div>
            <div className="ssub">Khôi phục từ file JSON</div>
          </div>
          <button className="btn outline sm" onClick={() => fileRef.current?.click()}>Nhập JSON</button>
          <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
        </div>
      </div>
    </div>
  );
};

// ─── Audit Log Panel ──────────────────────────────────────────────────────────
const ACTION_ICON: Record<string, string> = {
  order_created: '🧾',
  order_paid: '✅',
  order_cancelled: '❌',
  appt_created: '📅',
  appt_edited: '✏️',
  login: '🔑',
  setting_changed: '⚙️',
};

export const AuditLogPanel: React.FC = () => {
  const { confirm } = useConfirmAlert();
  const [entries, setEntries] = useState<AuditEntry[]>([]);

  useEffect(() => {
    setEntries(getAuditLog());
  }, []);

  const grouped: Record<string, AuditEntry[]> = {};
  entries.forEach(e => {
    const d = e.ts.slice(0, 10);
    if (!grouped[d]) grouped[d] = [];
    grouped[d].push(e);
  });
  const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  const today = new Date().toISOString().slice(0, 10);
  const yd = new Date(); yd.setDate(yd.getDate() - 1);
  const yesterday = yd.toISOString().slice(0, 10);

  const handleClear = async () => {
    const ok = await confirm({ title: 'Xoá lịch sử', message: 'Xoá toàn bộ nhật ký hoạt động?', confirmLabel: 'Xoá', confirmVariant: 'danger' });
    if (!ok) return;
    clearAuditLog();
    setEntries([]);
    toast('Đã xoá nhật ký', 'success');
  };

  return (
    <div style={{ padding: '16px', overflowY: 'auto', flex: 1 }}>
      {entries.length === 0 ? (
        <div className="card">
          <div className="empty">
            <div className="empty-ico">📋</div>
            <div className="empty-ttl">Chưa có hoạt động nào</div>
            <div className="empty-sub">Các thao tác tạo đơn, lịch hẹn sẽ được ghi lại tại đây</div>
          </div>
        </div>
      ) : (
        <>
          {dates.map(d => {
            const label = d === today ? 'Hôm nay' : d === yesterday ? 'Hôm qua' : new Date(d + 'T00:00:00').toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
            return (
              <div key={d}>
                <div className="shd" style={{ marginTop: '12px' }}><h3 style={{ fontSize: '13px' }}>{label}</h3></div>
                <div className="card">
                  {grouped[d].map(e => (
                    <div key={e.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 14px', borderBottom: '1px solid var(--bdr)' }}>
                      <div style={{ fontSize: '18px', marginTop: '1px', flexShrink: 0 }}>{ACTION_ICON[e.action] || '📝'}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: 500, lineHeight: 1.4 }}>{e.label}</div>
                        <div style={{ fontSize: '11px', color: 'var(--ink4)', marginTop: '2px' }}>
                          {new Date(e.ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                          {e.user ? ` · ${e.user}` : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          <div style={{ marginTop: '16px' }}>
            <button className="btn danger outline full" onClick={handleClear}>🗑️ Xoá toàn bộ nhật ký</button>
          </div>
        </>
      )}
    </div>
  );
};

// ─── App Info Panel ────────────────────────────────────────────────────────────
export { AppInfoPanel } from './AppInfoPanel';
