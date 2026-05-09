/** Shared types for payment counter / open bills (alerts). */

export interface PaymentAlertOrderItem {
  id: number;
  product: number | null;
  product_item: number | null;
  comboset: number | null;
  price: string | number;
  quantity: string | number;
  total: string | number;
  line_label?: string;
  line_image?: string | null;
}

export interface StaffPaymentRecordRow {
  id: number;
  amount: string | number;
  channel: string;
  recorded_by: number | null;
  recorded_by_name: string | null;
  created_at: string;
}

export interface PaymentAlertOrder {
  id: number;
  order_id: string;
  customer: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  guest_customer_name: string;
  guest_customer_phone: string;
  restaurant: number;
  restaurant_name: string;
  table: number | null;
  table_name: string | null;
  table_image?: string | null;
  order_type: string;
  address: string;
  last_reported_latitude: string | number | null;
  last_reported_longitude: string | number | null;
  last_reported_at: string | null;
  proximity_unpaid_alert_at: string | null;
  status: string;
  payment_status: string;
  payment_method: string;
  amount_paid?: string | number;
  amount_remaining?: string | number;
  staff_payment_records?: StaffPaymentRecordRow[];
  people_for: number;
  sub_total: string | number;
  discount: string | number;
  delivery_fee: string | number;
  total: string | number;
  items: PaymentAlertOrderItem[];
  created_at: string;
  bill_available?: boolean;
  updated_at?: string;
}
