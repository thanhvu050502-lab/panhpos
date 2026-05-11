import React, { useState, useEffect } from 'react';
import { CustomerModal } from './CustomerModal';
import { OrderModal } from './OrderModal';
import { PaymentModal } from './PaymentModal';
import { OrderDetailModal } from './OrderDetailModal';
import { ApptModal } from './ApptModal';
import { CustomerProfileModal } from './CustomerProfileModal';

declare global {
  interface Window {
    openModal?: (id: string, entityId?: string) => void;
    closeModal?: (id?: string) => void;
    _orderState?: any;
  }
}

const MODAL_EXIT_MS = 300;

export const Modals: React.FC = () => {
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | undefined>(undefined);
  const [isClosing, setIsClosing] = useState(false);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const performUnmount = React.useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setActiveModal(null);
    setEditId(undefined);
    setIsClosing(false);
  }, []);

  const startClose = React.useCallback(() => {
    if (closeTimer.current) return;
    setIsClosing(true);
    closeTimer.current = setTimeout(() => {
      setActiveModal(null);
      setEditId(undefined);
      setIsClosing(false);
      closeTimer.current = null;
    }, MODAL_EXIT_MS);
  }, []);

  useEffect(() => {
    window.openModal = (id: string, entityId?: string) => {
      // Cancel any pending close so we don't unmount the freshly-opened modal.
      if (closeTimer.current) {
        clearTimeout(closeTimer.current);
        closeTimer.current = null;
      }
      setIsClosing(false);
      setEditId(entityId);
      setActiveModal(id);
    };
    window.closeModal = (id?: string) => {
      setActiveModal((current) => {
        if (!id || !current || current === id) {
          startClose();
        }
        return current;
      });
    };
    return () => {
      window.openModal = undefined;
      window.closeModal = undefined;
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, [startClose]);

  if (!activeModal) return null;

  const open = !isClosing;

  if (activeModal === 'orderModal') return <OrderModal open={open} onClose={startClose} apptId={editId} />;
  if (activeModal === 'payModal') {
    return (
      <PaymentModal
        open={open}
        onClose={startClose}
        orderState={window._orderState || {}}
        onSuccess={() => {
          // Payment success path: snap-close without exit animation so the success toast lands cleanly.
          performUnmount();
        }}
      />
    );
  }
  if (activeModal === 'orderDetailModal') return <OrderDetailModal open={open} onClose={startClose} orderId={editId} />;
  if (activeModal === 'apptModal') return <ApptModal open={open} onClose={startClose} apptId={editId} />;
  if (activeModal === 'custModal') return <CustomerModal open={open} onClose={startClose} editId={editId} />;
  if (activeModal === 'custProfileModal') return <CustomerProfileModal open={open} onClose={startClose} customerId={editId} />;

  return null;
};
