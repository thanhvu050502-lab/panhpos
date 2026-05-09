import React, { useMemo } from 'react';

interface HeaderProps {
  appName?: string;
  onLogout?: () => void;
  syncStatus?: 'on' | 'sy' | 'off'; // on (green), sy (amber), off (gray)
  onSearch?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  appName = 'anh.naillab',
  onLogout,
  syncStatus = 'off',
  onSearch,
}) => {
  const dateStr = useMemo(() => {
    const d = new Date();
    const thu = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][d.getDay()];
    const date = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `${thu}, ${date}`;
  }, []);

  return (
    <header className="hdr">
      <div className="hdr-logo" id="hdrLogo">
        <img 
          className="hdr-logo-img" 
          src="data:image/jpeg;base64,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" 
          alt="logo" 
        />
        <span id="hdrLogoText">{appName}</span>
      </div>
      <div id="hdrDate" style={{ fontSize: '12px', color: 'var(--ink3)', marginLeft: 'auto', marginRight: '8px', whiteSpace: 'nowrap' }}>
        {dateStr}
      </div>
      <div className={`sdot ${syncStatus}`} id="sdot" title="Trạng thái kết nối"></div>
      {onSearch && (
        <button
          onClick={onSearch}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
          title="Tìm kiếm"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ink3)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        </button>
      )}
      {onLogout && (
        <button 
          onClick={onLogout}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ink3)" strokeWidth="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      )}
    </header>
  );
};
