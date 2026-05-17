import React, { useState } from 'react';
import { toast } from '../ui/Toast';

const CHAIRS_KEY = 'np_total_chairs';

export const AppInfoPanel: React.FC = () => {
  const [chairs, setChairs] = useState<string>(() => localStorage.getItem(CHAIRS_KEY) || '');

  const handleSave = () => {
    const n = parseInt(chairs);
    if (chairs && (Number.isNaN(n) || n < 0)) {
      toast('Số ghế không hợp lệ', 'error');
      return;
    }
    if (chairs && n > 0) {
      localStorage.setItem(CHAIRS_KEY, String(n));
    } else {
      localStorage.removeItem(CHAIRS_KEY);
    }
    toast('Đã lưu thiết lập!', 'success');
  };

  return (
    <div style={{ padding: '16px', overflowY: 'auto', flex: 1 }}>
      <div className="fg"><label className="flbl">Tên app</label><input className="fc" id="panelAppName" defaultValue="NailPOS" placeholder="NailPOS" /></div>
      <div className="fg"><label className="flbl">Prefix đơn hàng</label><input className="fc" id="panelOrderPrefix" defaultValue="ORD" placeholder="ORD" /></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div className="fg"><label className="flbl">Prefix KH</label><input className="fc" id="panelCustPrefix" defaultValue="KH" placeholder="KH" /></div>
        <div className="fg"><label className="flbl">Prefix DV</label><input className="fc" id="panelSvcPrefix" defaultValue="SVC" placeholder="SVC" /></div>
      </div>
      <div className="fg">
        <label className="flbl">Số ghế phục vụ</label>
        <input className="fc" type="number" min="0" placeholder="Bỏ trống nếu không theo dõi" value={chairs} onChange={e => setChairs(e.target.value)} />
        <div style={{ fontSize: '11px', color: 'var(--ink4)', marginTop: '4px' }}>Dùng để tính công suất hiển thị trên Dashboard.</div>
      </div>
      <div className="fg" style={{ marginTop: '8px' }}>
        <div className="srow" style={{ padding: 0 }}>
          <div><div className="slbl">Group Order</div><div className="ssub">Số dịch vụ × số lượng khách</div></div>
          <label className="tgl"><input type="checkbox" id="panelGroupOrder" /><div className="tgl-sl"></div></label>
        </div>
      </div>
      <button className="btn brand full" style={{ marginTop: '16px' }} onClick={handleSave}>Lưu thay đổi</button>
    </div>
  );
};
