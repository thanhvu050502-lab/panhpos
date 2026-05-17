import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useCache } from '../../hooks/useCache';
import { useAuth } from '../../hooks/useAuth';
import { toast } from '../ui/Toast';
import { logAudit } from '../../hooks/useAuditLog';

const TIME_SHORTCUTS = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];

function getDateForDay(dayOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  return d.toISOString().split('T')[0];
}

function getNextWeekday(weekday: number): string {
  // weekday: 0=Sun,1=Mon,...,6=Sat (JS convention)
  const today = new Date();
  const current = today.getDay();
  let diff = weekday - current;
  if (diff <= 0) diff += 7;
  const d = new Date(today);
  d.setDate(today.getDate() + diff);
  return d.toISOString().split('T')[0];
}

// Label: T2-T7, CN
const DAY_SHORTCUTS = [
  { label: 'Hôm nay', getDate: () => getDateForDay(0) },
  { label: 'Ngày mai', getDate: () => getDateForDay(1) },
  { label: 'T2', getDate: () => getNextWeekday(1) },
  { label: 'T3', getDate: () => getNextWeekday(2) },
  { label: 'T4', getDate: () => getNextWeekday(3) },
  { label: 'T5', getDate: () => getNextWeekday(4) },
  { label: 'T6', getDate: () => getNextWeekday(5) },
  { label: 'T7', getDate: () => getNextWeekday(6) },
  { label: 'CN', getDate: () => getNextWeekday(0) },
];

interface ApptModalProps {
  onClose: () => void;
  apptId?: string;
  open?: boolean;
}

