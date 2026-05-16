import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { useLang } from '../../contexts/LangContext';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  confirmVariant?: 'brand' | 'danger';
}

interface ConfirmContextType {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextType | undefined>(undefined);

export const useConfirmAlert = () => {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error('useConfirmAlert must be used within ConfirmAlertProvider');
  }
  return context;
};

export const ConfirmAlertProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useLang();
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    setOptions(opts);
    setIsOpen(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const handleClose = (result: boolean) => {
    setIsOpen(false);
    if (resolver.current) {
      resolver.current(result);
    }
  };

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {isOpen && options && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClose(false);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 600,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            animation: 'fadeIn 0.2s',
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-alert-title"
            aria-describedby="confirm-alert-message"
            style={{
              background: 'white',
              borderRadius: '20px',
              padding: '24px',
              width: '100%',
              maxWidth: '320px',
              animation: 'scaleIn 0.2s',
            }}
          >
            <style>
              {`
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes scaleIn { from { transform: scale(0.95); } to { transform: scale(1); } }
              `}
            </style>
            <div id="confirm-alert-title" style={{ fontSize: '16px', fontWeight: 700, marginBottom: '8px', color: '#171717' }}>
              {options.title}
            </div>
            <div id="confirm-alert-message" style={{ fontSize: '14px', color: '#737373', lineHeight: 1.5, marginBottom: '20px' }}>
              {options.message}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => handleClose(false)}
                style={{
                  flex: 1,
                  height: '44px',
                  borderRadius: '10px',
                  border: '1.5px solid #D6D3D1',
                  background: 'white',
                  color: '#404040',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {t('Huỷ')}
              </button>
              <button
                onClick={() => handleClose(true)}
                style={{
                  flex: 1,
                  height: '44px',
                  borderRadius: '10px',
                  background: options.confirmVariant === 'danger' ? '#DC2626' : '#C9477A',
                  color: 'white',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {options.confirmLabel || t('Xác nhận')}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
};
