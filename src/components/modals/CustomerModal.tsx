import React, { useState, useEffect } from 'react';
import { useCache } from '../../hooks/useCache';
import { toast } from '../ui/Toast';

export const CustomerModal: React.FC<{
  onClose: () => void;
  editId?: string;
  open?: boolean;
}> = ({ onClose, editId, open = true }) => {
  const { cache, dbInsert, dbUpdate } = useCache();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [groupId, setGroupId] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editId) {
      const c = cache.customers?.find((x: any) => x.id === editId);
      if (c) {
        setName(c.name || '');
        setPhone(c.phone || '');
        setGroupId(c.group_id || '');
        setNotes(c.notes || '');
      }
    }
  }, [editId, cache.customers]);

  const saveCust = async () => {
    if (saving) return;
    if (!name.trim()) {
      toast('Vui lòng nhập tên khách hàng', 'error');
      return;
    }
    setSaving(true);
    const isDemo = !!localStorage.getItem('np_demo');
    try {
      if (editId) {
        await dbUpdate('customers', editId, { name, phone, group_id: groupId || null, notes }, isDemo);
      } else {
        await dbInsert('customers', { name, phone, group_id: groupId || null, notes }, isDemo);
      }
      toast(editId ? 'Đã cập nhật khách hàng' : 'Đã thêm khách hàng', 'success');
      onClose();
    } catch (e: any) {
      toast('Lỗi: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`moverlay${open ? ' open' : ''}`} onClick={(e) => { if ((e.target as HTMLElement).classList.contains('moverlay')) onClose(); }}>
      <div className="modal">
        <div className="mhandle"></div>
        <div className="mhdr">
          <div className="mttl">{editId ? 'Sửa khách hàng' : 'Thêm khách hàng'}</div>
          <button className="mclose" onClick={onClose}>×</button>
        </div>
        <div className="mbody">
          <div className="fg">
            <label className="flbl">Tên <span className="req">*</span></label>
            <input className="fc" placeholder="Nguyễn Thị Lan" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="fg">
            <label className="flbl">Số điện thoại</label>
            <input className="fc" type="tel" placeholder="09xx xxx xxx" value={phone} onChange={e => setPhone(e.target.value)} />
          </div>
          <div className="fg">
            <label className="flbl">Nhóm khách hàng</label>
            <select className="fc" value={groupId} onChange={e => setGroupId(e.target.value)}>
              <option value="">Không có nhóm</option>
              {cache.groups?.map((g: any) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
          <div className="fg">
            <label className="flbl">Ghi chú</label>
            <textarea className="fc" placeholder="Sở thích màu, dị ứng..." rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>
        <div className="mfoot">
          <button className="btn outline" style={{ flex: 1 }} onClick={onClose} disabled={saving}>Huỷ</button>
          <button className="btn brand" style={{ flex: 2 }} onClick={saveCust} disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu'}</button>
        </div>
      </div>
    </div>
  );
};
