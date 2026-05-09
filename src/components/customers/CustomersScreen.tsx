import React, { useState } from 'react';
import { useCache } from '../../hooks/useCache';
import { useLang } from '../../contexts/LangContext';
import { Avatar } from '../ui/Avatar';

export const CustomersScreen: React.FC = () => {
  const { cache } = useCache();
  const { t } = useLang();
  const [search, setSearch] = useState('');

  let custs = [...(cache.customers || [])];
  
  if (search) {
    const q = search.toLowerCase();
    custs = custs.filter((c: any) => 
      (c.name || '').toLowerCase().includes(q) || 
      (c.phone || '').includes(q)
    );
  }

  const renderList = () => {
    if (!custs.length) {
      return (
        <div className="card">
          <div className="empty">
            <div className="empty-ico">👥</div>
            <div className="empty-ttl">{t('Không tìm thấy khách hàng')}</div>
            <div className="empty-sub">{t('Nhấn + để thêm mới')}</div>
          </div>
        </div>
      );
    }

    return (
      <div className="card">
        {custs.map((c: any) => (
          <div key={c.id} className="lrow tap" onClick={() => (window as any).openModal?.('custProfileModal', c.id)}>
            <Avatar name={c.name} size={38} />
            <div className="lrow-info">
              <div className="lrow-ttl">{c.name}</div>
              <div className="lrow-sub">
                {c.phone || 'Chưa có SĐT'} • {c.group_id ? 'Nhóm khách hàng' : 'Khách vãng lai'}
              </div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink4)" strokeWidth="2" style={{ flexShrink: 0 }}>
              <path d="m9 18 6-6-6-6" />
            </svg>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="screen active">
      <div style={{ position: 'relative', marginBottom: '10px' }}>
        <svg style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--ink4)' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <input 
          className="fc" 
          style={{ paddingLeft: '38px' }} 
          type="search" 
          placeholder={t('Tìm khách hàng...')}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      {renderList()}
    </div>
  );
};
