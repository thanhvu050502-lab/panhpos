import React from 'react';
import { cn } from '../../lib/utils';

export interface ModalProps {
  id?: string;
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string; // used for custom max-height etc on .modal
}

export const Modal: React.FC<ModalProps> = ({
  id,
  isOpen,
  onClose,
  title,
  children,
  footer,
  className
}) => {
  const [shouldRender, setShouldRender] = React.useState(isOpen);

  React.useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      return;
    }
    const t = setTimeout(() => setShouldRender(false), 300);
    return () => clearTimeout(t);
  }, [isOpen]);

  if (!shouldRender) return null;

  return (
    <div
      className={cn("moverlay", isOpen && "open")}
      id={id}
      onClick={(e) => {
        // Close on overlay click
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={cn("modal", className)}>
        <div className="mhandle"></div>
        <div className="mhdr">
          <div className="mttl">{title}</div>
          <button className="mclose" onClick={onClose}>×</button>
        </div>
        <div className="mbody">
          {children}
        </div>
        {footer && (
          <div className="mfoot">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
