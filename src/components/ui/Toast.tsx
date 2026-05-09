import React, { useState, useEffect } from 'react';
import { cn } from '../../lib/utils';

type ToastType = 'success' | 'error' | 'info' | '';

interface ToastMessage {
  id: number;
  msg: string;
  type: ToastType;
}

let toastCounter = 0;
let toasts: ToastMessage[] = [];
let listeners: ((toasts: ToastMessage[]) => void)[] = [];

// Retains exact same global API function as original
export const toast = (msg: string, type: ToastType = '', dur: number = 2800) => {
  const id = ++toastCounter;
  toasts = [...toasts, { id, msg, type }];
  listeners.forEach(l => l(toasts));

  setTimeout(() => {
    toasts = toasts.filter(t => t.id !== id);
    listeners.forEach(l => l(toasts));
  }, dur + 300);
};

export const ToastProvider: React.FC = () => {
  const [activeToasts, setActiveToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const listener = (newToasts: ToastMessage[]) => setActiveToasts(newToasts);
    listeners.push(listener);
    return () => {
      listeners = listeners.filter(l => l !== listener);
    };
  }, []);

  return (
    <div id="toasts">
      {activeToasts.map(t => {
        const typeClass = t.type === 'success' ? 'ok' : t.type === 'error' ? 'err' : t.type === 'info' ? 'inf' : '';
        return (
          <div key={t.id} className={cn('toast', typeClass)}>
            {t.msg}
          </div>
        );
      })}
    </div>
  );
};
