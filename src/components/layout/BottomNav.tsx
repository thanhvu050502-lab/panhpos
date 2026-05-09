import React from 'react';
import { cn } from '../../lib/utils';
import { useLang } from '../../contexts/LangContext';

interface BottomNavProps {
  currentScreen: string;
  onNavigate: (screen: string) => void;
  pendingCount?: number;
  todayRev?: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  currentScreen,
  onNavigate,
  pendingCount = 0,
  todayRev = 0,
}) => {
  const { t } = useLang();
  return (
    <nav className="bnav">
      <button className={cn("ntab", currentScreen === 'dash' && "on")} onClick={() => onNavigate('dash')}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
        <span>{t('Tổng quan')}</span>
      </button>
      <button className={cn("ntab", currentScreen === 'orders' && "on")} onClick={() => onNavigate('orders')}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/></svg>
        <span>{t('Đơn hàng')}</span>
        <div className={cn("nbadge", pendingCount > 0 && "on")}>{pendingCount > 0 ? pendingCount : ''}</div>
        {todayRev > 0 && (
          <div id="todayRevBadge" style={{ display: 'block', fontSize: '9px', fontWeight: 700, color: 'var(--green)', marginTop: '1px', lineHeight: 1 }}>
            {todayRev >= 1e6 ? (todayRev / 1e6).toFixed(1) + 'tr' : todayRev.toLocaleString('vi-VN') + 'đ'}
          </div>
        )}
      </button>
      <button className={cn("ntab", currentScreen === 'appt' && "on")} onClick={() => onNavigate('appt')}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><circle cx="8" cy="15" r="1" fill="currentColor"/><circle cx="12" cy="15" r="1" fill="currentColor"/><circle cx="16" cy="15" r="1" fill="currentColor"/></svg>
        <span>{t('Lịch hẹn')}</span>
      </button>
      <button className={cn("ntab", currentScreen === 'custs' && "on")} onClick={() => onNavigate('custs')}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/><path d="M16 3.13a4 4 0 0 1 0 7.75M21 21v-2a4 4 0 0 0-3-3.85"/></svg>
        <span>{t('Khách hàng')}</span>
      </button>
      <button className={cn("ntab", currentScreen === 'settings' && "on")} onClick={() => onNavigate('settings')}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14M12 2v2M12 20v2M2 12h2M20 12h2"/></svg>
        <span>{t('Cài đặt')}</span>
      </button>
    </nav>
  );
};
