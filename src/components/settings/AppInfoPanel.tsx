import React from 'react';
import { toast } from '../ui/Toast';

export const AppInfoPanel: React.FC = () => {
  return (
    <div style={{ padding: '16px', overflowY: 'auto', flex: 1 }}>
      <div className="fg"><label className="flbl">Tên app</label><input className="fc" id="panelAppName" defaultValue="NailPOS" placeholder="NailPOS" /></div>
      <div className="fg"><label className="flbl">Prefix đơn hàng</label><input className="fc" id="panelOrderPrefix" defaultValue="ORD" placeholder="ORD" /></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div className="fg"><label className="flbl">Prefix KH</label><input className="fc" id="panelCustPrefix" defaultValue="KH" placeholder="KH" /></div>
        <div className="fg"><label className="flbl">Prefix DV</label><input className="fc" id="panelSvcPrefix" defaultValue="SVC" placeholder="SVC" /></div>
      </div>
      <div className="fg" style={{ marginTop: '8px' }}>
        <div className="srow" style={{ padding: 0 }}>
          <div><div className="slbl">Group Order</div><div className="ssub">Số dịch vụ × số lượng khách</div></div>
          <label className="tgl"><input type="checkbox" id="panelGroupOrder" /><div className="tgl-sl"></div></label>
        </div>
      </div>
      <button className="btn brand full" style={{ marginTop: '16px' }} onClick={() => toast('Đã lưu thiết lập!', 'success')}>Lưu thay đổi</button>
    </div>
  );
};
