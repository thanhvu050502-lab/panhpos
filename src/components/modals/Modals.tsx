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

export const Modals: React.FC = () => {
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | undefined>(undefined);

  useEffect(() => {
    window.openModal = (id: string, entityId?: string) => {
      setEditId(entityId);
      setActiveModal(id);
    };
    window.closeModal = (id?: string) => {
      setActiveModal((current) => {
        if (!id || !current || current === id) {
          setEditId(undefined);
          return null;
        }
        return current;
      });
    };
    return () => {
      window.openModal = undefined;
      window.closeModal = undefined;
    };
  }, []);

  if (!activeModal) return null;

  const closeCurrent = () => {
    setActiveModal(null);
    setEditId(undefined);
  };

  if (activeModal === 'orderModal') return <OrderModal onClose={closeCurrent} apptId={editId} />;
  if (activeModal === 'payModal') {
    return (
      <PaymentModal
        onClose={closeCurrent}
        orderState={window._orderState || {}}
        onSuccess={() => {
          closeCurrent();
        }}
      />
    );
  }
  if (activeModal === 'orderDetailModal') return <OrderDetailModal onClose={closeCurrent} orderId={editId} />;
  if (activeModal === 'apptModal') return <ApptModal onClose={closeCurrent} apptId={editId} />;
  if (activeModal === 'custModal') return <CustomerModal onClose={closeCurrent} editId={editId} />;
  if (activeModal === 'custProfileModal') return <CustomerProfileModal onClose={closeCurrent} customerId={editId} />;

  return null;
};
