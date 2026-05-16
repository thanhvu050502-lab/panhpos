// Shape passed from OrderModal/OrderDetailModal → PaymentModal via window._orderState.
// Kept intentionally loose for fields we don't actually depend on downstream;
// the strict fields are the ones PaymentModal reads to build the DB rows.

export interface CartLine {
  catalog_id: string | null;
  name: string;
  price: number;
  quantity: number;
  variable_price?: boolean;
  is_combo?: boolean;
  combo_items?: unknown[];
}

export interface OrderStateCustomer {
  id?: string;
  name: string;
  isWalkin?: boolean;
}

export interface OrderState {
  customer: OrderStateCustomer | null;
  cart: CartLine[];
  promoId: string;
  discount: number;
  apptId: string | null;
  qty: number;
  notes: string;
  total: number;
  subtotal: number;
  staffName?: string | null;
  /** Set by OrderDetailModal when finishing a previously-saved pending order. */
  existingOrderId?: string;
}
