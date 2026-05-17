import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useLang } from '../../contexts/LangContext';
import { AccountManagementPanel } from './AccountManagementPanel';

import { AppInfoPanel } from './AppInfoPanel';
import { CaPanel, PMPanel, CatalogPanel, PromoPanel, GroupsPanel, AppearancePanel, ReminderPanel, DataPanel, AuditLogPanel, CancelReasonsPanel } from './OtherPanels';

export const SettingsScreen: React.FC = () => {
  const { session } = useAuth();
  const { t } = useLang();
  const [activePanel, setActivePanel] = useState<string | null>(null);

  const isOwner = session?.role === 'owner' || session?.role === 'admin';

  if (!session) {
    return null;
  }

  const openPanel = (panelId: string) => {
    setActivePanel(panelId);
  };

  const closePanel = () => {
    setActivePanel(null);
  };

  const renderPanelContent = () => {
    switch (activePanel) {
      case 'accounts':
        return isOwner ? <AccountManagementPanel onClose={closePanel} /> : null;
      case 'appInfo':
        return <AppInfoPanel />;
      case 'ca':
        return <CaPanel />;
      case 'pm':
        return <PMPanel />;
      case 'catalog':
        return <CatalogPanel />;
      case 'promo':
        return <PromoPanel />;
      case 'groups':
        return <GroupsPanel />;
      case 'appearance':
        return <AppearancePanel />;
      case 'reminders':
        return <ReminderPanel />;
      case 'cancelReasons':
        return isOwner ? <CancelReasonsPanel /> : null;
      case 'data':
        return isOwner ? <DataPanel /> : null;
      case 'auditlog':
        return isOwner ? <AuditLogPanel /> : null;
      default:
        return null;
    }
  };

  const panelTitle = {
    accounts: t('Tài khoản & phân quyền'),
    appInfo: t('Thông tin app'),
    ca: t('Ca làm việc'),
    pm: t('Phương thức thanh toán'),
    catalog: t('Danh mục dịch vụ'),
    promo: t('Khuyến mãi'),
    groups: t('Nhóm khách hàng'),
    appearance: t('Giao diện & Ngôn ngữ'),
    reminders: t('Nhắc lịch hẹn'),
    cancelReasons: t('Lý do hủy đơn'),
    data: t('Dữ liệu & kết nối'),
    auditlog: t('Nhật ký hoạt động'),
  }[activePanel || ''] || '';

  return (
    <div className="screen active">
      <div className="shd">
        <h3>{t('Cài đặt')}</h3>
      </div>
      <div className="card" style={{ marginBottom: '14px' }}>
        <div className="lrow tap" onClick={() => openPanel('appInfo')}>
          <div className="av" style={{ background: 'var(--blue-l)', color: 'var(--blue)', borderRadius: '10px' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
          </div>
          <div className="lrow-info"><div className="lrow-ttl">{t('Thông tin app')}</div></div>
          <span style={{ color: 'var(--ink4)', fontSize: '18px', flexShrink: 0 }}>›</span>
        </div>
        <div className="lrow tap" onClick={() => openPanel('ca')}>
          <div className="av" style={{ background: '#FFFBEB', color: '#D97706', borderRadius: '10px' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </div>
          <div className="lrow-info"><div className="lrow-ttl">{t('Ca làm việc')}</div></div>
          <span style={{ color: 'var(--ink4)', fontSize: '18px', flexShrink: 0 }}>›</span>
        </div>
        <div className="lrow tap" onClick={() => openPanel('pm')}>
          <div className="av" style={{ background: '#F0FDF4', color: '#16A34A', borderRadius: '10px' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/></svg>
          </div>
          <div className="lrow-info"><div className="lrow-ttl">{t('Phương thức thanh toán')}</div></div>
          <span style={{ color: 'var(--ink4)', fontSize: '18px', flexShrink: 0 }}>›</span>
        </div>
        <div className="lrow tap" onClick={() => openPanel('catalog')}>
          <div className="av" style={{ background: 'var(--brand-l)', color: 'var(--brand)', borderRadius: '10px' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
          </div>
          <div className="lrow-info"><div className="lrow-ttl">{t('Danh mục dịch vụ')}</div></div>
          <span style={{ color: 'var(--ink4)', fontSize: '18px', flexShrink: 0 }}>›</span>
        </div>
        <div className="lrow tap" onClick={() => openPanel('promo')}>
          <div className="av" style={{ background: '#FCF0F5', color: '#C9477A', borderRadius: '10px' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="9" r="2"/><circle cx="15" cy="15" r="2"/><path d="m21 3-6 6"/><path d="m3 21 6-6"/></svg>
          </div>
          <div className="lrow-info"><div className="lrow-ttl">{t('Khuyến mãi')}</div></div>
          <span style={{ color: 'var(--ink4)', fontSize: '18px', flexShrink: 0 }}>›</span>
        </div>
        <div className="lrow tap" onClick={() => openPanel('groups')}>
          <div className="av" style={{ background: '#EFF6FF', color: '#2563EB', borderRadius: '10px' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
          <div className="lrow-info"><div className="lrow-ttl">{t('Nhóm khách hàng')}</div></div>
          <span style={{ color: 'var(--ink4)', fontSize: '18px', flexShrink: 0 }}>›</span>
        </div>

        {isOwner && (
          <div className="lrow tap" onClick={() => openPanel('cancelReasons')}>
            <div className="av" style={{ background: '#FEF2F2', color: '#DC2626', borderRadius: '10px' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            </div>
            <div className="lrow-info"><div className="lrow-ttl">{t('Lý do hủy đơn')}</div></div>
            <span style={{ color: 'var(--ink4)', fontSize: '18px', flexShrink: 0 }}>›</span>
          </div>
        )}

        {isOwner && (
          <div className="lrow tap" onClick={() => openPanel('accounts')}>
            <div className="av" style={{ background: '#f5f3ff', color: '#7c3aed', borderRadius: '10px' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </div>
            <div className="lrow-info">
              <div className="lrow-ttl">{t('Tài khoản & phân quyền')}</div>
            </div>
            <span style={{ color: 'var(--ink4)', fontSize: '18px', flexShrink: 0 }}>›</span>
          </div>
        )}

        <div className="lrow tap" onClick={() => openPanel('appearance')}>
          <div className="av" style={{ background: '#111', color: '#FFF', borderRadius: '10px' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          </div>
          <div className="lrow-info"><div className="lrow-ttl">{t('Giao diện & Ngôn ngữ')}</div></div>
          <span style={{ color: 'var(--ink4)', fontSize: '18px', flexShrink: 0 }}>›</span>
        </div>

        <div className="lrow tap" onClick={() => openPanel('reminders')}>
          <div className="av" style={{ background: '#FFFBEB', color: '#D97706', borderRadius: '10px' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          </div>
          <div className="lrow-info"><div className="lrow-ttl">{t('Nhắc lịch hẹn')}</div></div>
          <span style={{ color: 'var(--ink4)', fontSize: '18px', flexShrink: 0 }}>›</span>
        </div>

        {isOwner && (
          <div className="lrow tap" onClick={() => openPanel('data')}>
            <div className="av" style={{ background: '#EFF6FF', color: '#2563EB', borderRadius: '10px' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="21 15 21 21 3 21 3 15"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </div>
            <div className="lrow-info"><div className="lrow-ttl">{t('Dữ liệu & kết nối')}</div></div>
            <span style={{ color: 'var(--ink4)', fontSize: '18px', flexShrink: 0 }}>›</span>
          </div>
        )}

        {isOwner && (
          <div className="lrow tap" onClick={() => openPanel('auditlog')}>
            <div className="av" style={{ background: '#F5F3FF', color: '#7C3AED', borderRadius: '10px' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            </div>
            <div className="lrow-info"><div className="lrow-ttl">{t('Nhật ký hoạt động')}</div></div>
            <span style={{ color: 'var(--ink4)', fontSize: '18px', flexShrink: 0 }}>›</span>
          </div>
        )}
      </div>

      {activePanel && (
        <div className="moverlay open" onClick={(e) => { if ((e.target as any).classList.contains('moverlay')) closePanel() }}>
          <div className="modal" style={{ maxHeight: '90dvh', display: 'flex', flexDirection: 'column' }}>
            <div className="mhandle"></div>
            <div className="mhdr">
              <button className="mclose" onClick={closePanel} style={{ marginRight: 'auto', marginLeft: 0 }}>‹</button>
              <div className="mttl" style={{ flex: 1, textAlign: 'center' }}>{panelTitle}</div>
              <div style={{ width: 28 }}></div>
            </div>
            {renderPanelContent()}
          </div>
        </div>
      )}
    </div>
  );
};
