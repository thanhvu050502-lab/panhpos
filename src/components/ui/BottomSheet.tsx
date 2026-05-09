import React, { useEffect, useState } from 'react';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxHeight?: string;
  isNested?: boolean;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  maxHeight = '90dvh',
  isNested = false,
}) => {
  const [shouldRender, setShouldRender] = useState(isOpen);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
    } else {
      const timer = setTimeout(() => setShouldRender(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!shouldRender) return null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: isNested ? 600 : 500,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        opacity: isOpen ? 1 : 0,
        transition: 'opacity 0.3s cubic-bezier(0.32,0.72,0,1)',
      }}
    >
      <div
        style={{
          background: 'white',
          borderRadius: '20px 20px 0 0',
          maxHeight,
          display: 'flex',
          flexDirection: 'column',
          transform: isOpen ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.3s cubic-bezier(0.32,0.72,0,1)',
        }}
      >
        <div style={{ width: '36px', height: '4px', background: '#D4D4D4', borderRadius: '2px', margin: '10px auto 0', flexShrink: 0 }}></div>
        <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '10px', borderBottom: '1px solid #E7E5E4', flexShrink: 0 }}>
          <button
            onClick={onClose}
            style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#F5F5F4', fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer', color: '#404040' }}
          >
            ‹
          </button>
          <div style={{ fontSize: '16px', fontWeight: 700, flex: 1, textAlign: 'center', color: '#171717' }}>{title}</div>
          <div style={{ width: '32px', flexShrink: 0 }}></div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px', WebkitOverflowScrolling: 'touch' }}>
          {children}
        </div>
        {footer && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid #E7E5E4', display: 'flex', gap: '8px', flexShrink: 0, background: 'white' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