export const ApptModal: React.FC<ApptModalProps> = ({ onClose, apptId, open = true }) => {
  const { cache, dbInsert, dbUpdate } = useCache();
  const { getMembers, session } = useAuth();
  const members = getMembers();

  const isDemo = cache.settings?.app_name === 'Demo';

  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustDrop, setShowCustDrop] = useState(false);
  const [selectedCust, setSelectedCust] = useState<any>(null);
  const [staffName, setStaffName] = useState('');

  const [phone, setPhone] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState('09:00');

  const [services, setServices] = useState<string[]>([]);
  const [customSvcName, setCustomSvcName] = useState('');
  const [customSvcPrice, setCustomSvcPrice] = useState('');

  const [groupSize, setGroupSize] = useState(1);
  const [refImages, setRefImages] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (apptId) {
      const a = cache.appointments?.find((x: any) => x.id === apptId);
      if (a) {
        if (a.customer_id) {
          const c = cache.customers?.find((x: any) => x.id === a.customer_id);
          setSelectedCust(c || { name: a.customer_name, isWalkin: true });
        } else {
          setSelectedCust({ name: a.customer_name, isWalkin: true });
        }
        setPhone(a.customer_phone || '');
        if (a.scheduled_at) {
          const d = new Date(a.scheduled_at);
          // Format date to local YYYY-MM-DD
          const tzDate = new Date(d.getTime() - (d.getTimezoneOffset() * 60000));
          setDate(tzDate.toISOString().split('T')[0]);
          setTime(tzDate.toISOString().split('T')[1].slice(0, 5));
        }
        setServices(a.services || []);
        setGroupSize(a.group_size || 1);
        setRefImages(a.ref_images || []);
        setStaffName(a.staff_name || '');
        setNotes(a.notes || '');
      }
    }
  }, [apptId, cache.appointments, cache.customers]);

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

  const handleSelectCust = (c: any) => {
    setSelectedCust(c);
    if (c.phone) setPhone(c.phone);
    setShowCustDrop(false);
  };

  const handleAddSvc = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (!val) return;
    if (val === '__khac__') {
      if (!services.includes('__khac__')) {
        setServices([...services, '__khac__']);
      }
    } else {
      if (!services.includes(val)) {
        setServices([...services, val]);
      }
    }
    e.target.value = '';
  };

  const handleAddCustomSvc = () => {
    if (!customSvcName) return;
    setServices(services.filter(s => s !== '__khac__').concat([customSvcName]));
    setCustomSvcName('');
    setCustomSvcPrice('');
  };

  const handleRefImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => {
        const b64 = ev.target?.result as string;
        setRefImages(imgs => imgs.length < 5 ? [...imgs, b64] : imgs);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const handleSave = async () => {
    if (saving) return;
    if (!selectedCust) {
      toast('Vui lòng chọn khách hàng', 'error');
      return;
    }
    if (!date || !time) {
      toast('Vui lòng chọn ngày và giờ', 'error');
      return;
    }
    setSaving(true);
    try {
      const scheduled_at = new Date(`${date}T${time}:00`).toISOString();
      const finalServices = services.filter(s => s !== '__khac__');

      const data = {
        customer_id: selectedCust.isWalkin ? null : selectedCust.id,
        customer_name: selectedCust.name,
        customer_phone: phone || null,
        scheduled_at,
        services: finalServices,
        group_size: groupSize,
        status: apptId ? (cache.appointments?.find((x: any) => x.id === apptId)?.status || 'scheduled') : 'scheduled',
        ref_images: refImages,
        staff_name: staffName || null,
        notes
      };

      if (apptId) {
        await dbUpdate('appointments', apptId, data, isDemo);
        logAudit('appt_edited', 'appointment', `Sửa lịch hẹn - ${selectedCust.name} - ${date} ${time}`, apptId, session?.displayName || session?.username);
        toast('Cập nhật thành công', 'success');
      } else {
        await dbInsert('appointments', data, isDemo);
        logAudit('appt_created', 'appointment', `Tạo lịch hẹn - ${selectedCust.name} - ${date} ${time}${staffName ? ' - NV: ' + staffName : ''}`, undefined, session?.displayName || session?.username);
        toast('Tạo lịch hẹn thành công', 'success');
      }
      onClose();
    } catch (e: any) {
      toast('Lỗi: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleQuickAddCust = useCallback(async () => {
    if (!customerSearch.trim()) return;
    try {
      const newCust = await dbInsert('customers', { name: customerSearch.trim(), phone: null }, isDemo);
      setSelectedCust(newCust);
      setShowCustDrop(false);
      setTimeout(() => phoneInputRef.current?.focus(), 100);
    } catch (e: any) {
      toast('Lỗi thêm khách: ' + e.message, 'error');
    }
  }, [customerSearch, dbInsert, isDemo]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData?.items || []);
    const imgItem = items.find(i => i.type.startsWith('image/'));
    if (!imgItem) return;
    if (refImages.length >= 5) return;
    const file = imgItem.getAsFile();
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const b64 = ev.target?.result as string;
      setRefImages(imgs => imgs.length < 5 ? [...imgs, b64] : imgs);
    };
    reader.readAsDataURL(file);
    e.preventDefault();
  }, [refImages.length]);

  const hasKhac = services.includes('__khac__');

  return (
    <div className={`moverlay${open ? ' open' : ''}`} onClick={(e) => { if ((e.target as any).classList.contains('moverlay')) onClose(); }}>
      <div ref={modalRef} className="modal" style={{ maxHeight: '90dvh', display: 'flex', flexDirection: 'column' }} onPaste={handlePaste}>
        <div className="mhandle"></div>
        <div className="mhdr">
          <div className="mttl">{apptId ? 'Sửa lịch hẹn' : 'Đặt lịch hẹn'}</div>
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
                  placeholder="Tìm khách hoặc walk-in..." 
                  value={customerSearch}
                  onChange={(e) => handleSearchCust(e.target.value)}
                  onFocus={() => setShowCustDrop(customerSearch.length > 0)}
                />
                {showCustDrop && (
                  <div className="ac-drop open">
                    <div className="ac-item ac-walkin" onClick={() => handleSelectCust({ name: customerSearch, isWalkin: true })}>
                      🚶 Walk-in: "{customerSearch}"
                    </div>
                    {filteredCusts.map((c: any) => (
                      <div key={c.id} className="ac-item" onClick={() => handleSelectCust(c)}>
                        <div style={{ fontSize: '14px', fontWeight: 600 }}>{c.name}</div>
                        <div style={{ fontSize: '12px', color: 'var(--ink4)' }}>{c.phone || ''}</div>
                      </div>
                    ))}
                    {!hasExactMatch && customerSearch.trim() && (
                      <div className="ac-item ac-add" onClick={handleQuickAddCust}>
                        ➕ Thêm mới: "{customerSearch}"
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

          <div className="fg">
            <label className="flbl">Số điện thoại</label>
            <input ref={phoneInputRef} className="fc" type="tel" placeholder="09xx xxx xxx" value={phone} onChange={e => setPhone(e.target.value)} />
          </div>

          <div className="fg">
            <label className="flbl">Số khách</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                style={{ width: 32, height: 32, borderRadius: 8, border: '1.5px solid var(--bdr)', background: 'var(--bg2)', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                onClick={() => setGroupSize(s => Math.max(1, s - 1))}
              >−</button>
              <span style={{ minWidth: 28, textAlign: 'center', fontSize: 16, fontWeight: 600 }}>{groupSize}</span>
              <button
                type="button"
                style={{ width: 32, height: 32, borderRadius: 8, border: '1.5px solid var(--bdr)', background: 'var(--bg2)', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                onClick={() => setGroupSize(s => Math.min(20, s + 1))}
              >+</button>
              {groupSize > 1 && <span style={{ fontSize: 12, color: 'var(--ink4)' }}>người</span>}
            </div>
          </div>

          {members.filter((m: any) => !m.is_hidden).length > 0 && (
            <div className="fg">
              <label className="flbl">Nhân viên phụ trách</label>
              <select className="fc" value={staffName} onChange={e => setStaffName(e.target.value)}>
                <option value="">— Chọn nhân viên —</option>
                {members.filter((m: any) => !m.is_hidden).map((m: any) => (
                  <option key={m.id} value={m.displayName || m.name}>{m.displayName || m.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="fg">
            <label className="flbl">Ngày <span className="req">*</span></label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '6px' }}>
              {DAY_SHORTCUTS.map(s => {
                const val = s.getDate();
                return (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => setDate(val)}
                    style={{
                      padding: '4px 8px',
                      borderRadius: 6,
                      border: '1.5px solid ' + (date === val ? 'var(--brand)' : 'var(--bdr)'),
                      background: date === val ? 'var(--brand)' : 'var(--bg2)',
                      color: date === val ? '#fff' : 'var(--ink2)',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >{s.label}</button>
                );
              })}
            </div>
            <input className="fc" type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>

          <div className="fg">
            <label className="flbl">Giờ <span className="req">*</span></label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '6px' }}>
              {TIME_SHORTCUTS.map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTime(t)}
                  style={{
                    padding: '4px 8px',
                    borderRadius: 6,
                    border: '1.5px solid ' + (time === t ? 'var(--brand)' : 'var(--bdr)'),
                    background: time === t ? 'var(--brand)' : 'var(--bg2)',
                    color: time === t ? '#fff' : 'var(--ink2)',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >{t.replace(':00', 'h').replace(':30', 'h30')}</button>
              ))}
            </div>
            <input className="fc" type="time" value={time} onChange={e => setTime(e.target.value)} />
          </div>

          <div className="fg">
            <label className="flbl">Dịch vụ</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
              {services.map((s, i) => (
                <div key={i} className="chip on" style={{ display: 'flex', alignItems: 'center', gap: '4px', paddingRight: '4px' }}>
                  {s === '__khac__' ? 'Khác...' : s}
                  <button style={{ background: 'none', border: 'none', color: 'inherit', display: 'flex', padding: '2px' }} onClick={() => setServices(services.filter((_, idx) => idx !== i))}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                  </button>
                </div>
              ))}
            </div>
            
            <select className="fc" onChange={handleAddSvc} defaultValue="">
              <option value="" disabled>+ Thêm dịch vụ...</option>
              {(cache.catalog || []).map((c: any) => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
              <option value="__khac__">Khác (tự điền)</option>
            </select>

            {hasKhac && (
              <div style={{ marginTop: '8px' }}>
                <div style={{ background: 'var(--bg3)', borderRadius: '10px', padding: '10px 12px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink3)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '.03em' }}>Dịch vụ Khác — tự điền</div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input type="text" placeholder="Tên dịch vụ..." style={{ flex: 2, padding: '7px 10px', border: '1.5px solid var(--bdr)', borderRadius: '8px', fontSize: '13px', outline: 'none' }} value={customSvcName} onChange={e => setCustomSvcName(e.target.value)} />
                    <input type="number" placeholder="Giá (đ)" style={{ width: '90px', padding: '7px 10px', border: '1.5px solid var(--bdr)', borderRadius: '8px', fontSize: '13px', outline: 'none' }} value={customSvcPrice} onChange={e => setCustomSvcPrice(e.target.value)} />
                    <button style={{ padding: '7px 12px', background: 'var(--brand)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }} onClick={handleAddCustomSvc}>+</button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="fg">
            <label className="flbl">Hình mẫu đặt</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
              {refImages.map((src, i) => (
                <div key={i} style={{ position: 'relative', flexShrink: 0 }}>
                  <img src={src} alt={`mẫu ${i + 1}`} style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--bdr)', display: 'block' }} />
                  <button
                    style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', background: 'var(--red, #ef4444)', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, padding: 0 }}
                    onClick={() => setRefImages(imgs => imgs.filter((_, j) => j !== i))}
                  >×</button>
                </div>
              ))}
              {refImages.length < 5 && (
                <label style={{ width: 72, height: 72, borderRadius: 8, border: '2px dashed var(--bdr2, #ddd)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--ink4)', fontSize: 28, flexShrink: 0 }}>
                  +
                  <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleRefImages} />
                </label>
              )}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--ink4)', marginTop: '2px' }}>Lưu ảnh mẫu từ IG/FB rồi nhấn + · Ctrl+V để dán (PC/Android)</div>
          </div>
          
          <div className="fg"><label className="flbl">Ghi chú</label><textarea className="fc" rows={2} placeholder="Yêu cầu đặc biệt..." value={notes} onChange={e => setNotes(e.target.value)}></textarea></div>
        </div>
        
        <div className="mfoot">
          <button className="btn outline" style={{ flex: 1 }} onClick={onClose} disabled={saving}>Huỷ</button>
          <button className="btn brand" style={{ flex: 2 }} onClick={handleSave} disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu lịch hẹn'}</button>
        </div>
      </div>
    </div>
  );
};
